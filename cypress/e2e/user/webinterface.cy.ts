// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { User } from '@nextcloud/cypress'
import { docScreenshot, docElementScreenshot } from '../helpers'

const user = new User('christine', 'christine')
const AVATAR_DIR = '/home/anna/Downloads/tp/avatar'

before(() => {
	cy.task('occ', { cmd: 'user:add --password-from-env --display-name="Christine" christine', env: { OC_PASS: 'christine' } })
	cy.task('uploadAvatar', { src: `${AVATAR_DIR}/christine/avatar.png`, user: 'christine', password: 'christine' })
	// Enable dashboard widgets matching the tech-preview layout (mail/spreed omitted — not in server image)
	cy.task('occ', { cmd: 'user:setting christine dashboard layout files-favorites,calendar,deck,notes,tasks' })
	cy.task('occ', { cmd: 'user:setting christine dashboard firstRun 0' })
})

describe('Web interface', () => {
	beforeEach(() => {
		cy.viewport(1440, 900)
	})

	it('Login page', () => {
		cy.logout()
		cy.visit('/')
		cy.get('#body-login, .login-form, form[name="login"]').should('be.visible')
		docScreenshot('user/login_page')
	})

	it('Dashboard', () => {
		cy.login(user)
		cy.visit('/apps/dashboard')
		// Wait for at least one widget to appear and spinners to clear
		cy.get('.panel--header, .dashboard-widget-content', { timeout: 15000 }).should('be.visible')
		cy.get('.icon-loading', { timeout: 15000 }).should('not.exist')
		docScreenshot('user/webinterface_dashboard')
	})

	it('Navigation bar', () => {
		cy.login(user)
		cy.visit('/apps/dashboard')
		cy.get('header#header').should('be.visible')
		docElementScreenshot('header#header', 'user/webinterface_nav')
	})

	it('Customize button', () => {
		cy.login(user)
		cy.visit('/apps/dashboard')
		cy.contains('button', 'Customize', { timeout: 15000 }).should('exist').scrollIntoView()
		cy.contains('button', 'Customize').should('be.visible')
		docElementScreenshot('button:contains("Customize")', 'user/webinterface_customize_btn')
	})

	it('Profile menu', () => {
		cy.login(user)
		cy.visit('/apps/dashboard')
		cy.get('header#header').should('be.visible')
		cy.get('#settings button, #user-menu button, header .user-status__status button, .user-status-menu-item button').first().click()
		cy.contains('Log out').should('be.visible')
		docScreenshot('user/webinterface_profile_menu')
	})
})
