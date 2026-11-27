import { jest } from '@jest/globals'
import { EventEmitter } from 'events'
import P from 'pino'
import type { BinaryNode } from '../../WABinary'

const frames: Uint8Array[] = []
class MockSocket extends EventEmitter {
	isOpen = true
	isClosed = false
	isClosing = false
	isPaused = false
	connect() {}
	close() {
		this.isOpen = false
		this.isClosed = true
	}
	send(data: Uint8Array, callback?: (error?: Error) => void) {
		frames.push(Uint8Array.from(data))
		callback?.()
		return true
	}
}

jest.unstable_mockModule('../../Socket/Client/websocket', () => ({ WebSocketClient: MockSocket }))
const { makeSocket } = await import('../../Socket/socket')
const { DEFAULT_CONNECTION_CONFIG } = await import('../../Defaults')
const { initAuthCreds } = await import('../../Utils/auth-utils')
const { decodeBinaryNode } = await import('../../WABinary')

const decodeFrame = async (frame: Uint8Array): Promise<BinaryNode> => {
	for (let offset = 0; offset + 3 <= frame.length; offset++) {
		const len = (frame[offset]! << 16) | (frame[offset + 1]! << 8) | frame[offset + 2]!
		if (len === frame.length - offset - 3) return decodeBinaryNode(Buffer.from(frame.subarray(offset + 3)))
	}

	throw new Error('frame without length')
}

describe('offline batch socket integration', () => {
	it('sends the batch request on preview and stops after the completion stanza', async () => {
		frames.length = 0
		const creds = initAuthCreds()
		creds.me = { id: '1234567890@s.whatsapp.net', name: 'Test' }
		const sock = makeSocket({
			...DEFAULT_CONNECTION_CONFIG,
			logger: P({ level: 'silent' }),
			auth: { creds, keys: { get: async () => ({}), set: async () => {} } },
			initialBufferTimeoutMs: 0
		})
		try {
			sock.ws.emit('CB:ib,,offline_preview', { tag: 'ib', attrs: {}, content: [{ tag: 'offline_preview', attrs: {} }] })
			await new Promise(resolve => setImmediate(resolve))
			expect(frames).toHaveLength(1)
			expect(await decodeFrame(frames[0]!)).toEqual({
				tag: 'ib',
				attrs: {},
				content: [{ tag: 'offline_batch', attrs: { count: '100' } }]
			})
			sock.ws.emit('CB:ib,,offline', { tag: 'ib', attrs: {}, content: [{ tag: 'offline', attrs: { count: '0' } }] })
			sock.ws.emit('CB:ib,,offline_preview', { tag: 'ib', attrs: {}, content: [{ tag: 'offline_preview', attrs: {} }] })
			await new Promise(resolve => setImmediate(resolve))
			expect(frames).toHaveLength(1)
		} finally {
			await sock.end(undefined)
		}
	})
})
