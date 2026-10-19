import { jest } from '@jest/globals'
import { EventEmitter } from 'events'
import P from 'pino'
import { proto } from '../../../WAProto/index.js'
import type { BinaryNode } from '../../WABinary'

const sentFrames: Uint8Array[] = []
const capturedMessages: proto.IMessage[] = []

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
		sentFrames.push(Uint8Array.from(data))
		cb?.()
		return true
	}
}

jest.unstable_mockModule('../../Socket/Client/websocket', () => ({ WebSocketClient: RecordingSocketClient }))

const { default: makeWASocket } = await import('../../Socket')
const { DEFAULT_CONNECTION_CONFIG } = await import('../../Defaults')
const { initAuthCreds } = await import('../../Utils/auth-utils')
const { decodeBinaryNode } = await import('../../WABinary')
const { normalizeMessageContent } = await import('../../Utils/messages')

const meId = '5511999999999:4@s.whatsapp.net'
const meLid = '123456789012345:4@lid'
const targetJid = '5511888888888@s.whatsapp.net'
const targetUser = '5511888888888'

const decodeSentNode = async (frame: Uint8Array): Promise<BinaryNode> => {
	for (let offset = 0; offset + 3 <= frame.length; offset++) {
		const length = (frame[offset]! << 16) | (frame[offset + 1]! << 8) | frame[offset + 2]!
		if (length === frame.length - offset - 3) {
			return decodeBinaryNode(Buffer.from(frame.subarray(offset + 3)))
		}
	}

	throw new Error('frame without a length prefix')
}

const withSock = async (
	platform: string | undefined,
	run: (sock: ReturnType<typeof makeWASocket>) => Promise<void>
) => {
	const creds = initAuthCreds()
	creds.me = { id: meId, lid: meLid, name: 'Test' }
	if (platform) {
		creds.platform = platform
	}

	const sock = makeWASocket({
		...DEFAULT_CONNECTION_CONFIG,
		// fire-and-forget queries (privacy tokens etc) must not wait on a server that never replies
		defaultQueryTimeoutMs: 250,
		logger: P({ level: 'silent' }),
		auth: { creds, keys: { get: async () => ({}), set: async () => {} } },
		patchMessageBeforeSending: msg => {
			capturedMessages.push(msg)
			return msg
		},
		makeSignalRepository: (auth, logger, pnFromLIDUSync) => {
			const repo = DEFAULT_CONNECTION_CONFIG.makeSignalRepository(auth, logger, pnFromLIDUSync)
			// no network: LID lookups resolve to empty and sessions already exist
			repo.lidMapping.getLIDForPN = async () => null
			repo.lidMapping.getPNForLID = async () => null
			repo.lidMapping.getLIDsForPNs = async () => []
			repo.lidMapping.getPNsForLIDs = async () => []
			return {
				...repo,
				validateSession: async () => ({ exists: true }),
				encryptMessage: async () => ({ type: 'msg' as const, ciphertext: new Uint8Array([1, 2, 3]) })
			}
		}
	})

	try {
		sentFrames.length = 0
		capturedMessages.length = 0
		// prefill the device cache so the fan-out does not need a USync round-trip
		await sock.userDevicesCache.set(targetUser, [{ user: targetUser, server: 's.whatsapp.net', device: 0 }])
		await sock.userDevicesCache.set('5511999999999', [{ user: '5511999999999', server: 's.whatsapp.net', device: 4 }])
		await run(sock)
	} finally {
		// let the socket's startup tasks settle first, or end() leaves the event buffer timer running
		await new Promise(resolve => setTimeout(resolve, 50))
		await sock.end(undefined)
	}
}

describe('socket chain integration', () => {
	it('exposes the username, ai-group and interop layers on the final socket', async () => {
		await withSock(undefined, async sock => {
			// username layer (via messages-send)
			expect(typeof sock.checkUsername).toBe('function')
			expect(typeof sock.setUsername).toBe('function')
			expect(typeof sock.getMyUsername).toBe('function')
			expect(typeof sock.findUserByUsername).toBe('function')
			expect(typeof sock.fetchContactUsernames).toBe('function')
			// ai groups + interop layers (top of the chain)
			expect(typeof sock.aiGroupMetadata).toBe('function')
			expect(typeof sock.aiGroupAddBot).toBe('function')
			expect(typeof sock.fetchIntegrators).toBe('function')
			expect(typeof sock.reportInteropSpam).toBe('function')
			expect(typeof sock.acceptInteropTOS).toBe('function')
			// call signalling + rich senders
			expect(typeof sock.acceptCall).toBe('function')
			expect(typeof sock.terminateCall).toBe('function')
			expect(typeof sock.sendInteractive).toBe('function')
			expect(typeof sock.sendHtml).toBe('function')
		})
	})
})

const sentMessageStanzas = async () => {
	const nodes = await Promise.all(sentFrames.map(decodeSentNode))
	return nodes.filter(node => node.tag === 'message')
}

describe('sendInteractive', () => {
	it('sends a native-flow interactive button on non-iOS pairings', async () => {
		await withSock(undefined, async sock => {
			await sock.sendInteractive(targetJid, 'Tap below to continue')
			// patchMessageBeforeSending fires once per recipient device
			expect(capturedMessages.length).toBeGreaterThanOrEqual(1)

			const inner = normalizeMessageContent(capturedMessages[0]!)!
			expect(inner.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name).toBe('inapp_signup')

			const stanzas = await sentMessageStanzas()
			expect(stanzas.some(stanza => stanza.attrs.to === targetJid)).toBe(true)
		})
	})

	it('honours a custom button name and message text', async () => {
		await withSock(undefined, async sock => {
			await sock.sendInteractive(targetJid, 'Choose', { buttonName: 'cta_url', title: 'Bot', footer: 'Footer' })
			const inner = normalizeMessageContent(capturedMessages[0]!)!
			expect(inner.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name).toBe('cta_url')
			expect(inner.interactiveMessage?.body?.text).toBe('Choose')
		})
	})

	it('falls back to a plain text message on iOS pairings', async () => {
		await withSock('ios', async sock => {
			await sock.sendInteractive(targetJid, 'Tap below to continue')
			const inner = normalizeMessageContent(capturedMessages[0]!)!
			expect(inner.interactiveMessage).toBeFalsy()
			expect(inner.extendedTextMessage?.text ?? inner.conversation).toBe('Tap below to continue')
		})
	})

	it('treats the smbi platform as iOS too', async () => {
		await withSock('smbi', async sock => {
			await sock.sendInteractive(targetJid, 'plain')
			const inner = normalizeMessageContent(capturedMessages[0]!)!
			expect(inner.interactiveMessage).toBeFalsy()
			expect(inner.extendedTextMessage?.text ?? inner.conversation).toBe('plain')
		})
	})
})

describe('sendHtml', () => {
	it('sends a rich-response html payload', async () => {
		await withSock(undefined, async sock => {
			await sock.sendHtml(targetJid, '<b>hi</b>')
			expect(capturedMessages.length).toBeGreaterThanOrEqual(1)

			const rich = capturedMessages[0]!.botForwardedMessage?.message?.richResponseMessage
			expect(rich).toBeDefined()
			const unified = JSON.parse(Buffer.from(rich!.unifiedResponse!.data!).toString('utf-8'))
			expect(unified.sections[0].view_model.primitive.__typename).toBe('FOAHtmlPrimitiveDemoDONOTUSE')
			expect(unified.sections[0].view_model.primitive.payload).toBe('<b>hi</b>')

			const stanzas = await sentMessageStanzas()
			expect(stanzas.some(stanza => stanza.attrs.to === targetJid)).toBe(true)
		})
	})

	it('merges extra context info', async () => {
		await withSock(undefined, async sock => {
			await sock.sendHtml(targetJid, 'x', { contextInfo: { forwardingScore: 5 } })
			const rich = capturedMessages[0]!.botForwardedMessage?.message?.richResponseMessage
			expect(rich?.contextInfo?.isForwarded).toBe(true)
			expect(rich?.contextInfo?.forwardingScore).toBe(5)
		})
	})
})
