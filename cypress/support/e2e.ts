// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { addCommands } from '@nextcloud/cypress'
import './commands'

addCommands()

// Ignore all uncaught exceptions from the application — we're capturing
// screenshots, not testing JS correctness, so app-level errors are irrelevant.
Cypress.on('uncaught:exception', () => false)

// Override the user agent via CDP so NC 33's browser-compatibility check passes.
// Electron 118 reports Chrome 118, which is below NC 33's minimum of Chrome 142+.
// The --user-agent CLI arg is ignored in Electron; CDP is the only reliable override.
before(() => {
	cy.wrap(
		Cypress.automation('remote:debugger:protocol', {
			command: 'Network.setUserAgentOverride',
			params: {
				userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
			},
		}),
	)
})
