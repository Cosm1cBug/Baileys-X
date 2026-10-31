import { jest } from '@jest/globals'
import { EventEmitter } from 'node:events'
import { DEFAULT_CONNECTION_CONFIG } from '../../Defaults'
import type { makeMessagesSocket } from '../../Socket/messages-send'
import type { BaileysEventMap, SocketConfig } from '../../Types'
import { addTransactionCapability, initAuthCreds } from '../../Utils/auth-utils'
import { makeEventBuffer } from '../../Utils/event-buffer'
import logger from '../../Utils/logger'
import { makeMutex } from '../../Utils/make-mutex'
import type { BinaryNode } from '../../WABinary'

let transport: ReturnType<typeof makeMessagesSocket>
jest.unstable_mockModule('../../Socket/messages-send.js', () => ({ makeMessagesSocket: () => transport }))
const { makeMessagesRecvSocket } = await import('../../Socket/messages-recv')

export const JID = '12025550101@s.whatsapp.net'
export const ME = { id: '12025550199@s.whatsapp.net', name: 'Fictional owner' }
export const silentLogger = logger.child({ class: 'receipt-test' })
silentLogger.level = 'silent'

export function fixture(query?: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode | undefined>) {
	const ev = makeEventBuffer(silentLogger)
	const ws = Object.assign(new EventEmitter(), {
		isOpen: true,
		isClosed: false,
		pause: () => {},
		resume: () => {}
	})
	const endHandlers: (() => void)[] = []
	const batches: Partial<BaileysEventMap>[] = []
	const sent: BinaryNode[] = []
	const creds = { ...initAuthCreds(), me: ME, accountSyncCounter: 1 }
	const keys = addTransactionCapability({ get: async () => ({}), set: async () => {} }, silentLogger, {
		maxCommitRetries: 1,
		delayBetweenTriesMs: 0
	})
	const config: SocketConfig = {
		...DEFAULT_CONNECTION_CONFIG,
		auth: { creds, keys },
		logger: silentLogger,
		fireInitQueries: false,
		markOnlineOnConnect: false,
		enableRecentMessageCache: false,
		shouldSyncHistoryMessage: () => false
	}
	ev.process(events => {
		batches.push(events)
	})
	// Only the send-side socket factory is mocked: the receipt handler and
	// event buffering under test remain real.
	transport = {
		ev,
		ws,
		authState: { creds, keys },
		query:
			query ??
			(async () => {
				throw new Error('Unexpected query in receipt test')
			}),
		sendNode: async (node: BinaryNode) => {
			sent.push(node)
		},
		userDevicesCache: new Map(),
		devicesMutex: makeMutex(),
		messageMutex: makeMutex(),
		notificationMutex: makeMutex(),
		receiptMutex: makeMutex(),
		signalRepository: { lidMapping: { getLIDForPN: async () => null } },
		upsertMessage: async () => {},
		resyncAppState: async () => {},
		onUnexpectedError: (error: unknown) => {
			throw error
		},
		assertSessions: async () => true,
		relayMessage: async () => {},
		sendReceipt: async () => {},
		uploadPreKeys: async () => {},
		sendPeerDataOperationMessage: async () => {},
		messageRetryManager: {},
		messageRetryCoordinator: {},
		registerSocketEndHandler: (handler: () => void) => endHandlers.push(handler),
		issuePrivacyTokens: async () => {},
		fetchAccountReachoutTimelock: async () => undefined,
		placeholderResendCache: { get: async () => undefined, set: async () => {}, del: async () => {} }
	} as unknown as ReturnType<typeof makeMessagesSocket>
	const sock = makeMessagesRecvSocket(config)
	return {
		sock,
		batches,
		sent,
		async receiveCall(node: BinaryNode) {
			for (const handler of ws.listeners('CB:call')) await handler(node)
		},
		async receive(node: BinaryNode) {
			for (const handler of ws.listeners('CB:receipt')) await handler(node)
		},
		close() {
			for (const handler of endHandlers) handler()
			ev.destroy()
			ws.removeAllListeners()
		}
	}
}
