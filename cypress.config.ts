import {
	configureNextcloud,
	startNextcloud,
	stopNextcloud,
	waitOnNextcloud,
} from '@nextcloud/cypress/docker'
import { defineConfig } from 'cypress'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import * as path from 'path'

// Port exposed to the host for the screenshot container.
const SCREENSHOT_PORT = 8093

// Apps to enable. Must be in @nextcloud/cypress VENDOR_APPS (activity, viewer,
// notifications, text) or bundled in the server image. Anything else triggers
// occ app:install which requires app-store access and is slow.
const CONTAINER_NAME = `nextcloud-cypress-tests_${path.basename(process.cwd())}`

function occ(cmd: string, env: Record<string, string> = {}): string {
	const envFlags = Object.entries(env).map(([k, v]) => `-e ${k}=${v}`).join(' ')
	return execSync(`docker exec -u www-data ${envFlags} ${CONTAINER_NAME} php /var/www/html/occ ${cmd}`, { encoding: 'utf8' })
}

const SCREENSHOT_APPS = [
	'activity',
	'calendar',
	'comments',
	'deck',
	'files_versions',
	'notes',
	'notifications',
	'tasks',
	'viewer',
]

export default defineConfig({
	// 16:10, common laptop resolution — enough height for dashboard widgets + Customise button
	viewportWidth: 1440,
	viewportHeight: 900,

	requestTimeout: 20000,
	defaultCommandTimeout: 10000,

	retries: {
		runMode: 1,
		openMode: 0,
	},

	video: false,

	screenshotsFolder: `${process.env.HOME}/Pictures/Screenshots/nextcloud-docs`,
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
					// Set the Electron window size — viewportWidth/Height alone isn't
					// respected in headless Electron; the BrowserWindow must be sized explicitly.
					launchOptions.preferences.width = 1440
					launchOptions.preferences.height = 900
					return launchOptions
				}
			})

			on('task', {
				occ: ({ cmd, env = {} }: { cmd: string, env?: Record<string, string> }) => occ(cmd, env),

				// Upload a local file to WebDAV in Node.js to avoid Cypress IPC
				// serialising Buffer objects as JSON (which breaks binary bodies).
				async uploadFile({ src, dest, user, password, mtime }: { src: string, dest: string, user: string, password: string, mtime?: number }) {
					const content = readFileSync(src)
					const credentials = Buffer.from(`${user}:${password}`).toString('base64')
					const url = `http://localhost:${SCREENSHOT_PORT}/remote.php/dav/files/${user}/${dest}`
					const headers: Record<string, string> = { Authorization: `Basic ${credentials}` }
					if (mtime) headers['X-OC-MTime'] = String(mtime)
					const res = await fetch(url, { method: 'PUT', headers, body: content })
					return res.status
				},

				async mkdavCol({ dest, user, password }: { dest: string, user: string, password: string }) {
					const credentials = Buffer.from(`${user}:${password}`).toString('base64')
					const url = `http://localhost:${SCREENSHOT_PORT}/remote.php/dav/files/${user}/${dest}`
					const res = await fetch(url, {
						method: 'MKCOL',
						headers: { Authorization: `Basic ${credentials}` },
					})
					return res.status
				},

				async uploadAvatar({ src, user, password }: { src: string, user: string, password: string }) {
					const content = readFileSync(src)
					const credentials = Buffer.from(`${user}:${password}`).toString('base64')
					const boundary = `----AvatarBoundary${Date.now()}`
					const body = Buffer.concat([
						Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\n`),
						content,
						Buffer.from(`\r\n--${boundary}--\r\n`),
					])
					const res = await fetch(`http://localhost:${SCREENSHOT_PORT}/index.php/avatar`, {
						method: 'POST',
						headers: {
							Authorization: `Basic ${credentials}`,
							'Content-Type': `multipart/form-data; boundary=${boundary}`,
							'OCS-APIREQUEST': 'true',
						},
						body,
					})
					return res.status
				},
			})

			on('after:run', async () => {
				try {
					const { default: pngquantBin } = await import('pngquant-bin')
					execSync(
						`find "${process.env.HOME}/Pictures/Screenshots/nextcloud-docs" -name '*.png'` +
						` -exec "${pngquantBin}" --quality=70-85 --force --ext .png --strip {} \\;`,
						{ stdio: 'inherit' },
					)
				} catch {
					console.warn('pngquant failed — screenshots not compressed')
				}
				stopNextcloud()
			})

			await startNextcloud('stable33', false, { exposePort: SCREENSHOT_PORT })
			config.baseUrl = `http://localhost:${SCREENSHOT_PORT}/index.php`
			await waitOnNextcloud(`localhost:${SCREENSHOT_PORT}`)
			await configureNextcloud(SCREENSHOT_APPS)

			return config
		},
	},
})
