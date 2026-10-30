/**
 * Minimal ZIP writer using only the "stored" (uncompressed) method.
 *
 * WhatsApp sticker packs are uploaded as a ZIP of already-compressed WebP
 * files, so compression would buy nothing — and writing the stored format
 * directly (local headers + central directory, CRC-32 per entry) avoids
 * pulling in a ZIP dependency for a single call site.
 */

const CRC_TABLE = (() => {
	const table = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		}

		table[n] = c >>> 0
	}

	return table
})()

export const crc32 = (data: Uint8Array): number => {
	let crc = 0xffffffff
	for (let i = 0; i < data.length; i++) {
		crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
	}

	return (crc ^ 0xffffffff) >>> 0
}

export type ZipEntry = {
	name: string
	data: Uint8Array
}

/** Build a ZIP archive (stored method) from in-memory entries. */
export const createStoredZip = (entries: ZipEntry[]): Buffer => {
	const chunks: Buffer[] = []
	const central: Buffer[] = []
	let offset = 0

	for (const entry of entries) {
		const name = Buffer.from(entry.name, 'utf-8')
		const crc = crc32(entry.data)
		const size = entry.data.length

		const local = Buffer.alloc(30)
		local.writeUInt32LE(0x04034b50, 0) // local file header signature
		local.writeUInt16LE(20, 4) // version needed
		local.writeUInt16LE(0x0800, 6) // UTF-8 filename flag
		local.writeUInt16LE(0, 8) // method: stored
		local.writeUInt32LE(crc, 14)
		local.writeUInt32LE(size, 18) // compressed size
		local.writeUInt32LE(size, 22) // uncompressed size
		local.writeUInt16LE(name.length, 26)
		chunks.push(local, name, Buffer.from(entry.data))

		const entryHeader = Buffer.alloc(46)
		entryHeader.writeUInt32LE(0x02014b50, 0) // central directory signature
		entryHeader.writeUInt16LE(20, 4) // version made by
		entryHeader.writeUInt16LE(20, 6) // version needed
		entryHeader.writeUInt16LE(0x0800, 8)
		entryHeader.writeUInt16LE(0, 10)
		entryHeader.writeUInt32LE(crc, 16)
		entryHeader.writeUInt32LE(size, 20)
		entryHeader.writeUInt32LE(size, 24)
		entryHeader.writeUInt16LE(name.length, 28)
		entryHeader.writeUInt32LE(offset, 42) // local header offset
		central.push(entryHeader, name)

		offset += local.length + name.length + size
	}

	const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0)
	const end = Buffer.alloc(22)
	end.writeUInt32LE(0x06054b50, 0) // end of central directory
	end.writeUInt16LE(entries.length, 8)
	end.writeUInt16LE(entries.length, 10)
	end.writeUInt32LE(centralSize, 12)
	end.writeUInt32LE(offset, 16) // central directory offset

	return Buffer.concat([...chunks, ...central, end])
}
