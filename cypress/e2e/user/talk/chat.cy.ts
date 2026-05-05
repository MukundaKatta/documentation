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

let dmToken: string

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
		dmToken = res.body.ocs.data.token
		say(dmToken, 'Do you have minute?', amara)
		say(dmToken, "Absolutely, what's up?", christine)
		say(dmToken, "The client got back to me and they're considering to join the fundraising next Thursday if we can secure a round table for them. Can you help me secure it?", amara)
		say(dmToken, 'Those are some great news! Have you already gotten in touch with Marlene from the venue to see if they can add a round table to the event?', christine)
		say(dmToken, "Marlene from the venue just got back to me and she said it'd be tricky to get that table so close to the event's date. She said she'll try but maybe an escalation is needed.", amara)
		say(dmToken, "OK, makes sense to me. I will contact them immediately to ensure that we can accommodate the client's wishes. Thank you for looping me in!", christine)
		say(dmToken, 'Wonderful, thank you!', amara)
		say(dmToken, 'Happy to help!', christine)
	})
})

describe('Documentation screenshots — Talk: Sending messages', { testIsolation: false }, () => {
	beforeEach(() => {
		cy.viewport(1440, 900)
	})

	it('Emoji picker', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, [data-cy-conversations-list-item], li', 'Amara Winterbourne', { timeout: 15000 })
			.click()
		cy.get('.chat-view, .messages-list, [data-cy-message-list]', { timeout: 10000 }).should('be.visible')
		// Open the emoji picker via the emoji button in the input bar
		cy.get('[data-cy-emoji-picker] button, button[aria-label*="emoji" i], .emoji-picker-button').first().click()
		cy.get('.emoji-picker, [data-cy-emoji-picker-content], .NcEmojiPicker', { timeout: 5000 }).should('be.visible')
		docElementScreenshot(
			'.chat-view, #app-content',
			'user/talk/emoji-picker',
		)
	})

	it('Smart picker', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		// Type / to open the smart picker
		cy.get('[data-cy-message-input] input, .new-message-form__input, textarea[placeholder*="message" i]')
			.first().click().type('/')
		cy.get('.smart-picker, [data-cy-smart-picker], .NcActionInput', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/smart-picker')
	})

	it('Reply to message (hover state)', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		// Hover on a message to reveal the reply arrow
		cy.get('.message, [data-cy-message], .chat-message').last().as('msg')
		cy.get('@msg').trigger('mouseover')
		cy.get('.message__buttons, [data-cy-message-actions]', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/reply')
	})

	it('Message action menu', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		// Hover on a message then click the ... button
		cy.get('.message, [data-cy-message], .chat-message').last().as('msg')
		cy.get('@msg').trigger('mouseover')
		cy.get('@msg').find('button[aria-label*="actions" i], button[aria-label*="more" i], .action-item__menutoggle').first().click()
		cy.get('[role="menu"], .action-item__menutoggle + ul', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/chat-message-menu')
	})

	it('Silent message toggle', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		// Open the send-options dropdown to reveal silent mode
		cy.get('[data-cy-send-options], button[aria-label*="send options" i], .send-button-dropdown, .send-message__options')
			.first().click()
		cy.contains('button, [role="menuitem"]', /silent/i, { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/message-silent')
	})

	it('Schedule message action', () => {
		cy.login(christine)
		cy.visit('/apps/spreed')
		cy.contains('.conversations-list__item, li', 'Amara Winterbourne', { timeout: 15000 }).click()
		cy.get('.chat-view, .messages-list', { timeout: 10000 }).should('be.visible')
		// Type something in the input so the schedule button activates
		cy.get('[data-cy-message-input] input, .new-message-form__input, textarea[placeholder*="message" i]')
			.first().type('Will do!')
		cy.get('[data-cy-send-options], button[aria-label*="send options" i], .send-message__options, .send-button-dropdown')
			.first().click()
		cy.contains('[role="menuitem"], button', /schedule/i, { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/message-schedule-action')
	})

	it('Scheduled messages list', () => {
		// Schedule the message (click Schedule option, then confirm in dialog)
		cy.contains('[role="menuitem"], button', /schedule/i).click()
		cy.get('.modal-container, [data-cy-schedule-dialog]', { timeout: 5000 }).should('be.visible')
		// Confirm with default time
		cy.contains('button', /confirm|schedule|send/i).last().click()
		// Open the scheduled messages panel via the clock icon
		cy.get('button[aria-label*="scheduled" i], [data-cy-scheduled-messages], .scheduled-messages-button', { timeout: 5000 })
			.should('be.visible').click()
		cy.get('.scheduled-messages-list, [data-cy-scheduled-messages-list]', { timeout: 5000 }).should('be.visible')
		docElementScreenshot('.chat-view, #app-content', 'user/talk/message-schedule-toggle')
	})
})
