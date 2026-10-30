import { Boom } from '@hapi/boom'
import { proto } from '../../../WAProto/index.js'
import type { MessageContentGenerationOptions } from '../../Types'
import type { ILogger } from '../../Utils/logger'
import { generateWAMessageContent } from '../../Utils/messages'
import { crc32, createStoredZip } from '../../Utils/zip-store'

const makeLogger = (): ILogger =>
	({
		level: 'silent',
		child: () => makeLogger(),
		trace: () => {},
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		fatal: () => {}
	}) as unknown as ILogger

describe('crc32', () => {
	it('matches the standard check vector', () => {
		// CRC-32 of the ASCII string "123456789" is defined as 0xCBF43926
		expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
		expect(crc32(Buffer.alloc(0))).toBe(0)
	})
})

describe('createStoredZip', () => {
	it('produces a parseable stored-method archive', () => {
		const zip = createStoredZip([
			{ name: 'a.webp', data: Buffer.from('first') },
			{ name: 'b.webp', data: Buffer.from('second-file') }
		])

		// local header of the first entry
		expect(zip.readUInt32LE(0)).toBe(0x04034b50)
		expect(zip.readUInt16LE(8)).toBe(0) // stored
		expect(zip.readUInt32LE(14)).toBe(crc32(Buffer.from('first')))
		const nameLen = zip.readUInt16LE(26)
		expect(zip.subarray(30, 30 + nameLen).toString()).toBe('a.webp')
		expect(zip.subarray(30 + nameLen, 30 + nameLen + 5).toString()).toBe('first')

		// end-of-central-directory terminates the file and counts entries
		const eocd = zip.subarray(zip.length - 22)
		expect(eocd.readUInt32LE(0)).toBe(0x06054b50)
		expect(eocd.readUInt16LE(10)).toBe(2)
		const centralOffset = eocd.readUInt32LE(16)
		expect(zip.readUInt32LE(centralOffset)).toBe(0x02014b50)
	})
})

describe('sticker pack message content', () => {
	const makeOptions = (): MessageContentGenerationOptions & { uploadCalls: unknown[] } => {
		const uploadCalls: unknown[] = []
		return {
			logger: makeLogger(),
			upload: async (_encFilePath: string, opts: unknown) => {
				uploadCalls.push(opts)
				return { mediaUrl: 'https://mmg.whatsapp.net/media', directPath: '/mms/sticker/pack' }
			},
			options: {},
			uploadCalls
		}
	}

	const pngFixture = () => {
		const buffer = Buffer.alloc(33)
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0)
		buffer.writeUInt32BE(13, 8)
		buffer.write('IHDR', 12, 'ascii')
		buffer.writeUInt32BE(540, 16)
		buffer.writeUInt32BE(540, 20)
		return buffer
	}

	it('builds a stickerPackMessage with uploaded bundle metadata', async () => {
		const options = makeOptions()
		const message = await generateWAMessageContent(
			{
				stickerPack: {
					name: 'Test Pack',
					publisher: 'Baileys-X',
					packId: 'pack-123',
					description: 'demo',
					cover: pngFixture(),
					stickers: [
						{ sticker: Buffer.from('sticker-one'), emojis: ['😀'] },
						{ sticker: Buffer.from('sticker-two'), isAnimated: true }
					]
				}
			},
			options
		)

		const pack = message.stickerPackMessage
		expect(pack).toBeTruthy()
		expect(pack!.name).toBe('Test Pack')
		expect(pack!.publisher).toBe('Baileys-X')
		expect(pack!.stickerPackId).toBe('pack-123')
		expect(pack!.packDescription).toBe('demo')
		expect(pack!.stickerPackOrigin).toBe(proto.Message.StickerPackMessage.StickerPackOrigin.THIRD_PARTY)
		expect(pack!.directPath).toBe('/mms/sticker/pack')
		expect(pack!.mediaKey).toHaveLength(32)
		expect(pack!.trayIconFileName).toBe('pack-123.png')

		expect(pack!.stickers).toHaveLength(2)
		expect(pack!.stickers![0]!.fileName).toMatch(/^00_[A-Za-z0-9_-]+\.webp$/)
		expect(pack!.stickers![0]!.emojis).toEqual(['😀'])
		expect(pack!.stickers![1]!.isAnimated).toBe(true)

		// the encrypted bundle went to the sticker-pack media endpoint type
		expect(options.uploadCalls).toContainEqual(expect.objectContaining({ mediaType: 'sticker-pack' }))
	})

	it('rejects an empty sticker list', async () => {
		await expect(
			generateWAMessageContent(
				{ stickerPack: { name: 'x', publisher: 'y', cover: pngFixture(), stickers: [] } },
				makeOptions()
			)
		).rejects.toBeInstanceOf(Boom)
	})
})
