// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { User } from '@nextcloud/cypress'
import { docScreenshot, docElementScreenshot } from '../helpers'

const user = new User('christine', 'christine')
const AVATAR_DIR = '/home/anna/Downloads/tp/avatar'

before(() => {
	cy.task('occ', { cmd: 'user:add --password-from-env --display-name="Christine" christine', env: { OC_PASS: 'christine' } })
	cy.task('uploadAvatar', { src: `${AVATAR_DIR}/christine/avatar.png`, user: 'christine', password: 'christine' })
})

describe('Web interface', () => {
	it('Login page', () => {
		cy.logout()
		cy.visit('/')
		cy.get('#body-login, .login-form, form[name="login"]').should('be.visible')
		docScreenshot('user/login_page')
	})

	it('Dashboard', () => {
		cy.login(user)
		cy.visit('/apps/dashboard')
		// Wait for widgets to load
		cy.get('.dashboard-widget, #app-content, .app-dashboard').should('be.visible')
		cy.get('.loading, .icon-loading').should('not.exist')
		docScreenshot('user/webinterface_dashboard')
	})

	it('Navigation bar', () => {
		cy.login(user)
		cy.visit('/apps/dashboard')
		cy.get('header#header').should('be.visible')
		docElementScreenshot('header#header', 'user/webinterface_nav')
	})

	it('Profile menu', () => {
		cy.login(user)
		cy.visit('/apps/dashboard')
		cy.get('header#header').should('be.visible')
		// Click the profile/settings button (rightmost item in the header)
		cy.get('#settings button, #user-menu button, header .user-status__status button, .user-status-menu-item button').first().click()
		cy.contains('Log out').should('be.visible')
		docScreenshot('user/webinterface_profile_menu')
	})
})
