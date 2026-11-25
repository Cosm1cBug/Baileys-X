import { jest } from '@jest/globals'
import { EventEmitter } from 'events'
import { readFile } from 'fs/promises'
import P from 'pino'
import { proto } from '../../../WAProto/index.js'
import type { MiscMessageGenerationOptions, WAMediaUploadFunction } from '../../Types'

const relayed: proto.IMessage[] = []
const frames: Uint8Array[] = []
class RecordingSocketClient extends EventEmitter {
	isOpen = true
	isClosed = false
	isClosing = false
	isConnecting = false
	connect() {}
	close() {
		this.isOpen = false
		this.isClosed = true
	}
	send(data: Uint8Array, cb?: (err?: Error) => void) {
		frames.push(Uint8Array.from(data))
		cb?.()
		return true
	}
}

jest.unstable_mockModule('../../Socket/Client/websocket', () => ({ WebSocketClient: RecordingSocketClient }))
const { default: makeWASocket } = await import('../../Socket')
const { DEFAULT_CONNECTION_CONFIG } = await import('../../Defaults')
const { initAuthCreds } = await import('../../Utils/auth-utils')
const { decodeBinaryNode } = await import('../../WABinary')

const withSocket = async (run: (sock: ReturnType<typeof makeWASocket>) => Promise<void>) => {
	const creds = initAuthCreds()
	creds.me = { id: '5511999999999:4@s.whatsapp.net', lid: '123456789012345:4@lid', name: 'Test' }
	const sock = makeWASocket({
		...DEFAULT_CONNECTION_CONFIG,
		defaultQueryTimeoutMs: 250,
		logger: P({ level: 'silent' }),
		auth: { creds, keys: { get: async () => ({}), set: async () => {} } },
		patchMessageBeforeSending: message => {
			relayed.push(message)
			return message
		},
		makeSignalRepository: (auth, logger, pnFromLIDUSync) => {
			const repo = DEFAULT_CONNECTION_CONFIG.makeSignalRepository(auth, logger, pnFromLIDUSync)
			repo.lidMapping.getLIDForPN = async () => null
			repo.lidMapping.getLIDsForPNs = async () => []
			return {
				...repo,
				validateSession: async () => ({ exists: true }),
				encryptMessage: async () => ({ type: 'msg' as const, ciphertext: new Uint8Array([1, 2, 3]) })
			}
		}
	})
	try {
		relayed.length = 0
		frames.length = 0
		await sock.userDevicesCache.set('5511888888888', [{ user: '5511888888888', server: 's.whatsapp.net', device: 0 }])
		await sock.userDevicesCache.set('5511999999999', [{ user: '5511999999999', server: 's.whatsapp.net', device: 4 }])
		await run(sock)
	} finally {
		await new Promise(resolve => setTimeout(resolve, 50))
		await sock.end(undefined)
	}
}

describe('audio sticker sendMessage', () => {
	it.each(['none', 'sticker', 'audio'])('relays only after both uploads succeed (failure=%s)', async failure => {
		const sticker = await readFile('src/__tests__/fixtures/audio-sticker/static.webp')
		const audio = await readFile('src/__tests__/fixtures/audio-sticker/tone.ogg')
		const uploads: string[] = []
		const upload: WAMediaUploadFunction = async (_path, { mediaType }) => {
			uploads.push(mediaType)
			if (mediaType === failure) throw new Error('media upload failed')
			return { mediaUrl: 'https://example.invalid/media', directPath: `/${mediaType}` }
		}

		// Inject a mock upload through the existing options spread, without a live connection.
		const options: MiscMessageGenerationOptions & { upload: WAMediaUploadFunction } = { upload }
		await withSocket(async sock => {
			const send = sock.sendMessage('5511888888888@s.whatsapp.net', { audioSticker: { sticker, audio } }, options)
			if (failure !== 'none') {
				await expect(send).rejects.toThrow('media upload failed')
				expect(relayed).toHaveLength(0)
			} else {
				const sent = await send
				expect(relayed.length).toBeGreaterThan(0)
				expect(relayed[0]!.audioStickerMessage?.message?.stickerMessage?.audioMessage).toBeTruthy()
				const nodes = []
				for (const frame of frames) {
					for (let offset = 0; offset + 3 <= frame.length; offset++) {
						const length = (frame[offset]! << 16) | (frame[offset + 1]! << 8) | frame[offset + 2]!
						if (length === frame.length - offset - 3) {
							nodes.push(await decodeBinaryNode(Buffer.from(frame.subarray(offset + 3))))
							break
						}
					}
				}

				// The tester's injected wrapper was invisible to classification before encoding.
				const stanza = nodes.find(node => node.tag === 'message' && node.attrs.id === sent?.key.id)
				expect(stanza?.attrs.type).toBe('text')
			}

			expect(uploads).toEqual(failure === 'sticker' ? ['sticker'] : ['sticker', 'audio'])
		})
	})
})
