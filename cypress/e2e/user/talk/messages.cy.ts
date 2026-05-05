// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { User } from '@nextcloud/cypress'
import { docScreenshot, docElementScreenshot } from '../../helpers'

const christine = new User('christine', 'christine')
const amara = new User('amara_w', 'amara_w')
const AVATAR_DIR = '/home/anna/Downloads/tp/avatar'

function talkApi(method: string, path: string, user: User, body?: Record<string, unknown>) {
	const base = (Cypress.config('baseUrl') as string).replace('/index.php', '')
	return cy.request({
		method,
		url: `${base}/ocs/v2.php/apps/spreed/api${path}`,
		auth: { user: user.userId, pass: user.password },
		headers: { 'OCS-APIRequest': 'true', 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
		failOnStatusCode: false,
	})
}

function say(token: string, message: string, as: User) {
	return talkApi('POST', `/v1/chat/${token}`, as, { message })
}

before(() => {
	cy.task('occ', { cmd: 'user:add --password-from-env --display-name="Christine" christine', env: { OC_PASS: 'christine' } })
	cy.task('uploadAvatar', { src: `${AVATAR_DIR}/christine/avatar.png`, user: 'christine', password: 'christine' })
	cy.task('occ', { cmd: 'user:add --password-from-env --display-name="Amara Winterbourne" amara_w', env: { OC_PASS: 'amara_w' } })
	cy.task('uploadAvatar', { src: `${AVATAR_DIR}/amara_w/avatar.png`, user: 'amara_w', password: 'amara_w' })

	// Create 1:1 and seed conversation from tp.db room 112
	const base = (Cypress.config('baseUrl') as string).replace('/index.php', '')
	cy.request({
		method: 'POST',
		url: `${base}/ocs/v2.php/apps/spreed/api/v4/room`,
		auth: { user: 'christine', pass: 'christine' },
		headers: { 'OCS-APIRequest': 'true', 'Content-Type': 'application/json' },
		body: JSON.stringify({ roomType: 1, invite: 'amara_w' }),
	}).then((res) => {
		const token = res.body.ocs.data.token
		say(token, 'Do you have minute?', amara)
		say(token, "Absolutely, what's up?", christine)
		say(token, "The client got back to me and they're considering to join the fundraising next Thursday if we can secure a round table for them. Can you help me secure it?", amara)
		say(token, 'Those are some great news! Have you already gotten in touch with Marlene from the venue to see if they can add a round table to the event?', christine)
		say(token, "Marlene from the venue just got back to me and she said it'd be tricky to get that table so close to the event's date. She said she'll try but maybe an escalation is needed.", amara)
		say(token, "OK, makes sense to me. I will contact them immediately to ensure that we can accommodate the client's wishes. Thank you for looping me in!", christine)
		say(token, 'Wonderful, thank you!', amara)
		say(token, 'Happy to help!', christine)
	})
})

describe('Documentation screenshots — Talk: Interacting with messages', { testIsolation: false }, () => {
	beforeEach(() => {
		cy.viewport(1440, 900)
	})

	it('Message editing', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		// Hover on one of Christine's own messages and open ... menu → Edit
		cy.contains('.message, [data-cy-message]', 'Happy to help').last().as('msg')
		cy.get('@msg').trigger('mouseover')
		cy.get('@msg').find('button[aria-label*="actions" i], button[aria-label*="more" i], .action-item__menutoggle').first().click()
		cy.contains('[role="menuitem"], button', /edit/i, { timeout: 5000 }).click()
		cy.get('[data-cy-message-input] input, .edit-message-form__input, .message-input textarea', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/message-editing')
	})

	it('Pin message action', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		cy.get('.message, [data-cy-message], .chat-message').last().as('msg')
		cy.get('@msg').trigger('mouseover')
		cy.get('@msg').find('button[aria-label*="actions" i], .action-item__menutoggle').first().click()
		cy.contains('[role="menuitem"], button', /pin/i, { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/message-pin-action')
	})

	it('Pinned message in chat', () => {
		// Pin the message
		cy.contains('[role="menuitem"], button', /pin/i).click()
		cy.get('.pinned-messages-bar, [data-cy-pinned-messages], .message--pinned', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/message-pin-in-chat')
	})

	it('Set message reminder', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		cy.get('.message, [data-cy-message], .chat-message').last().as('msg')
		cy.get('@msg').trigger('mouseover')
		// Click the reminder / bell icon in quick actions
		cy.get('@msg').find('button[aria-label*="reminder" i], button[aria-label*="remind" i], .message-reminder-button').first().click()
		cy.get('.reminder-picker, [data-cy-reminder-submenu], .submenu', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/set-message-reminder')
	})

	it('Configure message reminder (submenu)', () => {
		// The submenu should still be visible from the previous test
		cy.contains('[role="menuitem"], button, li', /later today|this evening|tomorrow|custom/i, { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/configure-message-reminder')
	})

	it('Search messages in conversation', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		// Open sidebar and switch to search tab
		cy.get('[data-cy-sidebar-toggle], button[aria-label*="details" i]').first().click()
		cy.get('.app-sidebar', { timeout: 5000 }).should('be.visible')
		cy.get('[data-cy-sidebar-search], button[aria-label*="search" i], .search-messages-button').first().click()
		cy.get('[data-cy-search-input], .sidebar-search input, input[placeholder*="search" i]', { timeout: 5000 }).type('Marlene')
		docElementScreenshot('.app-sidebar', 'user/talk/chat-search-messages')
	})

	it('Search messages results tab', () => {
		cy.get('[data-cy-search-results], .search-results, .messages-search-results', { timeout: 10000 }).should('be.visible')
		docElementScreenshot('.app-sidebar', 'user/talk/chat-search-messages-tab')
	})

	it('Create thread action', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		cy.get('.message, [data-cy-message], .chat-message').last().as('msg')
		cy.get('@msg').trigger('mouseover')
		cy.get('@msg').find('button[aria-label*="actions" i], .action-item__menutoggle').first().click()
		cy.contains('[role="menuitem"], button', /thread/i, { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/thread-create-action')
	})

	it('Thread example (open thread)', () => {
		cy.contains('[role="menuitem"], button', /thread/i).click()
		cy.get('.thread-view, [data-cy-thread], .message-thread', { timeout: 10000 }).should('be.visible')
		// Add a reply in the thread
		cy.get('[data-cy-thread-input] input, .thread-input textarea, [placeholder*="reply" i]')
			.first().type("I'll loop in the venue coordinator right away.{enter}")
		cy.get('.thread-message, [data-cy-thread-message]', { timeout: 5000 }).should('have.length.gte', 1)
		docElementScreenshot('.chat-view, #app-content', 'user/talk/thread-example')
	})

	it('Threads list in shared items', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('[data-cy-sidebar-toggle], button[aria-label*="details" i]').first().click()
		cy.get('.app-sidebar', { timeout: 5000 }).should('be.visible')
		cy.contains('[role="tab"], button', /shared items/i).click()
		cy.contains('[role="tab"], button', /threads/i).click()
		cy.get('.thread-list, [data-cy-threads-list]', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.app-sidebar', 'user/talk/threads-list-shared-items')
	})

	it('Thread notifications (subscribe)', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		// Find a message with a thread reply badge and open it
		cy.get('[data-cy-thread-reply-button], .message__thread-replies, .thread-indicator').first().click()
		cy.get('.thread-view, [data-cy-thread]', { timeout: 5000 }).should('be.visible')
		cy.get('[data-cy-thread-subscribe], button[aria-label*="subscribe" i], .thread-subscribe-button', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/thread-notifications')
	})

	it('Followed threads navigation', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.get('[data-cy-nav-threads], a[href*="threads"], .navigation-list__item--threads', { timeout: 10000 }).should('be.visible').click()
		cy.get('.threads-list, [data-cy-followed-threads]', { timeout: 10000 }).should('be.visible')
		docScreenshot('user/talk/threads-followed')
	})

	it('Thread edit title', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('[data-cy-thread-reply-button], .message__thread-replies, .thread-indicator').first().click()
		cy.get('.thread-view, [data-cy-thread]', { timeout: 5000 }).should('be.visible')
		cy.get('[data-cy-thread-title] button[aria-label*="edit" i], .thread-header__edit, button[aria-label*="edit title" i]')
			.first().click()
		cy.get('[data-cy-thread-title-input], .thread-title-edit input', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/thread-edit-title')
	})
})
