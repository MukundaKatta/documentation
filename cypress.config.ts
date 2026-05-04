import {
	configureNextcloud,
	startNextcloud,
	stopNextcloud,
	waitOnNextcloud,
} from '@nextcloud/cypress/docker'
import { defineConfig } from 'cypress'
import { execSync } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import path from 'path'

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
const SEED_SQLITE_CACHE = path.join(require('os').tmpdir(), 'nc-screenshots-seed.sqlite')

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

	// Find the SQLite database file inside the container
	let dbPath: string
	try {
		dbPath = containerExec('find /var/www/html/data -maxdepth 1 -name "*.db"').trim()
	} catch {
		dbPath = '/var/www/html/data/nextcloud.db'
	}
	if (!dbPath) dbPath = '/var/www/html/data/nextcloud.db'

	console.log(`[seed] Injecting database into container (${dbPath})…`)
	execSync(`docker cp ${SEED_SQLITE_CACHE} ${CONTAINER_NAME}:/tmp/nc-seed.sqlite`)
	containerExec(`bash -c "cp /tmp/nc-seed.sqlite ${dbPath} && chown www-data:root ${dbPath} && chmod 640 ${dbPath}"`)

	// Ensure admin:admin exists (it won't be in the dump)
	console.log('[seed] Creating admin user…')
	try {
		containerExec('php occ user:add admin --password-from-env --display-name Admin', {
			user: 'www-data',
			env: { OC_PASS: 'admin' },
		})
	} catch {
		// User might already exist if the dump happens to have one
	}
	// Grant admin rights
	try {
		containerExec('php occ group:adduser admin admin', { user: 'www-data' })
	} catch { /* ignore if already in group */ }

	// Re-enable apps (the dump's oc_appconfig may have different app state)
	for (const app of SCREENSHOT_APPS) {
		try {
			containerExec(`php occ app:enable ${app}`, { user: 'www-data' })
		} catch { /* already enabled */ }
	}

	// Refresh the data fingerprint so NC accepts the new database
	containerExec('php occ maintenance:data-fingerprint', { user: 'www-data' })

	// Copy avatars into the container's data directory
	const avatarDir = path.join(SEED_DATA_PATH, 'avatar')
	if (existsSync(avatarDir)) {
		console.log('[seed] Copying avatars…')
		for (const username of readdirSync(avatarDir)) {
			const userAvatarPath = path.join(avatarDir, username)
			if (!statSync(userAvatarPath).isDirectory()) continue
			try {
				containerExec(`mkdir -p /var/www/html/data/${username}/avatars`)
				execSync(`docker cp ${userAvatarPath}/. ${CONTAINER_NAME}:/var/www/html/data/${username}/avatars/`)
				containerExec(`chown -R www-data:root /var/www/html/data/${username}/avatars/`)
			} catch (e) {
				console.warn(`[seed] Could not copy avatar for ${username}: ${e}`)
			}
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
			await injectSeedData()

			await configureNextcloud(SCREENSHOT_APPS)

			return config
		},
	},
})
