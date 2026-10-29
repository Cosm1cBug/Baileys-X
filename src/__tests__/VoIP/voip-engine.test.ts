import { randomBytes } from 'node:crypto'
import {
	binaryNodeToString,
	encodeRelayLatencyValue,
	extractOfferEnc,
	parseInboundOfferLid,
	renderNodeFallback
} from '../../VoIP/lib/app/whatsapp-signaling'
import { deriveE2EKeys, protectRtp1to1, unprotectRtp1to1 } from '../../VoIP/lib/crypto/srtp1to1'
import { parseWarpPacket, WARP_MI_TAG_LEN } from '../../VoIP/lib/crypto/warp'
import type { BinaryNode } from '../../WABinary'

describe('vendored VoIP engine — signaling helpers', () => {
	it('renders a binary node to stanza XML', () => {
		const offer: BinaryNode = {
			tag: 'offer',
			attrs: { 'call-id': 'abc123', 'call-creator': '123@lid' },
			content: [{ tag: 'audio', attrs: {}, content: [] }]
		}
		const xml = binaryNodeToString(offer)
		expect(xml).toContain('<offer')
		expect(xml).toContain(`call-id='abc123'`)
		expect(xml).toContain('<audio')
	})

	it('fallback renderer escapes attribute values', () => {
		const xml = renderNodeFallback({ tag: 'x', attrs: { a: '1<&"2' }, content: [] })
		expect(xml).toContain('a="1&lt;&amp;&quot;2"')
	})

	it('encodes relay latency into the 0x02000000-tagged word', () => {
		expect(encodeRelayLatencyValue(30)).toBe(0x02000000 | 30)
		expect(encodeRelayLatencyValue(null)).toBe(0x02000000 | 30)
		expect(encodeRelayLatencyValue(999_999)).toBe(0x02000000 | 0xffff)
		expect(encodeRelayLatencyValue(0)).toBe(0x02000000 | 1)
	})

	it('extracts the <enc> call-key node addressed to us from an offer', () => {
		const enc: BinaryNode = { tag: 'enc', attrs: { v: '2', type: 'msg' }, content: Buffer.from('k') }
		const offerChildren: BinaryNode[] = [
			{ tag: 'audio', attrs: {}, content: [] },
			{
				tag: 'destination',
				attrs: {},
				content: [{ tag: 'to', attrs: { jid: '999:3@lid' }, content: [enc] }]
			}
		]
		expect(extractOfferEnc(offerChildren, '999@lid')).toBe(enc)
		expect(extractOfferEnc(offerChildren, '111@lid')).toBeNull()
	})

	it('parses the caller LID out of an offer child', () => {
		const lid = parseInboundOfferLid({
			tag: 'offer',
			attrs: { 'call-creator': '123456:7@lid' },
			content: []
		})
		expect(lid).toBe('123456@lid')
	})
})

describe('vendored VoIP engine — 1:1 SRTP', () => {
	it('derives 46 bytes of key material split into cipher/salt/auth keys', () => {
		const keys = deriveE2EKeys(randomBytes(32), '123456@lid')
		expect(keys.cipherKey).toHaveLength(16)
		expect(keys.salt).toHaveLength(14)
		expect(keys.authKey).toHaveLength(20)
	})

	it('protect/unprotect round-trips an RTP packet (AES-CTR is symmetric)', () => {
		const keys = deriveE2EKeys(randomBytes(32), '123456@lid')
		const header = Buffer.alloc(12)
		header[0] = 0x80
		header.writeUInt16BE(4242, 2) // sequence
		header.writeUInt32BE(987654, 4) // timestamp
		header.writeUInt32BE(0x11223344, 8) // SSRC
		const packet = Buffer.concat([header, Buffer.from('opus-payload-bytes')])

		const protectedPacket = protectRtp1to1(keys, packet, 0)
		// header stays cleartext, payload is encrypted
		expect(protectedPacket.subarray(0, 12)).toEqual(header)
		expect(protectedPacket.subarray(12)).not.toEqual(packet.subarray(12))

		const recovered = unprotectRtp1to1(keys, protectedPacket, 0)
		expect(recovered).toEqual(packet)
	})

	it('different call keys produce different keystreams', () => {
		const packet = Buffer.concat([Buffer.alloc(12, 0x80), Buffer.from('same-payload')])
		const a = protectRtp1to1(deriveE2EKeys(randomBytes(32), '1@lid'), packet, 0)
		const b = protectRtp1to1(deriveE2EKeys(randomBytes(32), '1@lid'), packet, 0)
		expect(a.subarray(12)).not.toEqual(b.subarray(12))
	})
})

describe('vendored VoIP engine — WARP framing', () => {
	it('parses header/ciphertext/MI-tag regions out of a packet', () => {
		const header = Buffer.alloc(12)
		header[0] = 0x80
		const payload = Buffer.from('ciphertext!')
		const tag = randomBytes(WARP_MI_TAG_LEN)
		const packet = Buffer.concat([header, payload, tag])

		const view = parseWarpPacket(new Uint8Array(packet))
		expect(view.headerLength).toBe(12)
		expect(view.extensionProfile).toBeNull()
		expect(Buffer.from(view.ciphertext)).toEqual(payload)
		expect(Buffer.from(view.miTag)).toEqual(tag)
	})

	it('rejects packets shorter than header + tag', () => {
		expect(() => parseWarpPacket(new Uint8Array(8))).toThrow('too short')
	})
})
