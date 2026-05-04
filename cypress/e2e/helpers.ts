// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Take a named screenshot for documentation.
 *
 * Name should mirror the destination path relative to the manual root,
 * e.g. 'user/files/sharing-dialog' → synced to user_manual/files/images/sharing-dialog.png
 *
 * The sync script (scripts/sync.sh) reads screenshot-inventory.json to map
 * these names to their RST image directive targets.
 */
export function docScreenshot(name: string, options: Partial<Cypress.ScreenshotOptions> = {}): void {
	// Let animations, loaders, and toasts settle before capturing
	cy.wait(500)
	cy.screenshot(name, {
		capture: 'viewport',
		overwrite: true,
		...options,
	})
}

/**
 * Take a screenshot of a specific element only.
 * Useful for dialogs, sidebars, or settings panels.
 */
export function docElementScreenshot(
	selector: string,
	name: string,
	options: Partial<Cypress.ScreenshotOptions> = {},
): void {
	cy.wait(500)
	cy.get(selector).should('be.visible').screenshot(name, {
		overwrite: true,
		...options,
	})
}
