import {
	configureNextcloud,
	startNextcloud,
	stopNextcloud,
	waitOnNextcloud,
} from '@nextcloud/cypress/docker'
import { defineConfig } from 'cypress'

// Apps to enable in the screenshot environment.
// These must be available on the stable33 server image.
const SCREENSHOT_APPS = [
	'activity',
	'calendar',
	'contacts',
	'deck',
	'notes',
	'photos',
	'spreed',
	'tasks',
	'theming',
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

			// Start a clean stable33 container — separate from the dev environment
			const ip = await startNextcloud('stable33', false)
			config.baseUrl = `http://${ip}/index.php`
			await waitOnNextcloud(ip)
			await configureNextcloud(SCREENSHOT_APPS)

			return config
		},
	},
})
