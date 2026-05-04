// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { User } from '@nextcloud/cypress'
import { docScreenshot, docElementScreenshot } from '../helpers'

// Use the default admin user from the CI container
const admin = new User('admin', 'admin')

describe('Documentation screenshots — Files', { testIsolation: false }, () => {

	before(() => {
		cy.login(admin)
		// Create a Documents folder so the breadcrumb screenshot has something to show
		cy.request({
			method: 'MKCOL',
			url: '/remote.php/dav/files/admin/Documents',
			auth: { user: 'admin', pass: 'admin' },
			failOnStatusCode: false, // 405 if it already exists — that's fine
		})
		cy.visit('/apps/files')
		cy.get('[data-cy-files-list]').should('be.visible')
	})

	beforeEach(() => {
		cy.login(admin)
	})

	// -------------------------------------------------------------------------
	// access_webgui.rst
	// -------------------------------------------------------------------------

	it('Files — main view (users-files)', () => {
		cy.visit('/apps/files')
		cy.get('[data-cy-files-content]').should('be.visible')
		cy.get('[data-cy-files-list]').should('be.visible')
		docScreenshot('user/users-files')
	})

	it('Files — new file/upload menu (files_page-1)', () => {
		cy.visit('/apps/files')
		cy.get('[data-cy-files-list]').should('be.visible')
		// UploadPicker container is [data-cy-upload-picker]; its button opens an NcActions menu
		cy.get('[data-cy-upload-picker] button').first().click()
		cy.get('[role="menuitem"]').first().should('be.visible')
		docScreenshot('user/files_page-1')
	})

	it('Files — file row with actions menu (files_page-3)', () => {
		cy.visit('/apps/files')
		cy.get('[data-cy-files-list]').should('be.visible')
		// Hover to reveal inline actions
		cy.get('[data-cy-files-list-row]').first().trigger('mouseover')
		cy.get('[data-cy-files-list-row-actions]').first().should('be.visible')
		docScreenshot('user/files_page-3')
	})

	it('Files — details sidebar (files_page-4)', () => {
		cy.visit('/apps/files')
		cy.get('[data-cy-files-list]').should('be.visible')
		// Open Actions menu for first file, then click Details
		cy.get('[data-cy-files-list-row]').first()
			.find('button[aria-label="Actions"]').click({ force: true })
		cy.get('[data-cy-files-list-row-action="details"]').first()
			.click()
		cy.get('[data-cy-sidebar]').should('be.visible')
		docScreenshot('user/files_page-4')
	})

	it('Files — left navigation panel (files_page-5)', () => {
		cy.visit('/apps/files')
		cy.get('[data-cy-files-navigation]').should('be.visible')
		docElementScreenshot('[data-cy-files-navigation]', 'user/files_page-5')
	})

	it('Files — breadcrumbs inside a folder (files_page-6)', () => {
		cy.visit('/apps/files/files?dir=/Documents')
		cy.get('[data-cy-files-content]').should('be.visible')
		cy.get('.files-list__header').should('be.visible')
		docScreenshot('user/files_page-6')
	})

	it('Files — search / filter (files_page-7)', () => {
		cy.visit('/apps/files')
		cy.get('[data-cy-files-navigation]').should('be.visible')
		// Open the search field in the navigation
		cy.get('.app-navigation-search input, [data-cy-app-navigation-search] input').should('be.visible').type('Document')
		cy.wait(500)
		docScreenshot('user/files_page-7')
	})

	it('Files — grid view (files_page-8)', () => {
		cy.visit('/apps/files')
		cy.get('[data-cy-files-list]').should('be.visible')
		// Grid view toggle button
		cy.get('.files-list__header-grid-button').click()
		cy.get('.files-list--grid, [class*="grid"]').should('exist')
		docScreenshot('user/files_page-8')
		// Reset to list view so subsequent tests don't inherit grid mode
		cy.get('.files-list__header-grid-button').click()
	})

	it('Files — comment in sidebar (file_menu_comments_2)', () => {
		cy.visit('/apps/files')
		cy.get('[data-cy-files-list]').should('be.visible')
		// Open the Actions menu for the first file, then click Details
		cy.get('[data-cy-files-list-row]').first()
			.find('button[aria-label="Actions"]').click({ force: true })
		cy.get('[data-cy-files-list-row-action="details"]').first()
			.click()
		cy.get('[data-cy-sidebar]').should('be.visible')
		// With activity app enabled, comments integrate into the Activity tab
		cy.contains('[role="tab"]', 'Activity').click()
		cy.get('[role="tabpanel"]').should('be.visible')
		docScreenshot('user/file_menu_comments_2')
	})

	// -------------------------------------------------------------------------
	// sharing.rst
	// -------------------------------------------------------------------------

	it('Files — sharing panel (sharing_internal)', () => {
		cy.visit('/apps/files')
		cy.get('[data-cy-files-list]').should('be.visible')
		cy.get('[data-cy-files-list-row]').first()
			.find('button[aria-label="Actions"]').click({ force: true })
		cy.get('[data-cy-files-list-row-action="details"]').first()
			.click()
		cy.get('[data-cy-sidebar]').should('be.visible')
		cy.contains('[role="tab"]', 'Sharing').click()
		cy.get('[role="tabpanel"]').should('be.visible')
		docScreenshot('user/sharing_internal')
	})

	it('Files — public link share (sharing_public_file)', () => {
		cy.visit('/apps/files/files?dir=/')
		cy.get('[data-cy-files-list]').should('be.visible')
		// NC's router may restore a previous sidebar state. Close it first so
		// "Details" is available in the Actions menu.
		cy.get('[data-cy-sidebar]').then($sidebar => {
			if ($sidebar.is(':visible')) {
				cy.get('body').type('{esc}')
				cy.get('[data-cy-sidebar]').should('not.be.visible')
			}
		})
		cy.get('[data-cy-files-list-row]').first()
			.find('button[aria-label="Actions"]')
			.should('be.visible')
			.click()
		cy.get('[data-cy-files-list-row-action="details"]').first()
			.click()
		cy.get('[data-cy-sidebar]').should('be.visible')
		cy.contains('[role="tab"]', 'Sharing').click()
		cy.get('[role="tabpanel"]').should('be.visible')
		cy.get('button[aria-label="Create a new share link"]').click()
		cy.get('.sharing-entry.sharing-entry--share').should('be.visible')
		// Dismiss toasts so they don't overlap the sharing panel
		cy.get('button.toast-close').click({ multiple: true, force: true })
		cy.get('.toastify').should('not.exist')
		docScreenshot('user/sharing_public_file')
	})

	// -------------------------------------------------------------------------
	// quota.rst
	// -------------------------------------------------------------------------

	it('Files — quota display (quota1)', () => {
		cy.visit('/apps/files')
		cy.get('[data-cy-files-navigation-settings-quota]').should('be.visible')
		docElementScreenshot('[data-cy-files-navigation-settings-quota]', 'user/quota1')
	})
})
