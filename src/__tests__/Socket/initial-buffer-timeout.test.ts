import { jest } from '@jest/globals'
import type { WAMessage } from '../../Types'
import type { BinaryNode } from '../../WABinary'

/**
 * Upstream #2810: the initial event buffer is normally released by the
 * server's `<ib><offline>` stanza, but that stanza is not guaranteed to
 * arrive. In that case events sitting in the initial buffer wait for an
 * internal failsafe and — the user-visible hang —
 * `receivedPendingNotifications` never becomes true, so apps gating on
 * it wait forever on a connected socket. These tests pin the watchdog:
 * bounded release + flag without the stanza, release via the stanza
 * exactly once, and legacy behaviour when the fallback is disabled.
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

// a direct receipt produces a messages.update without any crypto setup
const RECEIPT_NODE: BinaryNode = {
	tag: 'receipt',
	attrs: { from: '9876543210@s.whatsapp.net', id: 'MSG-1', type: 'read', t: '1700000050' }
}

const OFFLINE_DONE_NODE: BinaryNode = {
	tag: 'ib',
	attrs: {},
	content: [{ tag: 'offline', attrs: { count: '0' } }]
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const waitFor = async (condition: () => boolean, timeoutMs = 3000) => {
	const start = Date.now()
	while (!condition()) {
		if (Date.now() - start > timeoutMs) {
			throw new Error('condition not met within timeout')
		}

		await sleep(10)
	}
}

const fire = async (event: string, node: BinaryNode) => {
	for (const handler of wsHandlers.get(event) ?? []) {
		await handler(node as never)
	}
}

const setupSocket = async (initialBufferTimeoutMs: number) => {
	const { state, clear } = await makeSession()
	state.creds.me = { id: '1234567890@s.whatsapp.net', name: 'Test User' }
	wsHandlers.clear()

	const sock = makeWASocket({
		...DEFAULT_CONNECTION_CONFIG,
		auth: state,
		markOnlineOnConnect: false,
		connectTimeoutMs: 10_000,
		syncFullHistory: false,
		initialBufferTimeoutMs
	})

	const seen = { messageUpdates: 0, messageUpserts: 0, pendingNotifications: 0 }
	sock.ev.on('messages.update', () => {
		seen.messageUpdates += 1
	})
	sock.ev.on('messages.upsert', () => {
		seen.messageUpserts += 1
	})
	sock.ev.on('connection.update', update => {
		if (update.receivedPendingNotifications) {
			seen.pendingNotifications += 1
		}
	})

	// the initial buffer only arms on a later tick, once logged in
	await waitFor(() => sock.ev.isBuffering())
	return { sock, clear, seen }
}

describe('initial event buffer release (upstream #2810)', () => {
	it('releases events held in the initial buffer and signals receivedPendingNotifications when the offline stanza never arrives', async () => {
		const { sock, clear, seen } = await setupSocket(150)
		try {
			// park an event in the initial buffer, as offline processing would
			sock.ev.emit('messages.upsert', {
				messages: [
					{
						key: { remoteJid: '9876543210@s.whatsapp.net', id: 'MSG-1', fromMe: false },
						messageTimestamp: 1700000000,
						message: { conversation: 'hello' }
					} as WAMessage
				],
				type: 'notify'
			})
			// still buffered: nothing may leak early
			expect(seen.messageUpserts).toBe(0)
			expect(seen.pendingNotifications).toBe(0)

			// the watchdog releases the buffer within a bounded time
			await waitFor(() => seen.pendingNotifications === 1)
			expect(seen.messageUpserts).toBe(1)
			// note: chats.ts now re-buffers for its history-sync phase on
			// this very signal — that is a separate, later buffer with its
			// own release conditions, so isBuffering() may be true again
		} finally {
			await sock.end(undefined)
			await clear()
		}
	}, 10_000)

	it('does not signal receivedPendingNotifications from ordinary stanza traffic — only the stanza or the watchdog may', async () => {
		const { sock, clear, seen } = await setupSocket(150)
		try {
			await fire('CB:receipt', RECEIPT_NODE)
			// the receipt was processed and delivered, yet the flag that
			// consumers gate on is still withheld
			expect(seen.messageUpdates).toBe(1)
			expect(seen.pendingNotifications).toBe(0)

			await waitFor(() => seen.pendingNotifications === 1)
		} finally {
			await sock.end(undefined)
			await clear()
		}
	}, 10_000)

	it('releases via the offline stanza and does not release a second time on the watchdog', async () => {
		const { sock, clear, seen } = await setupSocket(150)
		try {
			await fire('CB:receipt', RECEIPT_NODE)
			await fire('CB:ib,,offline', OFFLINE_DONE_NODE)

			expect(seen.pendingNotifications).toBe(1)
			expect(seen.messageUpdates).toBe(1)

			// well past the watchdog deadline: no duplicate release
			await sleep(400)
			expect(seen.pendingNotifications).toBe(1)
			expect(seen.messageUpdates).toBe(1)
		} finally {
			await sock.end(undefined)
			await clear()
		}
	}, 10_000)

	it('keeps the legacy behaviour when the fallback is disabled', async () => {
		const { sock, clear, seen } = await setupSocket(0)
		try {
			sock.ev.emit('messages.upsert', {
				messages: [
					{
						key: { remoteJid: '9876543210@s.whatsapp.net', id: 'MSG-1', fromMe: false },
						messageTimestamp: 1700000000,
						message: { conversation: 'hello' }
					} as WAMessage
				],
				type: 'notify'
			})
			await sleep(400)

			expect(seen.pendingNotifications).toBe(0)
			expect(seen.messageUpserts).toBe(0)
			expect(sock.ev.isBuffering()).toBe(true)
		} finally {
			await sock.end(undefined)
			await clear()
		}
	}, 10_000)
})
