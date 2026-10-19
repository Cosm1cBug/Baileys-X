import { jest } from '@jest/globals'
import { DEFAULT_CONNECTION_CONFIG } from '../../Defaults'
import type { AuthenticationState } from '../../Types'
import type { BinaryNode } from '../../WABinary'

const query = jest.fn(async (_node: BinaryNode): Promise<BinaryNode> => {
	void _node
	return { tag: 'iq', attrs: { type: 'result' }, content: undefined }
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
		query,
		sendNode: jest.fn(async () => undefined),
		ws: {
			on: jest.fn()
		},
		ev: {
			on: jest.fn()
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

const makeSock = () =>
	makeMessagesRecvSocket({
		...DEFAULT_CONNECTION_CONFIG,
		auth: authState as unknown as AuthenticationState
	})

const callStanza = (queryMock: typeof query, callIndex: number) => {
	const node = queryMock.mock.calls[callIndex]![0] as BinaryNode
	return node.content?.[0] as BinaryNode
}

describe('call signalling', () => {
	beforeEach(() => {
		query.mockClear()
	})

	it('rejects a call with a reject stanza', async () => {
		const sock = makeSock()
		await sock.rejectCall('call-1', '5511888888888@s.whatsapp.net')
		expect(query).toHaveBeenCalledTimes(1)

		const stanza = query.mock.calls[0]![0] as BinaryNode
		expect(stanza.tag).toBe('call')
		expect(stanza.attrs).toEqual({ from: '5511999999999:4@s.whatsapp.net', to: '5511888888888@s.whatsapp.net' })
		const child = callStanza(query, 0)
		expect(child.tag).toBe('reject')
		expect(child.attrs).toEqual({ 'call-id': 'call-1', 'call-creator': '5511888888888@s.whatsapp.net', count: '0' })
	})

	it('accepts a call with an accept stanza', async () => {
		const sock = makeSock()
		await sock.acceptCall('call-1', '5511888888888@s.whatsapp.net')
		expect(query).toHaveBeenCalledTimes(1)

		const stanza = query.mock.calls[0]![0] as BinaryNode
		expect(stanza.tag).toBe('call')
		expect(stanza.attrs).toEqual({ from: '5511999999999:4@s.whatsapp.net', to: '5511888888888@s.whatsapp.net' })
		const child = callStanza(query, 0)
		expect(child.tag).toBe('accept')
		expect(child.attrs).toEqual({ 'call-id': 'call-1', 'call-creator': '5511888888888@s.whatsapp.net', count: '0' })
	})

	it('terminates a call with a terminate stanza carrying a reason', async () => {
		const sock = makeSock()
		await sock.terminateCall('call-1', '5511888888888@s.whatsapp.net')
		expect(query).toHaveBeenCalledTimes(1)

		const stanza = query.mock.calls[0]![0] as BinaryNode
		expect(stanza.tag).toBe('call')
		const child = callStanza(query, 0)
		expect(child.tag).toBe('terminate')
		expect(child.attrs).toEqual({
			'call-id': 'call-1',
			'call-creator': '5511888888888@s.whatsapp.net',
			reason: 'user-terminated',
			count: '0'
		})
	})
})
