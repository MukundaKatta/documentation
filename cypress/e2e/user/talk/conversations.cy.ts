// SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { User } from '@nextcloud/cypress'
import { docScreenshot, docElementScreenshot } from '../../helpers'

const christine = new User('christine', 'christine')
const amara = new User('amara_w', 'amara_w')
const AVATAR_DIR = '/home/anna/Downloads/tp/avatar'

// ── Talk OCS helpers ──────────────────────────────────────────────────────────

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

function createDm(invitee: string, as: User): Cypress.Chainable<string> {
	return talkApi('POST', '/v4/room', as, { roomType: 1, invite: invitee })
		.its('body.ocs.data.token')
}

function createGroup(name: string, as: User): Cypress.Chainable<string> {
	return talkApi('POST', '/v4/room', as, { roomType: 2, roomName: name })
		.its('body.ocs.data.token')
}

function addParticipant(token: string, uid: string, as: User) {
	return talkApi('POST', `/v4/room/${token}/participants`, as, { newParticipant: uid, source: 'users' })
}

function say(token: string, message: string, as: User) {
	return talkApi('POST', `/v1/chat/${token}`, as, { message })
}

// ── Provisioning ──────────────────────────────────────────────────────────────

before(() => {
	cy.task('occ', { cmd: 'user:add --password-from-env --display-name="Christine" christine', env: { OC_PASS: 'christine' } })
	cy.task('uploadAvatar', { src: `${AVATAR_DIR}/christine/avatar.png`, user: 'christine', password: 'christine' })
	cy.task('occ', { cmd: 'user:add --password-from-env --display-name="Amara Winterbourne" amara_w', env: { OC_PASS: 'amara_w' } })
	cy.task('uploadAvatar', { src: `${AVATAR_DIR}/amara_w/avatar.png`, user: 'amara_w', password: 'amara_w' })

	// 1:1 conversation with realistic messages (from tp.db room 112)
	createDm('amara_w', christine).then((dmToken) => {
		say(dmToken, 'Do you have minute?', amara)
		say(dmToken, "Absolutely, what's up?", christine)
		say(dmToken, "The client got back to me and they're considering to join the fundraising next Thursday if we can secure a round table for them. Can you help me secure it?", amara)
		say(dmToken, 'Those are some great news! Have you already gotten in touch with Marlene from the venue to see if they can add a round table to the event?', christine)
		say(dmToken, "Marlene from the venue just got back to me and she said it'd be tricky to get that table so close to the event's date. She said she'll try but maybe an escalation is needed.", amara)
		say(dmToken, "OK, makes sense to me. I will contact them immediately to ensure that we can accommodate the client's wishes. Thank you for looping me in!", christine)
		say(dmToken, 'Wonderful, thank you!', amara)
		say(dmToken, 'Happy to help!', christine)
	})

	// Group conversation for moderator/settings screenshots
	createGroup('Event planning', christine).then((groupToken) => {
		addParticipant(groupToken, 'amara_w', christine)
		say(groupToken, "Hi team! I've set up this conversation for coordinating the Q3 fundraising event.", christine)
		say(groupToken, 'Great, thanks for setting this up! I have a few updates to share.', amara)
		say(groupToken, "Looking forward to hearing them. Let's get started!", christine)
		// Store token for later tests
		cy.wrap(groupToken).as('groupToken')
	})
})

// ── Screenshots ───────────────────────────────────────────────────────────────

describe('Documentation screenshots — Talk: Conversations', { testIsolation: false }, () => {
	beforeEach(() => {
		cy.viewport(1440, 900)
	})

	it('Talk dashboard (conversation list)', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.get('.conversations-list, [data-cy-conversations-list], #app-content-wrapper', { timeout: 15000 }).should('be.visible')
		cy.get('.icon-loading, .loading', { timeout: 10000 }).should('not.exist')
		docScreenshot('user/talk/talk-dashboard')
	})

	it('Note to self', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, [data-cy-conversations-list-item], li', 'Note to self', { timeout: 15000 })
			.click()
		cy.get('.chat-view, .messages-list, [data-cy-message-list]', { timeout: 10000 }).should('be.visible')
		docElementScreenshot(
			'.app-content, #app-content',
			'user/talk/note-to-self',
		)
	})

	it('1:1 conversation with right sidebar', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, [data-cy-conversations-list-item], li', 'Amara Winterbourne', { timeout: 15000 })
			.click()
		cy.get('.chat-view, .messages-list, [data-cy-message-list]', { timeout: 10000 }).should('be.visible')
		// Open the right sidebar
		cy.get('[data-cy-sidebar-toggle], button[aria-label*="details" i], button[aria-label*="sidebar" i]').first().click()
		cy.get('.app-sidebar, [data-cy-app-sidebar]', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.app-sidebar, [data-cy-app-sidebar]', 'user/talk/one-to-one-right-sidebar')
	})

	it('1:1 extend to group', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, [data-cy-conversations-list-item], li', 'Amara Winterbourne', { timeout: 15000 })
			.click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		// Open sidebar if not already open
		cy.get('[data-cy-sidebar-toggle], button[aria-label*="details" i]').first().click()
		cy.get('.app-sidebar', { timeout: 5000 }).should('be.visible')
		cy.contains('button, .action-button', /add participants|extend|invite/i, { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.app-sidebar', 'user/talk/one-to-one-extend')
	})

	it('Create new conversation button', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.get('.conversations-list, [data-cy-conversations-list]', { timeout: 15000 }).should('be.visible')
		// Click the + / new-conversation button
		cy.get('[data-cy-new-conversation], button[aria-label*="new conversation" i], .new-button')
			.first().click()
		cy.contains('Create a new conversation', { timeout: 5000 }).should('be.visible')
		docElementScreenshot(
			'[data-cy-search], .new-conversation-container, #app-navigation-vue',
			'user/talk/create-new-conversation',
		)
	})

	it('Creating open conversation (step 1: name + settings)', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.get('[data-cy-new-conversation], button[aria-label*="new conversation" i], .new-button')
			.first().click()
		cy.contains('Create a new conversation').click()
		cy.get('[data-cy-conversation-name], input[placeholder*="name" i], input[id*="name" i]', { timeout: 5000 })
			.should('be.visible')
			.type('Product team')
		docScreenshot('user/talk/creating-open-conversation')
	})

	it('Add participants (step 2)', () => {
		// Continuation of previous test — dialog should still be open
		cy.contains('button', /next|add participants/i).click()
		cy.get('[data-cy-participants-search], input[placeholder*="participant" i], input[placeholder*="user" i]', { timeout: 5000 })
			.should('be.visible')
			.type('Amara')
		cy.contains('.participant-row, .suggestion, li', 'Amara Winterbourne', { timeout: 5000 }).click()
		docScreenshot('user/talk/add-participants')
	})

	it('New room (freshly created conversation)', () => {
		cy.contains('button', /create|done|finish/i).click()
		cy.get('.chat-view, .messages-list', { timeout: 15000 }).should('be.visible')
		cy.get('.icon-loading', { timeout: 10000 }).should('not.exist')
		docScreenshot('user/talk/new-room')
	})

	it('Filters menu', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.get('.conversations-list', { timeout: 15000 }).should('be.visible')
		cy.get('[data-cy-filter-button], button[aria-label*="filter" i], .filter-button').first().click()
		cy.get('[data-cy-filter-menu], .filter-menu, .action-item__menutoggle + ul', { timeout: 5000 }).should('be.visible')
		docElementScreenshot(
			'[data-cy-filter-menu], .filter-menu, #app-navigation-vue',
			'user/talk/filters-menu',
		)
	})

	it('Clear filter', () => {
		// Apply unread filter and show clear button
		cy.contains('[role="menuitem"], button, li', /unread messages/i).click()
		cy.get('[data-cy-clear-filter], button[aria-label*="clear" i], .clear-filter', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('#app-navigation-vue', 'user/talk/clear-filter')
	})

	it('Group public settings', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Event planning', { timeout: 15000 }).click()
		cy.get('[data-cy-sidebar-toggle], button[aria-label*="details" i]').first().click()
		cy.get('.app-sidebar', { timeout: 5000 }).should('be.visible')
		cy.contains('[role="tab"], .tab-item, button', /participants|settings/i).click()
		docElementScreenshot('.app-sidebar', 'user/talk/group-public-settings')
	})

	it('Participant menu (... on participant)', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Event planning', { timeout: 15000 }).click()
		cy.get('[data-cy-sidebar-toggle], button[aria-label*="details" i]').first().click()
		cy.get('.app-sidebar', { timeout: 5000 }).should('be.visible')
		cy.contains('[role="tab"], button', /participants/i).click()
		// Hover over Amara's participant row to reveal the ... button
		cy.contains('.participant-row, li', 'Amara Winterbourne').as('participantRow')
		cy.get('@participantRow').trigger('mouseover')
		cy.get('@participantRow').find('button[aria-label*="actions" i], .action-item, [data-cy-participant-action]').first().click()
		cy.get('.dropdown-item, .action-item__menutoggle + ul, [role="menu"]', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.app-sidebar', 'user/talk/participant-menu')
	})

	it('Open conversation settings menu', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Event planning', { timeout: 15000 }).click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		// Open the ... menu on the conversation header
		cy.get('[data-cy-conversation-header] button[aria-label*="actions" i], .conversation-header__actions button, .top-bar button[aria-haspopup]')
			.first().click()
		cy.get('[role="menu"], .action-item__menutoggle + ul', { timeout: 5000 }).should('be.visible')
		docElementScreenshot(
			'#app-content',
			'user/talk/open-settings',
		)
	})

	it('Conversation settings dialog', () => {
		cy.contains('[role="menuitem"], button, li', /conversation settings/i).click()
		cy.get('[data-cy-conversation-settings], .conversation-settings, .modal-container', { timeout: 10000 }).should('be.visible')
		docElementScreenshot(
			'[data-cy-conversation-settings], .conversation-settings, .modal-container',
			'user/talk/conversation-settings-dialog',
		)
	})

	it('Message expiration setting', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Event planning', { timeout: 15000 }).click()
		cy.get('[data-cy-conversation-header] button[aria-label*="actions" i], .conversation-header__actions button, .top-bar button[aria-haspopup]')
			.first().click()
		cy.contains('[role="menuitem"], li', /conversation settings/i).click()
		cy.get('[data-cy-conversation-settings], .conversation-settings, .modal-container', { timeout: 10000 }).should('be.visible')
		cy.contains('[role="tab"], button', /moderation/i).click()
		cy.contains('label, .setting-label, div', /message expiration/i, { timeout: 5000 }).should('be.visible')
		docElementScreenshot(
			'[data-cy-conversation-settings], .conversation-settings, .modal-container',
			'user/talk/messages-expiration',
		)
	})

	it('Ban participant', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Event planning', { timeout: 15000 }).click()
		cy.get('[data-cy-sidebar-toggle], button[aria-label*="details" i]').first().click()
		cy.get('.app-sidebar', { timeout: 5000 }).should('be.visible')
		cy.contains('[role="tab"], button', /participants/i).click()
		cy.contains('.participant-row, li', 'Amara Winterbourne').as('row')
		cy.get('@row').trigger('mouseover')
		cy.get('@row').find('button[aria-label*="actions" i], .action-item').first().click()
		cy.contains('[role="menuitem"], button', /remove participant/i, { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.app-sidebar', 'user/talk/ban-participant')
	})

	it('Ban participant dialog', () => {
		cy.contains('[role="menuitem"], button', /remove participant/i).click()
		cy.get('[data-cy-ban-dialog], .modal-container', { timeout: 5000 }).should('be.visible')
		cy.contains('label, span', /ban/i).parent().find('input[type="checkbox"]').check()
		docElementScreenshot(
			'[data-cy-ban-dialog], .modal-container',
			'user/talk/ban-participant-dialog',
		)
	})

	it('Ban participant list', () => {
		// Dismiss the dialog without banning so Amara stays in the room
		cy.contains('button', /cancel/i).click()
		// Open conversation settings → Moderation → Banned users
		cy.get('[data-cy-conversation-header] button[aria-label*="actions" i], .top-bar button[aria-haspopup]')
			.first().click()
		cy.contains('[role="menuitem"], li', /conversation settings/i).click()
		cy.get('[data-cy-conversation-settings], .modal-container', { timeout: 10000 }).should('be.visible')
		cy.contains('[role="tab"], button', /moderation/i).click()
		cy.contains('button, h3, .section-title', /banned/i, { timeout: 5000 }).should('be.visible')
		docElementScreenshot(
			'[data-cy-conversation-settings], .modal-container',
			'user/talk/ban-participant-list',
		)
	})

	it('Conversation notifications setting', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('[data-cy-conversation-header] button[aria-label*="actions" i], .top-bar button[aria-haspopup]')
			.first().click()
		cy.contains('[role="menuitem"], li', /notification|settings/i).click()
		cy.get('[data-cy-notification-settings], .modal-container, .notification-settings', { timeout: 10000 }).should('be.visible')
		docElementScreenshot(
			'[data-cy-notification-settings], .modal-container',
			'user/talk/conversation-notifications',
		)
	})

	it('Privacy settings (Talk personal settings)', () => {
		cy.login(christine)
		cy.visit('/settings/user/talk')
		cy.get('.app-settings-content, [data-cy-talk-settings], .personal-settings', { timeout: 15000 }).should('be.visible')
		cy.contains('h2, h3, .settings-section__name', /privacy|read marker|typing/i, { timeout: 5000 }).should('be.visible')
		docScreenshot('user/talk/privacy-settings')
	})

	it('Archived conversations button', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.get('.conversations-list', { timeout: 15000 }).should('be.visible')
		// Archive the group conversation
		cy.contains('.conversations-list__item, li', 'Event planning').rightclick()
		cy.contains('[role="menuitem"], button', /archive/i, { timeout: 5000 }).click()
		// Show the archive button at the bottom of the nav
		cy.get('[data-cy-archived-button], button[aria-label*="archived" i], .archived-conversations-button', { timeout: 5000 })
			.should('be.visible')
		docElementScreenshot('#app-navigation-vue', 'user/talk/archived-conversations-button')
	})

	it('Archived conversations list', () => {
		cy.get('[data-cy-archived-button], button[aria-label*="archived" i], .archived-conversations-button')
			.click()
		cy.contains('.conversations-list__item, li', 'Event planning', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('#app-navigation-vue', 'user/talk/archived-conversations-list')
	})
})
