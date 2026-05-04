import {
	configureNextcloud,
	startNextcloud,
	stopNextcloud,
	waitOnNextcloud,
} from '@nextcloud/cypress/docker'
import { defineConfig } from 'cypress'

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
			await configureNextcloud(SCREENSHOT_APPS)

			return config
		},
	},
})
