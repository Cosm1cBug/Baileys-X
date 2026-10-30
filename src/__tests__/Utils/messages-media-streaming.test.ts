import { jest } from '@jest/globals'
import { createCipheriv, randomBytes } from 'crypto'
import { existsSync } from 'fs'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import type { WAMessage } from '../../Types'

/**
 * Phase 3 (findings P2/P3):
 *  - downloads should be able to go straight to disk (streamed) instead of
 *    always being concatenated into a single in-memory Buffer
 *  - when neither sharp nor jimp is usable, image sends used to lose BOTH
 *    the thumbnail and the dimensions; dimensions are now read from the
 *    image headers in pure TypeScript
 *
 * sharp/jimp are mocked to empty modules below, so the "no usable image
 * library" fallback is what actually runs in this suite. sharp is an
 * optional peer dependency and is not installed everywhere (e.g. CI), so
 * its mock is only registered when the module can be resolved at all —
 * where it cannot, the dynamic import fails on its own, which is exactly
 * the condition the fallback handles.
 */
jest.unstable_mockModule('jimp', () => ({}))

const sharpResolvable = (() => {
	try {
		createRequire(import.meta.url).resolve('sharp')
		return true
	} catch {
		return false
	}
})()

if (sharpResolvable) {
	jest.unstable_mockModule('sharp', () => ({}))
}

// same for the optional @napi-rs/image backend: where it is installed it
// would otherwise provide a real library and break the fallback premise
const napiImageResolvable = (() => {
	try {
		createRequire(import.meta.url).resolve('@napi-rs/image')
		return true
	} catch {
		return false
	}
})()

if (napiImageResolvable) {
	jest.unstable_mockModule('@napi-rs/image', () => ({}))
}

const { extractImageThumb, generateThumbnail, getImageDimensions, getMediaKeys } = await import(
	'../../Utils/messages-media'
)
const { downloadAndSaveMediaMessage } = await import('../../Utils/messages')

const pngFixture = (width: number, height: number) => {
	const buffer = Buffer.alloc(33)
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0)
	buffer.writeUInt32BE(13, 8)
	buffer.write('IHDR', 12, 'ascii')
	buffer.writeUInt32BE(width, 16)
	buffer.writeUInt32BE(height, 20)
	return buffer
}

const gifFixture = (width: number, height: number) => {
	const buffer = Buffer.alloc(10)
	buffer.write('GIF89a', 0, 'ascii')
	buffer.writeUInt16LE(width, 6)
	buffer.writeUInt16LE(height, 8)
	return buffer
}

const jpegFixture = (width: number, height: number) => {
	const app0 = Buffer.alloc(18)
	app0[0] = 0xff
	app0[1] = 0xe0
	app0.writeUInt16BE(16, 2)

	const sof = Buffer.alloc(19)
	sof[0] = 0xff
	sof[1] = 0xc0
	sof.writeUInt16BE(17, 2)
	sof[4] = 8
	sof.writeUInt16BE(height, 5)
	sof.writeUInt16BE(width, 7)

	return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof])
}

const webpXFixture = (width: number, height: number) => {
	const buffer = Buffer.alloc(30)
	buffer.write('RIFF', 0, 'ascii')
	buffer.writeUInt32LE(22, 4)
	buffer.write('WEBP', 8, 'ascii')
	buffer.write('VP8X', 12, 'ascii')
	buffer.writeUInt32LE(10, 16)
	buffer.writeUIntLE(width - 1, 24, 3)
	buffer.writeUIntLE(height - 1, 27, 3)
	return buffer
}

const webpLFixture = (width: number, height: number) => {
	const buffer = Buffer.alloc(25)
	buffer.write('RIFF', 0, 'ascii')
	buffer.writeUInt32LE(17, 4)
	buffer.write('WEBP', 8, 'ascii')
	buffer.write('VP8L', 12, 'ascii')
	buffer.writeUInt32LE(5, 16)
	buffer[20] = 0x2f
	buffer.writeUInt32LE(((height - 1) << 14) | (width - 1), 21)
	return buffer
}

const webpLossyFixture = (width: number, height: number) => {
	const buffer = Buffer.alloc(30)
	buffer.write('RIFF', 0, 'ascii')
	buffer.writeUInt32LE(22, 4)
	buffer.write('WEBP', 8, 'ascii')
	buffer.write('VP8 ', 12, 'ascii')
	buffer.writeUInt32LE(10, 16)
	buffer[23] = 0x9d
	buffer[24] = 0x01
	buffer[25] = 0x2a
	buffer.writeUInt16LE(width, 26)
	buffer.writeUInt16LE(height, 28)
	return buffer
}

describe('getImageDimensions', () => {
	it.each([
		{ name: 'PNG', fixture: pngFixture(640, 480), width: 640, height: 480 },
		{ name: 'GIF', fixture: gifFixture(320, 200), width: 320, height: 200 },
		{ name: 'JPEG', fixture: jpegFixture(1920, 1080), width: 1920, height: 1080 },
		{ name: 'WebP VP8X', fixture: webpXFixture(800, 600), width: 800, height: 600 },
		{ name: 'WebP VP8L', fixture: webpLFixture(17, 9), width: 17, height: 9 },
		{ name: 'WebP VP8', fixture: webpLossyFixture(352, 288), width: 352, height: 288 }
	])('reads $name dimensions from the header', ({ fixture, width, height }) => {
		expect(getImageDimensions(fixture)).toEqual({ width, height })
	})

	it('returns undefined for unknown or truncated data', () => {
		expect(getImageDimensions(Buffer.from('definitely not an image'))).toBeUndefined()
		expect(getImageDimensions(Buffer.alloc(0))).toBeUndefined()
		expect(getImageDimensions(pngFixture(10, 10).subarray(0, 12))).toBeUndefined()
	})
})

describe('image thumbnails without an image-processing library', () => {
	it('extractImageThumb returns dimensions with an empty thumbnail buffer', async () => {
		const result = await extractImageThumb(pngFixture(640, 480))
		expect(result.buffer.length).toBe(0)
		expect(result.original).toEqual({ width: 640, height: 480 })
	})

	it('extractImageThumb still throws for data it cannot identify', async () => {
		await expect(extractImageThumb(Buffer.from('not an image'))).rejects.toThrow(
			'No image processing library available'
		)
	})

	it('generateThumbnail keeps dimensions and omits the thumbnail', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'baileys-x-thumb-'))
		try {
			const file = join(dir, 'image.png')
			await writeFile(file, pngFixture(320, 200))

			await expect(generateThumbnail(file, 'image', {})).resolves.toEqual({
				thumbnail: undefined,
				originalImageDimensions: { width: 320, height: 200 }
			})
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})

describe('downloadAndSaveMediaMessage', () => {
	let originalFetch: typeof globalThis.fetch
	let dir: string

	beforeEach(async () => {
		originalFetch = globalThis.fetch
		dir = await mkdtemp(join(tmpdir(), 'baileys-x-download-'))
	})

	afterEach(async () => {
		globalThis.fetch = originalFetch
		await rm(dir, { recursive: true, force: true })
	})

	const makeImageMessage = async (plaintext: Buffer) => {
		const mediaKey = randomBytes(32)
		const { cipherKey, iv } = await getMediaKeys(mediaKey, 'image')
		const cipher = createCipheriv('aes-256-cbc', cipherKey, iv)
		const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
		const message = {
			key: { remoteJid: '1234567890@s.whatsapp.net', id: 'MEDIA-1' },
			message: {
				imageMessage: { url: 'https://mmg.whatsapp.net/media', mediaKey, mimetype: 'image/jpeg' }
			}
		} as unknown as WAMessage

		return { encrypted, message }
	}

	it('streams decrypted media to disk and appends the extension', async () => {
		const plaintext = Buffer.alloc(4096, 7)
		const { encrypted, message } = await makeImageMessage(plaintext)
		globalThis.fetch = async () => new Response(encrypted)

		const written = await downloadAndSaveMediaMessage(message, join(dir, 'photo'))

		expect(written).toBe(join(dir, 'photo') + '.jpeg')
		await expect(readFile(written)).resolves.toEqual(plaintext)
	})

	it('writes to the exact path when attachExtension is false', async () => {
		const plaintext = Buffer.from('small payload')
		const { encrypted, message } = await makeImageMessage(plaintext)
		globalThis.fetch = async () => new Response(encrypted)

		const written = await downloadAndSaveMediaMessage(message, join(dir, 'photo.bin'), false)

		expect(written).toBe(join(dir, 'photo.bin'))
		await expect(readFile(written)).resolves.toEqual(plaintext)
	})

	it('removes the partial file when decryption fails mid-download', async () => {
		const { message } = await makeImageMessage(Buffer.from('irrelevant'))
		globalThis.fetch = async () => new Response(Buffer.from('too short'))

		const target = join(dir, 'broken')
		await expect(downloadAndSaveMediaMessage(message, target)).rejects.toThrow()
		expect(existsSync(target + '.jpeg')).toBe(false)
	})
})
