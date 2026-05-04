import {
	configureNextcloud,
	startNextcloud,
	stopNextcloud,
	waitOnNextcloud,
} from '@nextcloud/cypress/docker'
import { defineConfig } from 'cypress'
import { execFileSync, execSync } from 'child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import * as os from 'os'
import * as path from 'path'

// Port exposed to the host for the screenshot container.
// Choose something unlikely to conflict with the dev environment.
const SCREENSHOT_PORT = 8093

// Apps to enable. Must be in @nextcloud/cypress VENDOR_APPS (activity, viewer,
// notifications, text) or bundled in the server image. Anything else triggers
// occ app:install which requires app-store access and is slow.
const SCREENSHOT_APPS = [
	'activity',
	'comments',
	'notifications',
	'viewer',
]

// Optional path to seed data directory containing tp.sql and avatar/.
// Set SEED_DATA_PATH env var or place data at ~/Downloads/tp.
const SEED_DATA_PATH = process.env.SEED_DATA_PATH
	?? path.join(process.env.HOME ?? '', 'Downloads/tp')

// Converted SQLite is cached here so we only convert once per session.
const SEED_SQLITE_CACHE = path.join(os.tmpdir(), 'nc-screenshots-seed.sqlite')

// Docker container name is derived from the project directory name by @nextcloud/cypress.
const CONTAINER_NAME = `nextcloud-cypress-tests_${path.basename(process.cwd())}`

function containerExec(cmd: string, opts: { user?: string, env?: Record<string, string> } = {}): string {
	const userFlag = opts.user ? `-u ${opts.user}` : ''
	const envFlags = opts.env
		? Object.entries(opts.env).map(([k, v]) => `-e ${k}=${v}`).join(' ')
		: ''
	return execSync(`docker exec ${envFlags} ${userFlag} ${CONTAINER_NAME} ${cmd}`, { encoding: 'utf8' })
}

async function injectSeedData(): Promise<void> {
	if (!existsSync(SEED_DATA_PATH)) {
		console.log(`[seed] No seed data at ${SEED_DATA_PATH} — skipping`)
		return
	}

	const sqlFile = path.join(SEED_DATA_PATH, 'tp.sql')
	if (!existsSync(sqlFile)) {
		console.log(`[seed] tp.sql not found in ${SEED_DATA_PATH} — skipping`)
		return
	}

	// Convert dump to SQLite (cached across runs until the cache file is removed)
	if (!existsSync(SEED_SQLITE_CACHE)) {
		console.log('[seed] Converting MariaDB dump to SQLite (one-time, ~30 s)…')
		execSync(
			`python3 ${path.join(__dirname, 'scripts/mysql2sqlite.py')} ${sqlFile} ${SEED_SQLITE_CACHE}`,
			{ stdio: 'inherit' },
		)
	}

	// Find the SQLite database file inside the container.
	// Use split('\n')[0] in case find returns multiple matches.
	let dbPath: string
	try {
		const found = containerExec('find /var/www/html/data -maxdepth 1 -name "*.db" 2>/dev/null').trim()
		dbPath = found.split('\n')[0].trim() || '/var/www/html/data/nextcloud.db'
	} catch {
		dbPath = '/var/www/html/data/nextcloud.db'
	}
	console.log(`[seed] Container DB path: ${dbPath}`)

	// Before replacing the DB, extract the fresh container DB so we can
	// copy the admin user (with its NC-generated password hash) into the seed.
	// This avoids any dependency on `occ user:add` working after DB replacement.
	// docker cp cannot read from tmpfs mounts (which is what the NC CI container
	// uses for /var/www/html/data). Stream via shell redirection instead.
	console.log('[seed] Extracting admin credentials from fresh container DB…')
	const FRESH_DB_HOST = path.join(os.tmpdir(), 'nc-fresh-admin.db')
	execSync(`docker exec ${CONTAINER_NAME} cat ${dbPath} > ${FRESH_DB_HOST}`, { shell: '/bin/bash' })

	// Patch the seed SQLite with admin user + group membership from the fresh DB,
	// so login works without needing occ user:add after DB replacement.
	// Run a tiny Python script so we don't have to shell-escape SQL.
	execSync(`python3 - <<'PYEOF'
import sqlite3, sys
fresh = sqlite3.connect(${JSON.stringify(FRESH_DB_HOST)})
seed  = sqlite3.connect(${JSON.stringify(SEED_SQLITE_CACHE)})
def copy_rows(table, where_col, where_val):
    rows = fresh.execute(f"SELECT * FROM {table} WHERE {where_col}=?", (where_val,)).fetchall()
    if not rows:
        return
    cols = [d[0] for d in fresh.execute(f"SELECT * FROM {table} LIMIT 0").description]
    ph   = ",".join("?" for _ in cols)
    for row in rows:
        seed.execute(f"INSERT OR REPLACE INTO {table} VALUES ({ph})", row)
copy_rows("oc_users",      "uid", "admin")
copy_rows("oc_group_user", "uid", "admin")
copy_rows("oc_groups",     "gid", "admin")
rows = fresh.execute("SELECT * FROM oc_users WHERE uid='admin'").fetchall()
if not rows:
    sys.exit("no admin row in fresh DB")
# Replace ALL oc_appconfig to avoid NC 33 entering "upgrade required" mode.
# Strategy:
#   - Apps present in fresh NC 33 DB → use NC 33 values
#   - Apps only in seed (NC 34 optional apps) → delete entirely so NC 33
#     can install them fresh without version conflicts
fresh_apps = {r[0] for r in fresh.execute("SELECT DISTINCT appid FROM oc_appconfig").fetchall()}
seed_apps  = {r[0] for r in seed.execute("SELECT DISTINCT appid FROM oc_appconfig").fetchall()}
cols = [d[0] for d in fresh.execute("SELECT * FROM oc_appconfig LIMIT 0").description]
ph   = ",".join("?" for _ in cols)
for app in seed_apps:
    seed.execute("DELETE FROM oc_appconfig WHERE appid=?", (app,))
for app in fresh_apps:
    for row in fresh.execute("SELECT * FROM oc_appconfig WHERE appid=?", (app,)).fetchall():
        seed.execute(f"INSERT OR REPLACE INTO oc_appconfig VALUES ({ph})", row)
seed.commit()
# Checkpoint WAL into main file so readFileSync gets a complete, self-contained DB
seed.execute("PRAGMA wal_checkpoint(FULL)")
seed.execute("PRAGMA journal_mode=DELETE")
seed.commit()
fresh.close(); seed.close()
PYEOF`, { stdio: 'inherit' })

	// Pipe the seed SQLite into the container via stdin — docker cp can't write
	// to tmpfs mounts, but `docker exec -i sh -c 'cat > file'` works fine.
	console.log(`[seed] Injecting database into container (${dbPath})…`)
	execFileSync('docker', ['exec', '-i', CONTAINER_NAME, 'sh', '-c', `cat > ${dbPath} && chown www-data:root ${dbPath} && chmod 640 ${dbPath}`], { input: readFileSync(SEED_SQLITE_CACHE) })

	// Re-enable apps (the dump's oc_appconfig may differ)
	for (const app of SCREENSHOT_APPS) {
		try {
			containerExec(`php /var/www/html/occ app:enable ${app}`, { user: 'www-data' })
		} catch { /* already enabled */ }
	}

	// Refresh the data fingerprint so NC accepts the restored database
	containerExec('php /var/www/html/occ maintenance:data-fingerprint', { user: 'www-data' })

	// Force sharing config — seeded DB is from NC 34 and may have app config
	// values that NC 33 misinterprets, causing share link creation to return 403
	containerExec('php /var/www/html/occ config:app:set core shareapi_allow_links --value yes', { user: 'www-data' })
	containerExec('php /var/www/html/occ config:app:set core shareapi_enabled --value yes', { user: 'www-data' })

	// Re-scan admin's files so oc_filecache has fresh entries with correct permissions.
	// Without this, the seeded DB may leave admin's filecache in an inconsistent state
	// that causes the sharing API to return 403.
	console.log('[seed] Scanning admin files…')
	containerExec('php /var/www/html/occ files:scan admin', { user: 'www-data' })

	// Copy avatars into the container's data directory.
	// NC stores custom avatars directly as data/{userid}/avatar.{size}.png — no subdirectory.
	// Pipe tar via shell to avoid buffering 15MB in Node.js (execFileSync ENOBUFS).
	const avatarDir = path.join(SEED_DATA_PATH, 'avatar')
	if (existsSync(avatarDir)) {
		console.log('[seed] Copying avatars…')
		try {
			execSync(
				`tar cf - -C "${avatarDir}" . | docker exec -i ${CONTAINER_NAME} sh -c "tar xf - -C /var/www/html/data/ && chown -R www-data:root /var/www/html/data/"`,
				{ shell: '/bin/bash' },
			)
		} catch (e) {
			console.warn('[seed] Avatar copy failed:', String(e).split('\n')[0])
		}
	}

	console.log('[seed] Seed data injection complete')
}

export default defineConfig({
	// 16:9, matches most documentation screenshot widths
	viewportWidth: 1280,
	viewportHeight: 720,

	requestTimeout: 20000,
	defaultCommandTimeout: 10000,

	retries: {
		runMode: 1,
		openMode: 0,
	},

	video: false,

	screenshotsFolder: 'cypress/snapshots',
	trashAssetsBeforeRuns: true,

	e2e: {
		async setupNodeEvents(on, config) {
			on('before:browser:launch', (browser, launchOptions) => {
				if (browser.family === 'chromium' && browser.name !== 'electron') {
					launchOptions.preferences.default['browser.enable_spellchecking'] = false
					return launchOptions
				}
				if (browser.family === 'firefox') {
					launchOptions.preferences['layout.spellcheckDefault'] = 0
					return launchOptions
				}
				if (browser.name === 'electron') {
					launchOptions.preferences.spellcheck = false
					return launchOptions
				}
			})

			on('after:run', () => {
				stopNextcloud()
			})

			// Start a clean stable33 container, isolated from the dev environment.
			// Use exposePort so we can reach it at localhost:PORT regardless of
			// Docker network topology (avoids the stats-vs-inspect IP detection bug).
			await startNextcloud('stable33', false, { exposePort: SCREENSHOT_PORT })
			config.baseUrl = `http://localhost:${SCREENSHOT_PORT}/index.php`
			await waitOnNextcloud(`localhost:${SCREENSHOT_PORT}`)

			// Inject pre-seeded data before configuring apps, so app state is
			// set correctly on top of the restored database.
			try {
				await injectSeedData()
			} catch (e) {
				console.error('[seed] Seed injection failed, continuing with fresh DB:', e)
			}

			await configureNextcloud(SCREENSHOT_APPS)

			return config
		},
	},
})
