import { jest } from '@jest/globals'
import type { BinaryNode } from '../../WABinary'

/**
 * Phase 4 (finding S5): unexpected processing errors used to exist only in
 * the logs — applications had no way to count or react to them. They are
 * now also emitted as 'processing.error' events (the log line is kept).
 *
 * These tests drive a real socket over a mocked WebSocket and fire stanzas
 * whose handling deterministically throws inside the call/message handlers:
 *  - the failure must surface as a 'processing.error' event
 *  - the stanza handler must still resolve (errors stay contained)
 *  - with no listener registered, nothing may throw
 *  - a throwing listener must not break error handling
 */

const wsHandlers = new Map<string, ((...args: never[]) => unknown)[]>()

jest.unstable_mockModule('../../Socket/Client/websocket', () => ({
	WebSocketClient: jest.fn().mockImplementation(() => ({
		connect: jest.fn(),
		close: jest.fn(),
		on: jest.fn((event: string, handler: (...args: never[]) => unknown) => {
			const handlers = wsHandlers.get(event) ?? []
			handlers.push(handler)
			wsHandlers.set(event, handlers)
		}),
		off: jest.fn(),
		removeAllListeners: jest.fn(),
		emit: jest.fn(),
		send: jest.fn((_data: unknown, cb?: (err?: Error) => void) => cb?.()),
		isOpen: true
	}))
}))

const { DEFAULT_CONNECTION_CONFIG } = await import('../../Defaults')
const makeWASocket = (await import('../../Socket')).default
const { makeSession } = await import('../TestUtils/session')

type ProcessingError = import('../../Types').BaileysEventMap['processing.error']

// a call stanza without its mandatory info child: handleCall throws Boom
const BAD_CALL_NODE: BinaryNode = {
	tag: 'call',
	attrs: { from: '1234567890@s.whatsapp.net', id: 'CALL-1' },
	content: []
}

// a group message without a participant: decodeMessageNode throws Boom
// inside handleMessage before any decryption or network work happens
const BAD_MESSAGE_NODE: BinaryNode = {
	tag: 'message',
	attrs: { id: 'MSG-1', from: '120363000000000000@g.us', t: '1700000000' },
	content: []
}

const makeSocket = async () => {
	wsHandlers.clear()
	const { state, clear } = await makeSession()
	state.creds.me = { id: '1234567890@s.whatsapp.net', name: 'Test User' }

	const sock = makeWASocket({
		...DEFAULT_CONNECTION_CONFIG,
		auth: state,
		markOnlineOnConnect: false,
		connectTimeoutMs: 200,
		syncFullHistory: false
	})

	const fire = async (event: string, node: BinaryNode) => {
		const handlers = wsHandlers.get(event) ?? []
		expect(handlers.length).toBeGreaterThan(0)
		for (const handler of handlers) {
			await handler(node as never)
		}
	}

	return { sock, clear, fire }
}

describe("'processing.error' event", () => {
	it('surfaces call handling failures with their context', async () => {
		const { sock, clear, fire } = await makeSocket()

		try {
			const received: ProcessingError[] = []
			sock.ev.on('processing.error', event => received.push(event))

			// the stanza handler resolves: the error stays contained
			await fire('CB:call', BAD_CALL_NODE)

			expect(received).toHaveLength(1)
			expect(received[0]!.context).toBe('handling call')
			expect(received[0]!.error).toBeInstanceOf(Error)
			expect(received[0]!.error.message).toContain('Missing call info')
		} finally {
			await clear()
		}
	})

	it('surfaces message handling failures with their context', async () => {
		const { sock, clear, fire } = await makeSocket()

		try {
			const received: ProcessingError[] = []
			sock.ev.on('processing.error', event => received.push(event))

			await fire('CB:message', BAD_MESSAGE_NODE)

			expect(received).toHaveLength(1)
			expect(received[0]!.context).toBe('handling message')
			expect(received[0]!.error).toBeInstanceOf(Error)
			expect(received[0]!.error.message).toContain('No participant in group message')
		} finally {
			await clear()
		}
	})

	it('does not throw when nobody listens', async () => {
		const { clear, fire } = await makeSocket()

		try {
			await expect(fire('CB:call', BAD_CALL_NODE)).resolves.toBeUndefined()
		} finally {
			await clear()
		}
	})

	it('keeps delivering after a listener throws', async () => {
		const { sock, clear, fire } = await makeSocket()

		try {
			const throwingListener = () => {
				throw new Error('listener bug')
			}

			sock.ev.on('processing.error', throwingListener)

			// the throwing listener must not break error handling itself
			await expect(fire('CB:call', BAD_CALL_NODE)).resolves.toBeUndefined()

			sock.ev.off('processing.error', throwingListener)

			const received: ProcessingError[] = []
			sock.ev.on('processing.error', event => received.push(event))
			await fire('CB:call', BAD_CALL_NODE)
			expect(received).toHaveLength(1)
		} finally {
			await clear()
		}
	})
})
