import { jest } from '@jest/globals'
import type { BinaryNode } from '../../WABinary'

/**
 * Long-running stability soak (fork-audit item, Rsembilaneks comparison):
 * forks claim "pairing/reconnect stability" without tests. This suite
 * instead pins the behavior down — a socket repeatedly created, closed
 * and recreated against the same persisted session must keep processing
 * stanzas identically every cycle: no lost error events, no duplicate
 * handler accumulation, no state leakage between cycles.
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

const BAD_CALL_NODE: BinaryNode = {
	tag: 'call',
	attrs: { from: '1234567890@s.whatsapp.net', id: 'CALL-1' },
	content: []
}

const BAD_MESSAGE_NODE: BinaryNode = {
	tag: 'message',
	attrs: { id: 'MSG-1', from: '120363000000000000@g.us', t: '1700000000' },
	content: []
}

describe('reconnect soak', () => {
	it('processes stanzas identically across repeated create/close cycles on one session', async () => {
		const { state, clear } = await makeSession()
		state.creds.me = { id: '1234567890@s.whatsapp.net', name: 'Test User' }

		try {
			let callHandlerCount = 0
			let messageHandlerCount = 0

			for (let cycle = 0; cycle < 8; cycle++) {
				// each cycle gets a fresh transport, like a real reconnect
				wsHandlers.clear()
				const sock = makeWASocket({
					...DEFAULT_CONNECTION_CONFIG,
					auth: state,
					markOnlineOnConnect: false,
					connectTimeoutMs: 200,
					syncFullHistory: false
				})

				const errors: ProcessingError[] = []
				sock.ev.on('processing.error', event => errors.push(event))

				const fire = async (event: string, node: BinaryNode) => {
					for (const handler of wsHandlers.get(event) ?? []) {
						await handler(node as never)
					}
				}

				await fire('CB:call', BAD_CALL_NODE)
				await fire('CB:message', BAD_MESSAGE_NODE)

				// exactly one error per bad stanza — none lost, none duplicated
				expect(errors.map(e => e.context).sort()).toEqual(['handling call', 'handling message'])

				// stanza handlers never accumulate across cycles
				const calls = wsHandlers.get('CB:call')?.length ?? 0
				const messages = wsHandlers.get('CB:message')?.length ?? 0
				if (cycle === 0) {
					callHandlerCount = calls
					messageHandlerCount = messages
					expect(callHandlerCount).toBeGreaterThan(0)
					expect(messageHandlerCount).toBeGreaterThan(0)
				} else {
					expect(calls).toBe(callHandlerCount)
					expect(messages).toBe(messageHandlerCount)
				}

				// session identity survives every cycle (restoration, not re-pairing)
				expect(sock.authState.creds.me?.id).toBe('1234567890@s.whatsapp.net')

				await sock.end(undefined)
			}
		} finally {
			await clear()
		}
	})

	it('never loses an error event under a stanza burst', async () => {
		const { state, clear } = await makeSession()
		state.creds.me = { id: '1234567890@s.whatsapp.net', name: 'Test User' }
		wsHandlers.clear()

		const sock = makeWASocket({
			...DEFAULT_CONNECTION_CONFIG,
			auth: state,
			markOnlineOnConnect: false,
			connectTimeoutMs: 200,
			syncFullHistory: false
		})

		try {
			const errors: ProcessingError[] = []
			sock.ev.on('processing.error', event => errors.push(event))

			const handlers = wsHandlers.get('CB:message') ?? []
			expect(handlers.length).toBeGreaterThan(0)
			for (let i = 0; i < 25; i++) {
				for (const handler of handlers) {
					await handler({ ...BAD_MESSAGE_NODE, attrs: { ...BAD_MESSAGE_NODE.attrs, id: `MSG-${i}` } } as never)
				}
			}

			expect(errors).toHaveLength(25)
			expect(errors.every(e => e.context === 'handling message')).toBe(true)
		} finally {
			await sock.end(undefined)
			await clear()
		}
	})
})
