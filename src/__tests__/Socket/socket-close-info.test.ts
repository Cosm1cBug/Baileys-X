import { jest } from '@jest/globals'

/**
 * The `connection.update` close error should carry the WebSocket close frame
 * (code + reason) so operators can tell a server-side recycle (1000/1001)
 * from a dead TCP path (1006) or a server fault (1011/1012/1013), instead of
 * every disconnect looking like an identical 428 "Connection Terminated".
 */

const send = jest.fn((_data: unknown, cb?: (err?: Error) => void) => cb?.())
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
		send,
		isOpen: true
	}))
}))

const { DEFAULT_CONNECTION_CONFIG } = await import('../../Defaults')
const makeWASocket = (await import('../../Socket')).default
const { makeSession } = await import('../TestUtils/session')
type ConnectionState = import('../../Types').ConnectionState

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

	const closeHandlers = wsHandlers.get('close') ?? []
	expect(closeHandlers.length).toBeGreaterThan(0)

	const updates: Partial<ConnectionState>[] = []
	sock.ev.on('connection.update', update => updates.push(update))

	const fireClose = async (...args: unknown[]) => {
		for (const handler of closeHandlers) {
			try {
				await handler(...(args as never[]))
			} catch {
				// handshake helper handlers reject their promises; the permanent
				// close handler is the one that ends the socket
			}
		}

		// end() is fire-and-forget from the ws handler; poll briefly for the update
		for (let i = 0; i < 40 && !updates.some(u => u.connection === 'close' && u.lastDisconnect); i++) {
			await new Promise(resolve => setTimeout(resolve, 25))
		}

		return updates.find(u => u.connection === 'close' && u.lastDisconnect)
	}

	return { sock, clear, fireClose }
}

describe('websocket close diagnostics', () => {
	it('includes the close code in the connection-closed error', async () => {
		const { clear, fireClose } = await makeSocket()

		const close = await fireClose(1006, Buffer.from(''))

		expect(close).toBeDefined()
		expect(close!.lastDisconnect?.error?.message).toContain('Connection Terminated')
		expect(close!.lastDisconnect?.error?.message).toContain('ws close 1006')

		await clear()
	})

	it('includes a textual close reason when the server sends one', async () => {
		const { clear, fireClose } = await makeSocket()

		const close = await fireClose(1000, 'server restart')

		expect(close!.lastDisconnect?.error?.message).toContain('ws close 1000: server restart')

		await clear()
	})

	it('keeps the plain message when no close frame info is available', async () => {
		const { clear, fireClose } = await makeSocket()

		const close = await fireClose()

		expect(close!.lastDisconnect?.error?.message).toBe('Connection Terminated')

		await clear()
	})
})
