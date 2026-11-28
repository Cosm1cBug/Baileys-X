import { jest } from '@jest/globals'
import { DEFAULT_CACHE_TTLS, DEFAULT_CONNECTION_CONFIG } from '../../Defaults'
import type { CacheStore, SocketConfig, WACallEvent } from '../../Types'
import type { BinaryNode } from '../../WABinary'

const makeMessagesSocket = jest.fn()
jest.unstable_mockModule('../../Socket/messages-send', () => ({ makeMessagesSocket }))
const { makeMessagesRecvSocket } = await import('../../Socket/messages-recv')

const from = '123456789@lid'
const chat = '123456789@lid'
const callId = 'CALL-1'
const makeNode = (tag: string, extra: Record<string, string> = {}, content?: BinaryNode[]): BinaryNode => ({
	tag: 'call',
	attrs: { from: chat, id: `stanza-${tag}`, t: '1' },
	content: [{ tag, attrs: { 'call-id': callId, 'call-creator': from, ...extra }, content }]
})

function setup() {
	const entries = new Map<string, unknown>()
	const cache: CacheStore = {
		get: <T>(key: string) => entries.get(key) as T | undefined,
		set: (key, value) => {
			entries.set(key, value)
		},
		del: key => {
			entries.delete(key)
		},
		flushAll: () => {
			entries.clear()
		}
	}
	const handlers = new Map<string, (node: BinaryNode) => Promise<void>>()
	const calls: WACallEvent[] = []
	const sendNode = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
	const onUnexpectedError = jest.fn()
	let close: (() => void | Promise<void>) | undefined
	makeMessagesSocket.mockReturnValue({
		authState: { creds: { me: { id: 'me@s.whatsapp.net' } }, keys: { get: async () => ({}) } },
		ws: {
			isOpen: true,
			on: (event: string, handler: (node: BinaryNode) => Promise<void>) => handlers.set(event, handler)
		},
		ev: {
			buffer: jest.fn(),
			flush: jest.fn(),
			on: jest.fn(),
			emit: (event: string, items: WACallEvent[]) => {
				if (event === 'call') calls.push(...items)
			}
		},
		signalRepository: { lidMapping: { getLIDForPN: async () => undefined } },
		sendNode,
		onUnexpectedError,
		registerSocketEndHandler: (handler: () => void | Promise<void>) => {
			close = handler
		}
	})
	makeMessagesRecvSocket({ ...DEFAULT_CONNECTION_CONFIG, callOfferCache: cache } as SocketConfig)
	return {
		entries,
		cache,
		calls,
		sendNode,
		onUnexpectedError,
		handle: handlers.get('CB:call')!,
		close: async () => {
			await close?.()
		}
	}
}

describe('call timeout metadata', () => {
	it('enriches terminate after timeout without retaining the relay offer or changing identifiers', async () => {
		const socket = setup()
		try {
			await socket.handle(
				makeNode('offer', { caller_pn: '555@s.whatsapp.net' }, [
					{ tag: 'video', attrs: {} },
					{ tag: 'relay', attrs: { token: 'synthetic' } }
				])
			)
			await socket.handle(makeNode('terminate', { reason: 'timeout' }))
			expect(socket.entries.has(callId)).toBe(false)
			await socket.handle(makeNode('terminate'))
			expect(socket.calls.map(call => call.status)).toEqual(['offer', 'timeout', 'terminate'])
			expect(socket.calls[2]).toMatchObject({
				callerPn: '555@s.whatsapp.net',
				isVideo: true,
				isGroup: false,
				from,
				chatId: chat
			})
			expect(socket.calls[2]?.rawNode?.tag).toBe('terminate')
			expect(socket.sendNode).toHaveBeenCalledTimes(3)
			expect(socket.onUnexpectedError).not.toHaveBeenCalled()
		} finally {
			await socket.close()
		}
	})

	it('does not apply timed-out metadata to a different caller with the same call ID', async () => {
		const socket = setup()
		try {
			await socket.handle(makeNode('offer', { caller_pn: '555@s.whatsapp.net' }))
			await socket.handle(makeNode('terminate', { reason: 'timeout' }))
			await socket.handle(makeNode('terminate', { 'call-creator': 'other@lid' }))
			expect(socket.calls[2]?.callerPn).toBeUndefined()
		} finally {
			await socket.close()
		}
	})

	it('drops old metadata when a new offer reuses the call ID', async () => {
		const socket = setup()
		try {
			await socket.handle(makeNode('offer', { caller_pn: '555@s.whatsapp.net' }))
			await socket.handle(makeNode('terminate', { reason: 'timeout' }))
			await socket.handle(makeNode('offer'))
			await socket.handle(makeNode('terminate'))
			expect(socket.calls[3]?.callerPn).toBeUndefined()
		} finally {
			await socket.close()
		}
	})

	it('serializes concurrent offer, timeout and terminate while the custom cache is slow', async () => {
		const socket = setup()
		const originalSet = socket.cache.set.bind(socket.cache)
		let release!: () => void
		const gate = new Promise<void>(resolve => {
			release = resolve
		})
		socket.cache.set = async (key, value) => {
			await gate
			await originalSet(key, value)
		}

		try {
			const offer = socket.handle(
				makeNode('offer', { caller_pn: '555@s.whatsapp.net', type: 'group', 'group-jid': 'group@g.us' })
			)
			const timeout = socket.handle(makeNode('terminate', { reason: 'timeout' }))
			const terminate = socket.handle(makeNode('terminate'))
			release()
			await Promise.all([offer, timeout, terminate])
			expect(socket.calls.map(call => call.status)).toEqual(['offer', 'timeout', 'terminate'])
			expect(socket.calls[2]).toMatchObject({ callerPn: '555@s.whatsapp.net', isGroup: true, groupJid: 'group@g.us' })
		} finally {
			release()
			await socket.close()
		}
	})

	it('expires timeout metadata independently of a custom cache without TTL', async () => {
		jest.useFakeTimers()
		const socket = setup()
		try {
			await socket.handle(makeNode('offer', { caller_pn: '555@s.whatsapp.net' }))
			await socket.handle(makeNode('terminate', { reason: 'timeout' }))
			jest.advanceTimersByTime(DEFAULT_CACHE_TTLS.CALL_OFFER * 1000 + 1)
			await socket.handle(makeNode('terminate'))
			expect(socket.calls[2]?.callerPn).toBeUndefined()
		} finally {
			await socket.close()
			jest.useRealTimers()
		}
	})
})
