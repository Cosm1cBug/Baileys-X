import { jest } from '@jest/globals'
import { EventEmitter } from 'events'
import P from 'pino'
import { proto } from '../../../WAProto/index.js'

/**
 * sendRichTable / sendRichCode socket sugar (fork-audit item, ZeroneX
 * ergonomics over Baileys-X's proto-typed AIRich engine): the helpers must
 * relay a real richResponseMessage — table/code submessages with typed
 * metadata — not just build content nobody sends.
 */

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

	send(_data: Uint8Array, cb?: (err?: Error) => void) {
		cb?.()
		return true
	}
}

jest.unstable_mockModule('../../Socket/Client/websocket', () => ({ WebSocketClient: RecordingSocketClient }))

const { default: makeWASocket } = await import('../../Socket')
const { DEFAULT_CONNECTION_CONFIG } = await import('../../Defaults')
const { initAuthCreds } = await import('../../Utils/auth-utils')

const meId = '5511999999999:4@s.whatsapp.net'
const meLid = '123456789012345:4@lid'
const targetJid = '5511888888888@s.whatsapp.net'
const targetUser = '5511888888888'

const withSock = async (run: (sock: ReturnType<typeof makeWASocket>) => Promise<void>) => {
	const creds = initAuthCreds()
	creds.me = { id: meId, lid: meLid, name: 'Test' }

	const sock = makeWASocket({
		...DEFAULT_CONNECTION_CONFIG,
		defaultQueryTimeoutMs: 250,
		logger: P({ level: 'silent' }),
		auth: { creds, keys: { get: async () => ({}), set: async () => {} } },
		patchMessageBeforeSending: msg => {
			capturedMessages.push(msg)
			return msg
		},
		makeSignalRepository: (auth, logger, pnFromLIDUSync) => {
			const repo = DEFAULT_CONNECTION_CONFIG.makeSignalRepository(auth, logger, pnFromLIDUSync)
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
		capturedMessages.length = 0
		await sock.userDevicesCache.set(targetUser, [{ user: targetUser, server: 's.whatsapp.net', device: 0 }])
		await sock.userDevicesCache.set('5511999999999', [{ user: '5511999999999', server: 's.whatsapp.net', device: 4 }])
		await run(sock)
	} finally {
		await new Promise(resolve => setTimeout(resolve, 50))
		await sock.end(undefined)
	}
}

const sentRichMessage = () => {
	expect(capturedMessages.length).toBeGreaterThanOrEqual(1)
	const rich = capturedMessages[0]!.botForwardedMessage?.message?.richResponseMessage
	expect(rich).toBeTruthy()
	return rich!
}

describe('sendRichTable / sendRichCode', () => {
	it('are exposed on the socket', async () => {
		await withSock(async sock => {
			expect(typeof sock.sendRichTable).toBe('function')
			expect(typeof sock.sendRichCode).toBe('function')
		})
	})

	it('sendRichTable relays a rich-response table (first row is the heading)', async () => {
		await withSock(async sock => {
			await sock.sendRichTable(targetJid, [
				['Name', 'Score'],
				['Ada', '10'],
				['Grace', '9']
			])

			const rich = sentRichMessage()
			const table = rich.submessages?.find(s => s.tableMetadata)
			expect(table).toBeTruthy()
			expect(table!.tableMetadata!.rows).toHaveLength(3)
			expect(table!.tableMetadata!.rows![0]!.isHeading).toBe(true)
			expect(table!.tableMetadata!.rows![1]!.items).toEqual(['Ada', '10'])
		})
	})

	it('sendRichTable rejects fewer than two rows', async () => {
		await withSock(async sock => {
			await expect(sock.sendRichTable(targetJid, [['only-a-header']])).rejects.toThrow(
				'at least a header row'
			)
		})
	})

	it('sendRichCode relays a highlighted code block with the requested language', async () => {
		await withSock(async sock => {
			await sock.sendRichCode(targetJid, 'const answer: number = 42', { language: 'typescript' })

			const rich = sentRichMessage()
			const code = rich.submessages?.find(s => s.codeMetadata)
			expect(code).toBeTruthy()
			expect(code!.codeMetadata!.codeLanguage).toBe('typescript')
			expect(code!.codeMetadata!.codeBlocks?.length).toBeGreaterThanOrEqual(1)
		})
	})

	it('sendRichCode defaults to javascript', async () => {
		await withSock(async sock => {
			await sock.sendRichCode(targetJid, 'let x = 1')

			const rich = sentRichMessage()
			const code = rich.submessages?.find(s => s.codeMetadata)
			expect(code!.codeMetadata!.codeLanguage).toBe('javascript')
		})
	})
})
