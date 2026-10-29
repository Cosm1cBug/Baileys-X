import { jest } from '@jest/globals'
import { DEFAULT_CONNECTION_CONFIG } from '../../Defaults'
import type { AuthenticationState } from '../../Types'
import { type BinaryNode, getBinaryNodeChild } from '../../WABinary'

const emit = jest.fn((_event: string, _args: unknown) => {
	void _event
	void _args
	return true
})

const wsHandlers = new Map<string, (node: BinaryNode) => Promise<void>>()
const wsOn = jest.fn((event: string, handler: (node: BinaryNode) => Promise<void>) => {
	wsHandlers.set(event, handler)
})

const authState = {
	creds: {
		me: { id: '5511999999999:4@s.whatsapp.net', lid: '123456789012345:4@lid' }
	},
	keys: {
		get: jest.fn(async () => ({})),
		set: jest.fn(async () => undefined)
	}
}

jest.unstable_mockModule('../../Socket/messages-send', () => ({
	makeMessagesSocket: jest.fn(() => ({
		authState,
		query: jest.fn(async (): Promise<BinaryNode> => ({ tag: 'iq', attrs: { type: 'result' }, content: undefined })),
		sendNode: jest.fn(async () => undefined),
		ws: {
			on: wsOn,
			isOpen: true
		},
		ev: {
			on: jest.fn(),
			buffer: jest.fn(),
			flush: jest.fn(),
			emit
		},
		registerSocketEndHandler: jest.fn(),
		signalRepository: {
			lidMapping: {
				getLIDForPN: jest.fn()
			}
		}
	}))
}))

const { makeMessagesRecvSocket } = await import('../../Socket/messages-recv')

describe('call rawNode', () => {
	beforeEach(() => {
		emit.mockClear()
		wsHandlers.clear()
	})

	it('exposes the full signaling child (enc/relay children intact) on call events', async () => {
		makeMessagesRecvSocket({
			...DEFAULT_CONNECTION_CONFIG,
			auth: authState as unknown as AuthenticationState
		})

		const onCall = wsHandlers.get('CB:call')
		expect(onCall).toBeDefined()

		const offerChild: BinaryNode = {
			tag: 'offer',
			attrs: { 'call-id': 'call-42', 'call-creator': '123456789012345@lid', from: '123456789012345@lid' },
			content: [
				{ tag: 'audio', attrs: {}, content: [] },
				{ tag: 'enc', attrs: { v: '2', type: 'msg' }, content: Buffer.from('encrypted-call-key') },
				{ tag: 'relay', attrs: { lat: '1' }, content: [] }
			]
		}
		const node: BinaryNode = {
			tag: 'call',
			attrs: { from: '123456789012345@lid', t: '1700000000', id: 'stanza-1' },
			content: [offerChild]
		}

		await onCall!(node)

		const callEmits = emit.mock.calls.filter(([event]) => event === 'call')
		expect(callEmits).toHaveLength(1)
		const [callEvent] = callEmits[0]![1] as [{ id: string; status: string; rawNode?: BinaryNode }]
		expect(callEvent.id).toBe('call-42')
		expect(callEvent.status).toBe('offer')
		// the raw child is passed through untouched, so nothing the parsed
		// fields drop (enc call key, relay info, …) is lost
		expect(callEvent.rawNode).toBe(offerChild)
		expect(getBinaryNodeChild(callEvent.rawNode, 'enc')?.content).toEqual(Buffer.from('encrypted-call-key'))
	})
})
