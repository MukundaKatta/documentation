// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { addCommands } from '@nextcloud/cypress'
import './commands'

addCommands()

// Ignore all uncaught exceptions from the application — we're capturing
// screenshots, not testing JS correctness, so app-level errors are irrelevant.
Cypress.on('uncaught:exception', () => false)
