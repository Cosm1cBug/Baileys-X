import { jest } from '@jest/globals'

/**
 * Phase 2 (finding S2) production wiring: the socket must expose PER-KEY
 * mutexes for message processing and app-state patching, so unrelated chats /
 * collections never park behind one another.
 *
 * With the old global `makeMutex()` these calls reject outright — the plain
 * mutex accepts only a task, so a (key, task) call is not even runnable —
 * and semantically every key would share one queue.
 */

jest.unstable_mockModule('../../Socket/Client/websocket', () => ({
	WebSocketClient: jest.fn().mockImplementation(() => ({
		connect: jest.fn(),
		close: jest.fn(),
		on: jest.fn(),
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

const CHAT_A = '11111111111@s.whatsapp.net'
const CHAT_B = '22222222222@s.whatsapp.net'

const makeSocket = async () => {
	const { state, clear } = await makeSession()
	state.creds.me = { id: '1234567890@s.whatsapp.net', name: 'Test User' }

	const sock = makeWASocket({
		...DEFAULT_CONNECTION_CONFIG,
		auth: state,
		markOnlineOnConnect: false,
		connectTimeoutMs: 200,
		syncFullHistory: false
	})

	return { sock, clear }
}

describe('socket keyed mutexes', () => {
	it('messageMutex serializes per chat, not globally', async () => {
		const { sock, clear } = await makeSocket()

		try {
			let releaseA: () => void = () => {}

			const gateA = new Promise<void>(resolve => {
				releaseA = resolve
			})
			let aFirstDone = false
			let bDone = false
			let aSecondDone = false

			const pAFirst = sock.messageMutex
				.mutex(CHAT_A, async () => {
					await gateA
				})
				.then(() => {
					aFirstDone = true
				})
			const pASecond = sock.messageMutex
				.mutex(CHAT_A, async () => undefined)
				.then(() => {
					aSecondDone = true
				})
			const pB = sock.messageMutex
				.mutex(CHAT_B, async () => undefined)
				.then(() => {
					bDone = true
				})

			// chat B completes even though chat A is parked behind its gate
			await pB
			expect(bDone).toBe(true)
			expect(aFirstDone).toBe(false)
			// ...while the second chat-A task still waits for the first
			expect(aSecondDone).toBe(false)

			releaseA()
			await pAFirst
			await pASecond
			expect(aFirstDone).toBe(true)
			expect(aSecondDone).toBe(true)
		} finally {
			await clear()
		}
	})

	it('appStatePatchMutex serializes per collection, not globally', async () => {
		const { sock, clear } = await makeSocket()

		try {
			let releaseRegular: () => void = () => {}

			const gateRegular = new Promise<void>(resolve => {
				releaseRegular = resolve
			})
			let criticalDone = false

			const pRegular = sock.appStatePatchMutex.mutex('regular', async () => {
				await gateRegular
			})
			const pCritical = sock.appStatePatchMutex
				.mutex('critical_block', async () => undefined)
				.then(() => {
					criticalDone = true
				})

			await pCritical
			expect(criticalDone).toBe(true)

			releaseRegular()
			await pRegular
		} finally {
			await clear()
		}
	})
})
