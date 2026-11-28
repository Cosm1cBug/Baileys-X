import { jest } from '@jest/globals'
import type { proto } from '../../../WAProto/index.js'
import type { CacheStore, SocketConfig } from '../../Types'
import type { ILogger } from '../../Utils/logger'
import { MessageRetryCoordinator, MessageRetryManager } from '../../Utils/message-retry-manager'
import { retryBudgetKey } from '../../Utils/retry-budget'
import type { BinaryNode } from '../../WABinary'

const makeMessagesSocket = jest.fn()
jest.unstable_mockModule('../../Socket/messages-send', () => ({ makeMessagesSocket }))
const { makeMessagesRecvSocket } = await import('../../Socket/messages-recv')
const { initAuthCreds } = await import('../../Utils/auth-utils')

const logger: ILogger = {
	level: 'silent',
	child: () => logger,
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {}
}
const immediateMutex = { mutex: async <T>(task: () => Promise<T> | T) => task() }
const immediateKeyedMutex = { mutex: async <T>(_key: string, task: () => Promise<T> | T) => task() }
const chat = '120363000000000000@g.us'
const participant = '1234567890:2@s.whatsapp.net'
const id = 'shared-id'

function memoryStore() {
	const values = new Map<string, unknown>()
	const store: CacheStore = {
		get: <T>(key: string) => values.get(key) as T | undefined,
		set: (key, value) => {
			values.set(key, value)
		},
		del: key => {
			values.delete(key)
		},
		flushAll: () => {
			values.clear()
		}
	}
	return { store, values }
}

function makeReceipt(from = chat, messageId = id): BinaryNode {
	return {
		tag: 'receipt',
		attrs: { from, participant, id: messageId, t: '1', type: 'retry' },
		content: [
			{ tag: 'retry', attrs: { count: '2', id: messageId, t: '1', v: '1' } },
			{ tag: 'registration', attrs: {}, content: Buffer.from([0, 0, 0, 2]) }
		]
	}
}

function setup(store: CacheStore, maxMsgRetryCount = 2, enableManager = false) {
	const handlers = new Map<string, (node: BinaryNode) => Promise<void> | void>()
	const coordinator = new MessageRetryCoordinator()
	const manager = enableManager ? new MessageRetryManager(logger, maxMsgRetryCount, coordinator) : null
	if (manager) jest.spyOn(manager, 'schedulePhoneRequest').mockImplementation(() => {})
	const creds = initAuthCreds()
	creds.me = { id: '9999999999@s.whatsapp.net', name: 'Test' }
	creds.account = {}
	const sendNode = jest.fn<(node: BinaryNode) => Promise<void>>().mockResolvedValue(undefined)
	const relayMessage = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
	const getMessage = jest.fn<() => Promise<proto.IMessage | undefined>>().mockResolvedValue({ conversation: 'hello' })
	const onUnexpectedError = jest.fn()
	const assertSessions = jest.fn<() => Promise<boolean>>().mockResolvedValue(true)
	let close: (() => void | Promise<void>) | undefined
	makeMessagesSocket.mockReturnValue({
		userDevicesCache: {},
		devicesMutex: immediateMutex,
		ev: { buffer: jest.fn(), flush: jest.fn(), on: jest.fn(), emit: jest.fn() },
		authState: {
			creds,
			keys: { get: async () => ({}), set: async () => {}, transaction: async <T>(f: () => Promise<T>) => f() }
		},
		ws: {
			isOpen: true,
			on: (event: string, handler: (node: BinaryNode) => Promise<void> | void) => handlers.set(event, handler)
		},
		messageMutex: immediateKeyedMutex,
		notificationMutex: immediateMutex,
		receiptMutex: immediateMutex,
		signalRepository: {
			lidMapping: { getLIDForPN: async () => null },
			jidToSignalProtocolAddress: () => 'address',
			getSessionInfo: async () => undefined,
			validateSession: async () => ({ exists: true }),
			injectE2ESession: async () => {}
		},
		query: jest.fn(),
		upsertMessage: jest.fn(),
		resyncAppState: jest.fn(),
		onUnexpectedError,
		assertSessions,
		sendNode,
		relayMessage,
		sendReceipt: jest.fn(),
		uploadPreKeys: jest.fn(),
		sendPeerDataOperationMessage: jest.fn(),
		messageRetryManager: manager,
		messageRetryCoordinator: coordinator,
		registerSocketEndHandler: (handler: () => void | Promise<void>) => {
			close = handler
		},
		issuePrivacyTokens: jest.fn(),
		fetchAccountReachoutTimelock: jest.fn(),
		placeholderResendCache: { get: async () => undefined, set: async () => {}, del: async () => {} }
	})
	const sock = makeMessagesRecvSocket({
		logger,
		maxMsgRetryCount,
		msgRetryCounterCache: store,
		getMessage,
		shouldIgnoreJid: () => false,
		retryRequestDelayMs: 0,
		enableAutoSessionRecreation: false
	} as unknown as SocketConfig)
	return {
		sock,
		handlers,
		sendNode,
		relayMessage,
		getMessage,
		assertSessions,
		onUnexpectedError,
		manager,
		coordinator,
		close: async () => {
			await close?.()
			manager?.clear()
		}
	}
}

describe('socket retry budget integration', () => {
	it('charges each outgoing resend once and retains exhaustion across a new socket', async () => {
		const { store, values } = memoryStore()
		const first = setup(store)
		try {
			const handle = first.handlers.get('CB:receipt')!
			await handle(makeReceipt())
			await handle(makeReceipt())
			await handle(makeReceipt())
			expect(first.relayMessage).toHaveBeenCalledTimes(2)
			expect(values.get(retryBudgetKey({ chat, messageId: id, participant, direction: 'outgoing' }))).toBe(2)
		} finally {
			await first.close()
		}

		const second = setup(store)
		try {
			await second.handlers.get('CB:receipt')!(makeReceipt())
			expect(second.relayMessage).not.toHaveBeenCalled()
		} finally {
			await second.close()
		}
	})

	it('keeps identical message IDs independent across chats and participants', async () => {
		const { store } = memoryStore()
		const socket = setup(store, 1)
		try {
			const handle = socket.handlers.get('CB:receipt')!
			await handle(makeReceipt())
			await handle(makeReceipt())
			await handle(makeReceipt('120363000000000001@g.us'))
			const other = makeReceipt()
			other.attrs.participant = '5555555555:2@s.whatsapp.net'
			await handle(other)
			expect(socket.relayMessage).toHaveBeenCalledTimes(3)
		} finally {
			await socket.close()
		}
	})

	it('serializes simultaneous resends from two sockets sharing one cache object', async () => {
		const { store } = memoryStore()
		const first = setup(store, 1)
		const second = setup(store, 1)
		try {
			await Promise.all([
				first.handlers.get('CB:receipt')!(makeReceipt()),
				second.handlers.get('CB:receipt')!(makeReceipt())
			])
			expect(first.relayMessage.mock.calls.length + second.relayMessage.mock.calls.length).toBe(1)
			expect(first.assertSessions.mock.calls.length + second.assertSessions.mock.calls.length).toBe(1)
		} finally {
			await first.close()
			await second.close()
		}
	})

	it('charges each message in a multi-id receipt once', async () => {
		const { store, values } = memoryStore()
		const socket = setup(store, 2)
		try {
			const receipt = makeReceipt()
			const retry = (receipt.content as BinaryNode[])[0]!
			retry.content = [{ tag: 'item', attrs: { id: 'second-id' } }]
			await socket.handlers.get('CB:receipt')!(receipt)
			expect(socket.relayMessage).toHaveBeenCalledTimes(2)
			for (const messageId of [id, 'second-id']) {
				expect(values.get(retryBudgetKey({ chat, messageId, participant, direction: 'outgoing' }))).toBe(1)
			}
		} finally {
			await socket.close()
		}
	})

	it('keeps a consumed budget after a relay failure and surfaces the failure', async () => {
		const { store, values } = memoryStore()
		const socket = setup(store, 1)
		try {
			socket.relayMessage.mockRejectedValueOnce(new Error('relay failed'))
			await socket.handlers.get('CB:receipt')!(makeReceipt())
			await socket.handlers.get('CB:receipt')!(makeReceipt())
			expect(socket.relayMessage).toHaveBeenCalledTimes(1)
			expect(socket.onUnexpectedError).toHaveBeenCalledWith(
				expect.objectContaining({ message: 'relay failed' }),
				'sending message again'
			)
			expect(values.get(retryBudgetKey({ chat, messageId: id, participant, direction: 'outgoing' }))).toBe(1)
		} finally {
			await socket.close()
		}
	})

	it('does not consume or prepare a session when invalidated during a budget lookup', async () => {
		const { store, values } = memoryStore()
		const key = retryBudgetKey({ chat, messageId: id, participant, direction: 'outgoing' })
		const originalGet = store.get.bind(store)
		let started!: () => void
		const lookupStarted = new Promise<void>(resolve => {
			started = resolve
		})
		let resume!: () => void
		const gate = new Promise<void>(resolve => {
			resume = resolve
		})
		store.get = async <T>(cacheKey: string) => {
			if (cacheKey === key) {
				started()
				await gate
			}

			return (await originalGet<T>(cacheKey)) as T
		}

		const socket = setup(store)
		try {
			const handling = Promise.resolve(socket.handlers.get('CB:receipt')!(makeReceipt()))
			await lookupStarted
			socket.coordinator.invalidateMessage(chat, id)
			resume()
			await handling
			expect(socket.assertSessions).not.toHaveBeenCalled()
			expect(socket.relayMessage).not.toHaveBeenCalled()
			expect(values.has(key)).toBe(false)
		} finally {
			resume()
			await socket.close()
		}
	})

	it('does not relay when invalidated during consumption, but retains the committed count', async () => {
		const { store, values } = memoryStore()
		const key = retryBudgetKey({ chat, messageId: id, participant, direction: 'outgoing' })
		const originalSet = store.set.bind(store)
		let started!: () => void
		const writeStarted = new Promise<void>(resolve => {
			started = resolve
		})
		let resume!: () => void
		const gate = new Promise<void>(resolve => {
			resume = resolve
		})
		store.set = async (cacheKey, value) => {
			await originalSet(cacheKey, value)
			if (cacheKey === key) {
				started()
				await gate
			}
		}

		const socket = setup(store)
		try {
			const handling = Promise.resolve(socket.handlers.get('CB:receipt')!(makeReceipt()))
			await writeStarted
			socket.coordinator.invalidateMessage(chat, id)
			resume()
			await handling
			expect(socket.relayMessage).not.toHaveBeenCalled()
			expect(values.get(key)).toBe(1)
		} finally {
			resume()
			await socket.close()
		}
	})

	it('surfaces a budget storage failure without relaying', async () => {
		const { store } = memoryStore()
		const originalSet = store.set.bind(store)
		const key = retryBudgetKey({ chat, messageId: id, participant, direction: 'outgoing' })
		store.set = (cacheKey, value) => {
			if (cacheKey === key) throw new Error('storage unavailable')
			return originalSet(cacheKey, value)
		}

		const socket = setup(store)
		try {
			await socket.handlers.get('CB:receipt')!(makeReceipt())
			expect(socket.relayMessage).not.toHaveBeenCalled()
			expect(socket.onUnexpectedError).toHaveBeenCalledWith(
				expect.objectContaining({ message: 'storage unavailable' }),
				'sending message again'
			)
		} finally {
			await socket.close()
		}
	})

	it('uses an incoming budget independently of outgoing and retains its limit', async () => {
		const { store, values } = memoryStore()
		const socket = setup(store, 1, true)
		try {
			const node: BinaryNode = { tag: 'message', attrs: { from: chat, participant, id, t: '1' } }
			await socket.sock.sendRetryRequest(node)
			await socket.sock.sendRetryRequest(node)
			expect(socket.sendNode).toHaveBeenCalledTimes(1)
			const receipt = socket.sendNode.mock.calls[0]![0]
			const retry = (receipt.content as BinaryNode[]).find(child => child.tag === 'retry')
			expect(retry?.attrs.count).toBe('1')
			expect(values.get(retryBudgetKey({ chat, messageId: id, participant, direction: 'incoming' }))).toBe(1)
			await socket.handlers.get('CB:receipt')!(makeReceipt())
			expect(socket.relayMessage).toHaveBeenCalledTimes(1)
		} finally {
			await socket.close()
		}
	})

	it('keeps a legacy exhausted counter across the first v2 read', async () => {
		const { store, values } = memoryStore()
		values.set(`${id}:${participant}`, 2)
		const socket = setup(store, 2)
		try {
			await socket.handlers.get('CB:receipt')!(makeReceipt())
			expect(socket.relayMessage).not.toHaveBeenCalled()
			expect(values.get(retryBudgetKey({ chat, messageId: id, participant, direction: 'outgoing' }))).toBe(2)
			expect(values.get(`${id}:${participant}`)).toBe(2)
		} finally {
			await socket.close()
		}
	})
})
