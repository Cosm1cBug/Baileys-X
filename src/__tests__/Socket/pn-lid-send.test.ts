import NodeCache from '@cacheable/node-cache'
import { jest } from '@jest/globals'
import P from 'pino'
import { DEFAULT_CONNECTION_CONFIG } from '../../Defaults'
import type { SignalDataSet, SignalDataTypeMap, SignalKeyStore } from '../../Types'
import { addTransactionCapability, initAuthCreds } from '../../Utils/auth-utils'
import type { BinaryNode } from '../../WABinary'

const makeNewsletterSocket = jest.fn()
jest.unstable_mockModule('../../Socket/newsletter', () => ({ makeNewsletterSocket }))
const { makeMessagesSocket } = await import('../../Socket/messages-send')

const ME = 'me@s.whatsapp.net'
const CONTACT = 'contact@s.whatsapp.net'
const CONTACT_LID = 'contact@lid'
const logger = P({ level: 'silent' })

type LidBehavior = 'mapped' | 'none' | 'throws'

function makeFixture(lidBehavior: LidBehavior) {
	const data: SignalDataSet = {}
	const store: SignalKeyStore = {
		get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
			const result: Record<string, SignalDataTypeMap[T]> = {}
			for (const id of ids) {
				const value = data[type]?.[id]
				if (value !== undefined && value !== null) result[id] = value
			}

			return result
		},
		set(update) {
			for (const type of Object.keys(update) as (keyof SignalDataTypeMap)[]) {
				Object.assign((data[type] ??= {}), update[type])
			}
		}
	}
	const keys = addTransactionCapability(store, logger, { maxCommitRetries: 1, delayBetweenTriesMs: 0 })
	const creds = initAuthCreds()
	creds.me = { id: ME, name: 'Test' }
	const query = jest.fn<(node: BinaryNode) => Promise<BinaryNode>>()
	const sendNode = jest.fn<(node: BinaryNode) => Promise<void>>().mockResolvedValue(undefined)
	const getLIDForPN = jest.fn<(pn: string) => Promise<string | null>>().mockImplementation(async () => {
		if (lidBehavior === 'throws') {
			throw new Error('usync unavailable')
		}

		return lidBehavior === 'mapped' ? CONTACT_LID : null
	})
	const userDevicesCache = new NodeCache({ checkperiod: 0, useClones: false })
	userDevicesCache.set('me', [])
	userDevicesCache.set('contact', [{ user: 'contact', server: 's.whatsapp.net', device: 0 }])
	makeNewsletterSocket.mockReturnValue({
		authState: { creds, keys },
		signalRepository: {
			lidMapping: {
				getLIDForPN,
				getPNForLID: async () => CONTACT
			},
			validateSession: async () => ({ exists: true }),
			encryptMessage: async () => ({ type: 'msg', ciphertext: Buffer.from('synthetic-ciphertext') }),
			encryptGroupMessage: async () => ({
				ciphertext: Buffer.from('synthetic-ciphertext'),
				senderKeyDistributionMessage: Buffer.from('synthetic-skdm')
			})
		},
		query,
		sendNode,
		serverProps: { privacyTokenOn1to1: false, lidTrustedTokenIssueToLid: false },
		registerSocketEndHandler: jest.fn(),
		messageMutex: {
			mutex: async (_key: string, work: () => Promise<unknown>) => {
				await work()
			}
		},
		upsertMessage: jest.fn().mockImplementation(async () => undefined)
	})
	const socket = makeMessagesSocket({
		...DEFAULT_CONNECTION_CONFIG,
		logger,
		auth: { creds, keys },
		userDevicesCache: {
			get: <T>(key: string) => userDevicesCache.get(key) as T | undefined,
			set: (key, value) => userDevicesCache.set(key, value),
			del: key => userDevicesCache.del(key),
			flushAll: () => userDevicesCache.flushAll()
		},
		enableRecentMessageCache: false
	})

	const lastMessageStanza = () => {
		const stanza = [...sendNode.mock.calls].map(([node]) => node).find(node => node.tag === 'message')
		if (!stanza) {
			throw new Error('no message stanza was sent')
		}

		return stanza
	}

	return { socket, sendNode, getLIDForPN, lastMessageStanza }
}

describe('PN to LID resolution before sending (#2711)', () => {
	afterEach(() => {
		jest.restoreAllMocks()
		makeNewsletterSocket.mockReset()
	})

	it('addresses the relayed stanza to the LID when a mapping exists', async () => {
		const { socket, lastMessageStanza, getLIDForPN } = makeFixture('mapped')

		await socket.relayMessage(CONTACT, { conversation: 'test' }, { messageId: 'msg-1' })

		expect(getLIDForPN).toHaveBeenCalledWith(CONTACT)
		expect(lastMessageStanza().attrs.to).toBe(CONTACT_LID)
	})

	it('sendMessage normalizes the destination and message key to the LID', async () => {
		const { socket, lastMessageStanza, getLIDForPN } = makeFixture('mapped')

		const msg = await socket.sendMessage(CONTACT, { text: 'hello' })

		expect(msg!.key.remoteJid).toBe(CONTACT_LID)
		expect(lastMessageStanza().attrs.to).toBe(CONTACT_LID)
		// looked up once in sendMessage; relayMessage sees the LID and skips
		expect(getLIDForPN).toHaveBeenCalledTimes(1)
	})

	it('keeps the PN destination when no mapping exists', async () => {
		const { socket, lastMessageStanza } = makeFixture('none')

		const msg = await socket.sendMessage(CONTACT, { text: 'hello' })

		expect(msg!.key.remoteJid).toBe(CONTACT)
		expect(lastMessageStanza().attrs.to).toBe(CONTACT)
	})

	it('still sends to the PN when the mapping lookup throws', async () => {
		const { socket, lastMessageStanza } = makeFixture('throws')

		const msg = await socket.sendMessage(CONTACT, { text: 'hello' })

		expect(msg!.key.remoteJid).toBe(CONTACT)
		expect(lastMessageStanza().attrs.to).toBe(CONTACT)
	})

	it('never looks up mappings for LID, group, newsletter or status destinations', async () => {
		const { socket, getLIDForPN } = makeFixture('mapped')

		await socket.relayMessage(CONTACT_LID, { conversation: 'test' }, { messageId: 'msg-lid' })
		await socket.relayMessage('status@broadcast', { conversation: 'test' }, { messageId: 'msg-status' })

		expect(getLIDForPN).not.toHaveBeenCalled()
	})

	it('exposes the recently-changed-identities set for messages-recv to manage', () => {
		const { socket } = makeFixture('none')
		expect(socket.recentlyChangedIdentities).toBeInstanceOf(Set)
	})
})
