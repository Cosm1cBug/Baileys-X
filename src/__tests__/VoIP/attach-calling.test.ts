import { jest } from '@jest/globals'
import { EventEmitter } from 'node:events'
import type { WASocket } from '../../index'
import type { BinaryNode } from '../../WABinary'

// Engine + WebRTC transport are mocked: these tests pin the Baileys-X glue
// (attachCalling), not media. The engine itself is exercised against the
// built bundle in CI smoke checks; real calls are never automated.
const engine = {
	initialize: jest.fn(async () => undefined),
	initVoipStack: jest.fn(),
	setRelaySendCallback: jest.fn(),
	setE2ECallKey: jest.fn(),
	startCall: jest.fn(),
	endCall: jest.fn(),
	destroy: jest.fn(),
	handleSignalingMessage: jest.fn(),
	handleSignalingAck: jest.fn(),
	feedRelayDatagram: jest.fn()
}

jest.unstable_mockModule('../../VoIP/lib/engine/node', () => ({
	WhatsAppVoipNode: jest.fn(() => engine)
}))

jest.unstable_mockModule('../../VoIP/lib/relay/RelayRtcTransport', () => ({
	RelayRtcTransport: jest.fn(() => ({
		send: jest.fn(() => 0),
		updateRelayList: jest.fn()
	}))
}))

const { attachCalling } = await import('../../VoIP/attachCalling')

const SELF_PN = '15550001111:2@s.whatsapp.net'
const SELF_LID = '100000000000001:2@lid'
const PEER_PN = '15551234567@s.whatsapp.net'
const PEER_LID = '100000000000002@lid'

const makeSock = () => {
	const ws = new EventEmitter()
	const sock = {
		authState: { creds: { me: { id: SELF_PN, lid: SELF_LID } } },
		ws,
		getLidForJid: jest.fn(async (_jid: string): Promise<string | null> => {
			void _jid
			return PEER_LID
		}),
		getUSyncDevices: jest.fn(async (_jids: string[], _useCache: boolean, _ignoreZero: boolean) => {
			void _jids
			void _useCache
			void _ignoreZero
			return [{ jid: PEER_LID }, { jid: '100000000000002:5@lid' }]
		}),
		signalRepository: {
			jidToSignalProtocolAddress: jest.fn((jid: string) => jid),
			validateSession: jest.fn(async (_jid: string) => {
				void _jid
				return { exists: true }
			}),
			encryptMessage: jest.fn(async (_args: { jid: string; data: Uint8Array }) => {
				void _args
				return { type: 'msg', ciphertext: new Uint8Array([9, 9, 9]) }
			})
		},
		query: jest.fn(async () => ({ tag: 'iq', attrs: {}, content: undefined })),
		sendNode: jest.fn(async (_node: BinaryNode) => {
			void _node
			return undefined
		}),
		generateMessageTag: jest.fn(() => 'tag-1'),
		waitForMessage: jest.fn(async (_id: string, _timeout?: number) => {
			void _id
			void _timeout
			return null
		})
	}
	return { sock: sock as unknown as WASocket, ws, raw: sock }
}

describe('attachCalling', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	it('refuses to attach before the socket has a LID identity', async () => {
		const { sock, raw } = makeSock()
		;(raw.authState.creds.me as { lid?: string }).lid = undefined
		await expect(attachCalling(sock, { transport: 'udp' })).rejects.toThrow('no PN/LID identity')
	})

	it('places a call: sessions → per-device enc offer → stanza sent, key set before offer', async () => {
		const { sock, raw } = makeSock()
		const calling = await attachCalling(sock, { transport: 'udp' })

		const callId = await calling.placeCall('1 (555) 123-4567')
		expect(callId).toMatch(/^[0-9a-f]{32}$/)

		expect(raw.getLidForJid).toHaveBeenCalledWith(PEER_PN)
		expect(engine.setE2ECallKey).toHaveBeenCalledTimes(1)
		expect(engine.startCall).toHaveBeenCalledWith(
			expect.objectContaining({ callId, peerJid: PEER_LID, peerPn: PEER_PN, isVideo: false })
		)

		// keying must happen before the offer stanza goes out
		const keyOrder = engine.setE2ECallKey.mock.invocationCallOrder[0]!
		const sendOrder = raw.sendNode.mock.invocationCallOrder[0]!
		expect(keyOrder).toBeLessThan(sendOrder)

		expect(raw.sendNode).toHaveBeenCalledTimes(1)
		const stanza = raw.sendNode.mock.calls[0]![0]
		expect(stanza.tag).toBe('call')
		const offer = (stanza.content as BinaryNode[])[0]!
		expect(offer.tag).toBe('offer')
		expect(offer.attrs['call-id']).toBe(callId)
		// call key encrypted for the peer and every device (<enc> nodes exist)
		const rendered = JSON.stringify(offer)
		expect(rendered).toContain('"enc"')

		await calling.endCall(callId)
		const terminateStanza = raw.sendNode.mock.calls[1]![0]
		expect((terminateStanza.content as BinaryNode[])[0]!.tag).toBe('terminate')

		calling.detach()
	})

	it('forwards in-call stanzas to the engine and reports every child via onCallNode', async () => {
		const { sock, ws } = makeSock()
		const seen: string[] = []
		const calling = await attachCalling(sock, {
			transport: 'udp',
			onCallNode: child => {
				seen.push(child.tag)
			}
		})
		expect(ws.listenerCount('CB:call')).toBe(1)

		const acceptNode: BinaryNode = {
			tag: 'call',
			attrs: { from: PEER_LID },
			content: [{ tag: 'accept', attrs: { 'call-id': 'c1' }, content: [] }]
		}
		ws.emit('CB:call', acceptNode)
		expect(seen).toEqual(['accept'])
		expect(engine.handleSignalingMessage).toHaveBeenCalledTimes(1)
		const fed = engine.handleSignalingMessage.mock.calls[0]![0] as { payload: string }
		expect(fed.payload).toContain('<accept')

		// relaylatency is reported but not fed to the engine
		ws.emit('CB:call', {
			tag: 'call',
			attrs: { from: PEER_LID },
			content: [{ tag: 'relaylatency', attrs: { 'call-id': 'c1' }, content: [] }]
		})
		expect(seen).toEqual(['accept', 'relaylatency'])
		expect(engine.handleSignalingMessage).toHaveBeenCalledTimes(1)

		calling.detach()
		expect(ws.listenerCount('CB:call')).toBe(0)
		expect(engine.destroy).toHaveBeenCalledTimes(1)
	})

	it('throws a clear error when the peer LID cannot be resolved', async () => {
		const { sock, raw } = makeSock()
		raw.getLidForJid.mockResolvedValue(null)
		const calling = await attachCalling(sock, { transport: 'udp' })
		await expect(calling.placeCall(PEER_PN)).rejects.toThrow('could not resolve LID')
		calling.detach()
	})
})
