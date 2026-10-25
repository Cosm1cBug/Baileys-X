import type Long from 'long'
import $protobuf from 'protobufjs/minimal.js'

/**
 * WAProto v2.3000.1051642466 dropped the `LIDMigrationMappingSyncPayload` and
 * `LIDMigrationMapping` message types from the extracted proto, so the
 * generated `proto.LIDMigrationMappingSyncPayload.decode` no longer exists.
 * WhatsApp servers still send LID_MIGRATION_MAPPING_SYNC protocol messages
 * whose `encodedMappingPayload` uses exactly that wire format:
 *
 * ```proto
 * message LIDMigrationMapping {
 *   uint64 pn = 1;
 *   uint64 assignedLid = 2;
 *   optional uint64 latestLid = 3;
 * }
 * message LIDMigrationMappingSyncPayload {
 *   repeated LIDMigrationMapping pnToLidMappings = 1;
 *   optional uint64 chatDbMigrationTimestamp = 2;
 * }
 * ```
 *
 * Decode it manually so received LID-PN mappings keep flowing into the
 * signal repository. Unknown fields are skipped, matching protobuf semantics.
 */
export type LIDMigrationMappingEntry = {
	pn: Long
	assignedLid: Long
	latestLid?: Long
}

export type LIDMigrationMappingSyncPayloadDecoded = {
	pnToLidMappings: LIDMigrationMappingEntry[]
	chatDbMigrationTimestamp?: Long
}

const ZERO = ($protobuf.util.Long as typeof Long).fromBits(0, 0, true)

const decodeLIDMigrationMapping = (reader: $protobuf.Reader): LIDMigrationMappingEntry => {
	const entry: LIDMigrationMappingEntry = { pn: ZERO, assignedLid: ZERO }
	const end = reader.uint32() + reader.pos

	while (reader.pos < end) {
		const tag = reader.uint32()
		switch (tag >>> 3) {
			case 1:
				entry.pn = reader.uint64() as Long
				break
			case 2:
				entry.assignedLid = reader.uint64() as Long
				break
			case 3:
				entry.latestLid = reader.uint64() as Long
				break
			default:
				reader.skipType(tag & 7)
				break
		}
	}

	return entry
}

export const decodeLIDMigrationMappingSyncPayload = (encoded: Uint8Array): LIDMigrationMappingSyncPayloadDecoded => {
	const reader = $protobuf.Reader.create(encoded)
	const payload: LIDMigrationMappingSyncPayloadDecoded = { pnToLidMappings: [] }

	while (reader.pos < reader.len) {
		const tag = reader.uint32()
		switch (tag >>> 3) {
			case 1:
				payload.pnToLidMappings.push(decodeLIDMigrationMapping(reader))
				break
			case 2:
				payload.chatDbMigrationTimestamp = reader.uint64() as Long
				break
			default:
				reader.skipType(tag & 7)
				break
		}
	}

	return payload
}
