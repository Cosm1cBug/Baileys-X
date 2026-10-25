import $protobuf from 'protobufjs/minimal.js'
import { decodeLIDMigrationMappingSyncPayload } from '../../Utils/lid-migration-payload'

// Bytes produced by the old generated `proto.LIDMigrationMappingSyncPayload.encode`
// (removed from WAProto in v2.3000.1051642466) for:
//   pnToLidMappings: [
//     { pn: 2348012345678, assignedLid: 123456789012345, latestLid: 98765432109876 },
//     { pn: 15551234567, assignedLid: 111222333444555 }
//   ],
//   chatDbMigrationTimestamp: 1761454400
const GOLDEN_HEX = '0a1708ceb2c483ab4410f9beb7b088891c18b4f6fcf3b9ba160a0e088784b4f73910cba3b4bdffa41910c0d2f6c706'

describe('decodeLIDMigrationMappingSyncPayload', () => {
	it('decodes bytes produced by the removed generated encoder', () => {
		const payload = decodeLIDMigrationMappingSyncPayload(Buffer.from(GOLDEN_HEX, 'hex'))

		expect(payload.pnToLidMappings).toHaveLength(2)
		expect(payload.pnToLidMappings[0]!.pn.toString()).toBe('2348012345678')
		expect(payload.pnToLidMappings[0]!.assignedLid.toString()).toBe('123456789012345')
		expect(payload.pnToLidMappings[0]!.latestLid?.toString()).toBe('98765432109876')
		expect(payload.pnToLidMappings[1]!.pn.toString()).toBe('15551234567')
		expect(payload.pnToLidMappings[1]!.assignedLid.toString()).toBe('111222333444555')
		expect(payload.pnToLidMappings[1]!.latestLid).toBeUndefined()
		expect(payload.chatDbMigrationTimestamp?.toString()).toBe('1761454400')
	})

	it('returns no mappings for an empty payload', () => {
		const payload = decodeLIDMigrationMappingSyncPayload(new Uint8Array(0))

		expect(payload.pnToLidMappings).toEqual([])
		expect(payload.chatDbMigrationTimestamp).toBeUndefined()
	})

	it('preserves uint64 precision and skips unknown fields', () => {
		const entry = $protobuf.Writer.create()
			.uint32(8)
			.uint64('9007199254740991')
			.uint32(16)
			.uint64('9007199254740990')
			// unknown inner field 9 (varint)
			.uint32(72)
			.uint64(1)
		const encoded = $protobuf.Writer.create()
			.uint32(10)
			.bytes(entry.finish())
			// unknown outer field 7 (varint)
			.uint32(56)
			.uint64(12345)
			.uint32(16)
			.uint64(42)
			.finish()

		const payload = decodeLIDMigrationMappingSyncPayload(encoded)

		expect(payload.pnToLidMappings).toHaveLength(1)
		expect(payload.pnToLidMappings[0]!.pn.toString()).toBe('9007199254740991')
		expect(payload.pnToLidMappings[0]!.assignedLid.toString()).toBe('9007199254740990')
		expect(payload.pnToLidMappings[0]!.latestLid).toBeUndefined()
		expect(payload.chatDbMigrationTimestamp?.toString()).toBe('42')
	})
})
