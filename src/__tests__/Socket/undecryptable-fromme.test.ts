import { jest } from '@jest/globals'
import type { BinaryNode } from '../../WABinary'

/**
 * An undecryptable echo of our OWN message (synced from another of our devices,
 * encrypted under that device's session) must be acked WITHOUT a retry receipt:
 * asking for a resend of our own message makes the server answer with
 * `<stream:error><ack/>` and tear the stream down. The CIPHERTEXT stub must
 * still be upserted so the app can see the placeholder.
 */

const send = jest.fn((_data: unknown, cb?: (err?: Error) => void) => cb?.())
const wsHandlers = new Map<string, (node: BinaryNode) => unknown>()

jest.unstable_mockModule('../../Socket/Client/websocket', () => ({
	WebSocketClient: jest.fn().mockImplementation(() => ({
		connect: jest.fn(),
		close: jest.fn(),
		on: jest.fn((event: string, handler: (node: BinaryNode) => unknown) => {
			wsHandlers.set(event, handler)
		}),
		off: jest.fn(),
		removeAllListeners: jest.fn(),
		emit: jest.fn(),
		send,
		isOpen: true
	}))
}))

const { DEFAULT_CONNECTION_CONFIG, NOISE_WA_HEADER } = await import('../../Defaults')
const makeWASocket = (await import('../../Socket')).default
const { decodeBinaryNode } = await import('../../WABinary/decode')
const { makeSession } = await import('../TestUtils/session')

const ME_PN = '1234567890@s.whatsapp.net'

const decodeFrame = async (frame: Buffer) => {
	const intro = Buffer.from(NOISE_WA_HEADER)
	const body = frame.subarray(0, intro.length).equals(intro) ? frame.subarray(intro.length) : frame
	return decodeBinaryNode(body.subarray(3))
}

describe('undecryptable fromMe message handling', () => {
	it('acks without a retry receipt and still upserts the stub', async () => {
		wsHandlers.clear()
		const { state, clear } = await makeSession()
		state.creds.me = { id: ME_PN, lid: '1234567890@lid', name: 'Test User' }

		const sock = makeWASocket({
			...DEFAULT_CONNECTION_CONFIG,
			auth: state,
			retryRequestDelayMs: 0,
			enableRecentMessageCache: false,
			markOnlineOnConnect: false,
			connectTimeoutMs: 200,
			syncFullHistory: false
		})

		// pre-seed the LID mapping so PN->LID resolution stays local (no USync query)
		await sock.signalRepository.lidMapping.storeLIDPNMappings([{ lid: '1234567890@lid', pn: ME_PN }])

		const messageHandler = wsHandlers.get('CB:message')
		expect(messageHandler).toBeDefined()

		const upserts: unknown[] = []
		sock.ev.on('messages.upsert', data => upserts.push(data))

		send.mockClear()
		await messageHandler!({
			tag: 'message',
			attrs: { id: 'OWN_ECHO_1', from: ME_PN, t: String(Math.floor(Date.now() / 1000)) },
			content: [{ tag: 'enc', attrs: { v: '2', type: 'msg' }, content: Buffer.from('not-a-real-ciphertext') }]
		})
		// allow the ack path to settle
		await new Promise(resolve => setTimeout(resolve, 100))

		const sentNodes = await Promise.all((send.mock.calls as unknown as [Buffer][]).map(([frame]) => decodeFrame(frame)))
		const tags = sentNodes.map(n => n.tag)

		// stanza acked, but NO retry receipt for our own message
		expect(tags).toContain('ack')
		expect(tags).not.toContain('receipt')

		// the undecryptable stub is still delivered to the app
		expect(upserts).toHaveLength(1)

		await sock.end(new Error('Test completed'))
		await clear()
	}, 20_000)
})
