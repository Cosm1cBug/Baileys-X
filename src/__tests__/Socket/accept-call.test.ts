import { jest } from '@jest/globals'
import type { BinaryNode } from '../../WABinary'
import { fixture, JID } from './receipt-fixtures'

const relay: BinaryNode = {
	tag: 'relay',
	attrs: { token: 'synthetic-token' },
	content: [{ tag: 'endpoint', attrs: { ip: '192.0.2.1', port: '1234' }, content: Buffer.from('test') }]
}
const offer = (children: BinaryNode[]): BinaryNode => ({
	tag: 'call',
	attrs: { from: JID, id: 'stanza-1', t: '1700000000' },
	content: [{ tag: 'offer', attrs: { 'call-id': 'call-1', 'call-creator': JID }, content: children }]
})

describe('acceptCall', () => {
	it('echoes the cached relay as the first accept child and bounds the response wait', async () => {
		const query = jest.fn<(node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode | undefined>>()
		query.mockResolvedValue({ tag: 'ack', attrs: { class: 'call' } })
		const f = fixture(query)
		try {
			await f.receiveCall(offer([relay, { tag: 'audio', attrs: {} }]))
			await f.sock.acceptCall('call-1', JID)
			expect(query).toHaveBeenCalledTimes(1)
			const [stanza, timeout] = query.mock.calls[0]!
			expect(timeout).toBe(10_000)
			expect(stanza.content).toEqual([
				{ tag: 'accept', attrs: { 'call-id': 'call-1', 'call-creator': JID, count: '0' }, content: [relay] }
			])
		} finally {
			f.close()
		}
	})

	it('uses the creator from the offer when it differs from the sending device', async () => {
		const query = jest.fn<(node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode | undefined>>()
		query.mockResolvedValue({ tag: 'ack', attrs: { class: 'call' } })
		const f = fixture(query)
		try {
			const node = offer([relay])
			const child = (node.content as BinaryNode[])[0]!
			child.attrs.from = JID
			child.attrs['call-creator'] = '12025550102@s.whatsapp.net'
			await f.receiveCall(node)
			await f.sock.acceptCall('call-1', JID)
			const accept = (query.mock.calls[0]![0].content as BinaryNode[])[0]!
			expect(accept.attrs['call-creator']).toBe('12025550102@s.whatsapp.net')
		} finally {
			f.close()
		}
	})

	it('rejects missing, mismatched or relay-less offers without sending', async () => {
		const query = jest.fn<(node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode | undefined>>()
		const f = fixture(query)
		try {
			await expect(f.sock.acceptCall('absent', JID)).rejects.toThrow(/offer/i)
			await f.receiveCall(offer([]))
			await expect(f.sock.acceptCall('call-1', 'different@s.whatsapp.net')).rejects.toThrow(/offer/i)
			await expect(f.sock.acceptCall('call-1', JID)).rejects.toThrow(/relay/i)
			expect(query).not.toHaveBeenCalled()
		} finally {
			f.close()
		}
	})

	it('surfaces missing or error responses instead of reporting success', async () => {
		const query = jest.fn<(node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode | undefined>>()
		const f = fixture(query)
		try {
			await f.receiveCall(offer([relay]))
			query.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ tag: 'ack', attrs: { error: '500' } })
			await expect(f.sock.acceptCall('call-1', JID)).rejects.toThrow(/timed out/i)
			await expect(f.sock.acceptCall('call-1', JID)).rejects.toThrow(/rejected/i)
		} finally {
			f.close()
		}
	})
})
