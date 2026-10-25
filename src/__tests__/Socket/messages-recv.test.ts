import { jest } from '@jest/globals'
import { DEFAULT_CONNECTION_CONFIG } from '../../Defaults'
import type { AuthenticationState } from '../../Types'
import { type BinaryNode } from '../../WABinary'

type WsListener = (node: BinaryNode) => unknown

const sendNode = jest.fn(async () => undefined)
const authState = {
	creds: {},
	keys: {
		get: jest.fn(async () => ({})),
		set: jest.fn(async () => undefined)
	}
}

jest.unstable_mockModule('../../Socket/messages-send', () => ({
	makeMessagesSocket: jest.fn(() => ({
		authState,
		sendNode,
		ws: {
			on: jest.fn()
		},
		ev: {
			on: jest.fn(),
			emit: jest.fn(),
			buffer: jest.fn(),
			flush: jest.fn()
		},
		notificationMutex: {
			mutex: async (fn: () => Promise<unknown>) => fn()
		},
		upsertMessage: jest.fn(async () => undefined),
		onUnexpectedError: jest.fn(),
		registerSocketEndHandler: jest.fn(),
		signalRepository: {
			lidMapping: {
				getLIDForPN: jest.fn()
			}
		}
	}))
}))

const { makeMessagesRecvSocket } = await import('../../Socket/messages-recv')

describe('sendMessageAck', () => {
	it('acknowledges notifications before credentials identify the device', async () => {
		const sock = makeMessagesRecvSocket({
			...DEFAULT_CONNECTION_CONFIG,
			auth: authState as unknown as AuthenticationState
		})
		const node: BinaryNode = {
			tag: 'notification',
			attrs: {
				id: 'pre-login-notification',
				from: 's.whatsapp.net',
				type: 'companion_reg_refresh'
			}
		}

		await expect(sock.sendMessageAck(node)).resolves.toBeUndefined()
		expect(sendNode).toHaveBeenCalledWith({
			tag: 'ack',
			attrs: {
				id: 'pre-login-notification',
				to: 's.whatsapp.net',
				class: 'notification',
				type: 'companion_reg_refresh'
			}
		})
	})
})

describe('mex newsletter paid partnership notification', () => {
	const getNotificationHandler = (sock: ReturnType<typeof makeMessagesRecvSocket>) => {
		const on = sock.ws.on as unknown as jest.Mock
		const call = on.mock.calls.find(([event]) => event === 'CB:notification')
		expect(call).toBeDefined()
		return call![1] as WsListener
	}

	const makePaidPartnershipNode = (gqlData: Record<string, unknown>): BinaryNode => ({
		tag: 'notification',
		attrs: { id: 'notif-1', from: 's.whatsapp.net', type: 'mex', t: '1761454400' },
		content: [
			{
				tag: 'update',
				attrs: { op_name: 'NotificationNewsletterPaidPartnership' },
				content: Buffer.from(JSON.stringify({ data: gqlData }))
			}
		]
	})

	const makeSock = () => {
		const sock = makeMessagesRecvSocket({
			...DEFAULT_CONNECTION_CONFIG,
			auth: authState as unknown as AuthenticationState
		})
		return { handler: getNotificationHandler(sock), emit: sock.ev.emit as unknown as jest.Mock }
	}

	beforeEach(() => {
		;(authState.creds as { me?: { id: string } }).me = { id: '1234567890@s.whatsapp.net' }
	})

	afterEach(() => {
		delete (authState.creds as { me?: { id: string } }).me
	})

	it('emits newsletter-partnership.update for the payload WA servers send', async () => {
		const { handler, emit } = makeSock()

		await handler(
			makePaidPartnershipNode({
				xwa2_notify_newsletter_paid_partnership: {
					newsletter_id: '120363167827783375@newsletter',
					server_id: '609'
				}
			})
		)

		expect(emit).toHaveBeenCalledWith('newsletter-partnership.update', {
			id: '120363167827783375@newsletter',
			server_id: '609'
		})
	})

	it('does not emit when newsletter_id is missing', async () => {
		const { handler, emit } = makeSock()

		await handler(makePaidPartnershipNode({ xwa2_notify_newsletter_paid_partnership: { server_id: '609' } }))

		expect(emit).not.toHaveBeenCalledWith('newsletter-partnership.update', expect.anything())
	})

	it('does not emit when the paid partnership payload is absent', async () => {
		const { handler, emit } = makeSock()

		await handler(makePaidPartnershipNode({ xwa2_notify_something_else: {} }))

		expect(emit).not.toHaveBeenCalledWith('newsletter-partnership.update', expect.anything())
	})
})

describe('status stanza handling', () => {
	const getStatusHandler = (sock: ReturnType<typeof makeMessagesRecvSocket>) => {
		const on = sock.ws.on as unknown as jest.Mock
		const call = on.mock.calls.find(([event]) => event === 'CB:status')
		expect(call).toBeDefined()
		return call![1] as WsListener
	}

	it('acks a top-level status stanza', async () => {
		sendNode.mockClear()
		const sock = makeMessagesRecvSocket({
			...DEFAULT_CONNECTION_CONFIG,
			auth: authState as unknown as AuthenticationState
		})
		const node: BinaryNode = {
			tag: 'status',
			attrs: { id: 'status-id', from: '1234567890@s.whatsapp.net', type: 'media' }
		}

		await getStatusHandler(sock)(node)

		expect(sendNode).toHaveBeenCalledWith({
			tag: 'ack',
			attrs: {
				id: 'status-id',
				to: '1234567890@s.whatsapp.net',
				class: 'status',
				type: 'media'
			}
		})
	})

	it('does not ack newsletter statuses', async () => {
		sendNode.mockClear()
		const sock = makeMessagesRecvSocket({
			...DEFAULT_CONNECTION_CONFIG,
			auth: authState as unknown as AuthenticationState
		})
		const node: BinaryNode = {
			tag: 'status',
			attrs: { id: 'status-id', from: '1234567890@newsletter', type: 'text' }
		}

		await getStatusHandler(sock)(node)

		expect(sendNode).not.toHaveBeenCalled()
	})
})
