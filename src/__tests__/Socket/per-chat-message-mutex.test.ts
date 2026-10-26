import { jest } from '@jest/globals'
import { proto } from '../../../WAProto/index.js'
import type { SocketConfig, WAMessage } from '../../Types'
import type { ILogger } from '../../Utils/logger'
import { makeKeyedMutex } from '../../Utils/make-mutex'
import { MessageRetryCoordinator, MessageRetryManager } from '../../Utils/message-retry-manager'
import type { BinaryNode } from '../../WABinary'

/**
 * Phase 2 (finding S2): incoming message processing used to serialize behind
 * ONE global mutex, so a slow chat (heavy decrypt, retry fan-out, app-state
 * work) parked every other chat behind it. Processing is now locked per chat:
 * strict arrival order within a chat, parallel across chats.
 *
 * These tests drive the real makeMessagesRecvSocket with a real
 * makeKeyedMutex and a gated upsertMessage — the last step of the per-message
 * pipeline (decrypt -> receipts -> upsert):
 *  - chat B must fully process while chat A is parked mid-pipeline
 *  - a second message in chat A must not enter the pipeline until the first
 *    one leaves it, and the upsert order must match arrival order
 */

const makeMessagesSocket = jest.fn()
jest.unstable_mockModule('../../Socket/messages-send', () => ({ makeMessagesSocket }))

const { makeMessagesRecvSocket } = await import('../../Socket/messages-recv')

const noopLogger: ILogger = {
	level: 'silent',
	child: () => noopLogger,
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {}
}

const immediateMutex = {
	mutex: async <T>(task: () => Promise<T> | T) => task()
}

const CHAT_A = '11111111111@s.whatsapp.net'
const CHAT_B = '22222222222@s.whatsapp.net'

const plaintextNode = (from: string, id: string): BinaryNode => ({
	tag: 'message',
	attrs: { id, from, t: '1700000000' },
	content: [
		{
			tag: 'plaintext',
			attrs: {},
			content: proto.Message.encode(proto.Message.create({ conversation: `hello ${id}` })).finish()
		}
	]
})

const pumpUntil = async (cond: () => boolean) => {
	for (let i = 0; i < 200 && !cond(); i++) {
		await new Promise(resolve => setImmediate(resolve))
	}

	expect(cond()).toBe(true)
}

describe('per-chat message processing', () => {
	const setup = (gateId: string) => {
		const handlers = new Map<string, (node: BinaryNode) => Promise<void> | void>()
		const upsertCalls: string[] = []
		let releaseGate: () => void = () => {}

		const gate = new Promise<void>(resolve => {
			releaseGate = resolve
		})
		const upsertMessage = jest.fn(async (msg: WAMessage) => {
			upsertCalls.push(`${msg.key.remoteJid}:${msg.key.id}`)
			if (msg.key.id === gateId) {
				await gate
			}
		})
		const setKeys = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)

		makeMessagesSocket.mockReturnValue({
			userDevicesCache: {},
			devicesMutex: immediateMutex,
			ev: {
				buffer: jest.fn(),
				flush: jest.fn(),
				on: jest.fn(),
				emit: jest.fn()
			},
			authState: {
				creds: { me: { id: 'me@s.whatsapp.net' } },
				keys: {
					get: jest.fn(async () => ({})),
					set: setKeys,
					transaction: async <T>(task: () => Promise<T>) => task()
				}
			},
			ws: {
				isOpen: true,
				on: jest.fn((event: string, handler: (node: BinaryNode) => Promise<void> | void) => {
					handlers.set(event, handler)
				})
			},
			messageMutex: makeKeyedMutex(),
			notificationMutex: immediateMutex,
			receiptMutex: immediateMutex,
			signalRepository: {
				lidMapping: {
					getLIDForPN: jest.fn(async () => undefined),
					getPNForLID: jest.fn(async () => undefined),
					storeLIDPNMappings: jest.fn(async () => undefined)
				},
				migrateSession: jest.fn(async () => undefined),
				jidToSignalProtocolAddress: jest.fn(() => 'signal-address')
			},
			query: jest.fn(),
			upsertMessage,
			resyncAppState: jest.fn(),
			onUnexpectedError: jest.fn(),
			assertSessions: jest.fn(async () => true),
			sendNode: jest.fn(async () => undefined),
			relayMessage: jest.fn(async () => undefined),
			sendReceipt: jest.fn(async () => undefined),
			uploadPreKeys: jest.fn(async () => undefined),
			sendPeerDataOperationMessage: jest.fn(async () => undefined),
			messageRetryManager: new MessageRetryManager(noopLogger, 5, new MessageRetryCoordinator()),
			messageRetryCoordinator: new MessageRetryCoordinator(),
			registerSocketEndHandler: jest.fn(),
			issuePrivacyTokens: jest.fn(async () => undefined),
			fetchAccountReachoutTimelock: jest.fn(async () => undefined),
			placeholderResendCache: {
				get: jest.fn(async () => undefined),
				set: jest.fn(async () => undefined),
				del: jest.fn(async () => undefined)
			}
		})

		makeMessagesRecvSocket({
			logger: noopLogger,
			retryRequestDelayMs: 0,
			maxMsgRetryCount: 5,
			getMessage: jest.fn(async () => ({})),
			shouldIgnoreJid: () => false,
			enableAutoSessionRecreation: true
		} as unknown as SocketConfig)

		const handleMessage = handlers.get('CB:message')
		expect(handleMessage).toBeDefined()

		const release = () => releaseGate()

		return { handleMessage: handleMessage!, upsertCalls, releaseGate: release }
	}

	it('processes another chat while one chat is parked mid-pipeline', async () => {
		const { handleMessage, upsertCalls, releaseGate } = setup('A1')

		let aDone = false
		const pA = Promise.resolve(handleMessage(plaintextNode(CHAT_A, 'A1'))).then(() => {
			aDone = true
		})
		// A is now parked inside its per-chat critical section (gated upsert)
		await pumpUntil(() => upsertCalls.length === 1)

		let bDone = false
		const pB = Promise.resolve(handleMessage(plaintextNode(CHAT_B, 'B1'))).then(() => {
			bDone = true
		})
		await pumpUntil(() => bDone)

		// B fully processed end-to-end (and was not lost) while A is still parked
		expect(aDone).toBe(false)
		expect(upsertCalls).toEqual([`${CHAT_A}:A1`, `${CHAT_B}:B1`])

		releaseGate()
		await pA
		await pB
		expect(aDone).toBe(true)
	})

	it('keeps strict arrival order within one chat', async () => {
		const { handleMessage, upsertCalls, releaseGate } = setup('A1')

		const pA1 = Promise.resolve(handleMessage(plaintextNode(CHAT_A, 'A1')))
		await pumpUntil(() => upsertCalls.length === 1)

		const pA2 = Promise.resolve(handleMessage(plaintextNode(CHAT_A, 'A2')))
		// give A2 every chance to jump the queue — it must not
		for (let i = 0; i < 20; i++) {
			await new Promise(resolve => setImmediate(resolve))
		}

		expect(upsertCalls).toEqual([`${CHAT_A}:A1`])

		releaseGate()
		await pA1
		await pA2
		expect(upsertCalls).toEqual([`${CHAT_A}:A1`, `${CHAT_A}:A2`])
	})
})
