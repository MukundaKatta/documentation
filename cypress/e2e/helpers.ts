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
/** Inject CSS to strip focus outlines and scrollbars before capturing. */
function suppressFocusRings(): void {
	cy.document().then((doc) => {
		const style = doc.createElement('style')
		style.setAttribute('data-doc-screenshot', '')
		style.textContent = [
			'*:focus, *:focus-visible { outline: none !important; }',
			'::-webkit-scrollbar { display: none !important; }',
			'* { scrollbar-width: none !important; }',
		].join('\n')
		doc.head.appendChild(style)
	})
}

export function docScreenshot(name: string, options: Partial<Cypress.ScreenshotOptions> = {}): void {
	suppressFocusRings()
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
	suppressFocusRings()
	cy.wait(500)
	cy.get(selector).should('be.visible').screenshot(name, {
		overwrite: true,
		...options,
	})
}
