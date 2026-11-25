import { Boom } from '@hapi/boom'
import PQueue from 'p-queue'
import type { AudioStickerContent, WAMediaUpload } from '../Types'
import { getStream } from './messages-media'

// Local safeguards, not WhatsApp's published limits.
const MAX_ASSET_BYTES = 2 * 1024 * 1024
const MAX_DECODED_PIXELS = 16 * 1024 * 1024
const MAX_SECONDS = 30
const validationQueue = new PQueue({ concurrency: 2 })

const readAsset = async (media: WAMediaUpload, options?: RequestInit): Promise<Buffer> => {
	if (!media || (!Buffer.isBuffer(media) && (typeof media !== 'object' || !('url' in media || 'stream' in media)))) {
		throw new Boom('Audio sticker requires valid sticker and audio sources', { statusCode: 400 })
	}

	if (!Buffer.isBuffer(media) && 'url' in media) {
		const url = media.url.toString()
		if (url.startsWith('data:') && url.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4 + 1024) {
			throw new Boom('Audio sticker asset exceeds the 2 MiB local limit', { statusCode: 400 })
		}
	}

	const { stream } = await getStream(media, { ...options, maxContentLength: MAX_ASSET_BYTES })
	const chunks: Buffer[] = []
	let length = 0
	try {
		for await (const chunk of stream) {
			if (chunk.length > MAX_ASSET_BYTES - length) {
				throw new Boom('Audio sticker asset exceeds the 2 MiB local limit', { statusCode: 400 })
			}

			const data = Buffer.from(chunk)
			length += data.length
			if (length > MAX_ASSET_BYTES) {
				throw new Boom('Audio sticker asset exceeds the 2 MiB local limit', { statusCode: 400 })
			}

			chunks.push(data)
		}
	} finally {
		stream.destroy()
	}

	if (!length) throw new Boom('Audio sticker asset is empty', { statusCode: 400 })
	return Buffer.concat(chunks, length)
}

export const prepareAudioStickerAssets = (input: AudioStickerContent, options?: RequestInit) =>
	validationQueue.add(() => validateAudioStickerAssets(input, options))

const validateAudioStickerAssets = async (input: AudioStickerContent, options?: RequestInit) => {
	if (!input?.sticker || !input.audio) {
		throw new Boom('Audio sticker requires both sticker and audio', { statusCode: 400 })
	}

	if (input.accessibilityLabel !== undefined && typeof input.accessibilityLabel !== 'string') {
		throw new Boom('Audio sticker accessibility label must be a string', { statusCode: 400 })
	}

	const sticker = await readAsset(input.sticker, options)
	const audio = await readAsset(input.audio, options)
	if (
		sticker.length < 12 ||
		sticker.toString('ascii', 0, 4) !== 'RIFF' ||
		sticker.toString('ascii', 8, 12) !== 'WEBP'
	) {
		throw new Boom('Audio sticker image must be WebP', { statusCode: 400 })
	}

	let sharp: typeof import('sharp')
	try {
		sharp = (await import('sharp')).default
	} catch {
		throw new Boom('Audio sticker validation requires the optional sharp package', { statusCode: 400 })
	}

	let width: number
	let height: number
	let isAnimated: boolean
	try {
		const image = sharp(sticker, { animated: true, failOn: 'error', limitInputPixels: MAX_DECODED_PIXELS })
		const metadata = await image.metadata()
		if (metadata.format !== 'webp' || !metadata.width || !metadata.height) throw new Error('Invalid WebP')
		width = metadata.width
		height = metadata.pageHeight || metadata.height
		isAnimated = (metadata.pages || 1) > 1
		if (width * metadata.height > MAX_DECODED_PIXELS) throw new Error('WebP exceeds decode limit')
		await image.raw().toBuffer()
	} catch {
		throw new Boom('Invalid or oversized WebP sticker', { statusCode: 400 })
	}

	if ((input.width !== undefined && input.width !== width) || (input.height !== undefined && input.height !== height)) {
		throw new Boom('Audio sticker dimensions do not match the WebP', { statusCode: 400 })
	}

	if (input.isAnimated !== undefined && input.isAnimated !== isAnimated) {
		throw new Boom('Audio sticker animation flag does not match the WebP', { statusCode: 400 })
	}

	let duration: number | undefined
	try {
		const { parseBuffer } = await import('music-metadata')
		const { format } = await parseBuffer(audio, undefined, { duration: true })
		if (format.container !== 'Ogg' || format.codec !== 'Opus') throw new Error('Unsupported audio format')
		duration = format.duration
	} catch {
		throw new Boom('Audio sticker audio must be a valid Ogg Opus file', { statusCode: 400 })
	}

	if (duration === undefined || !Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS) {
		throw new Boom('Audio sticker duration must be between 0 and 30 seconds', { statusCode: 400 })
	}

	const seconds = Math.ceil(duration)
	if (input.seconds !== undefined && (!Number.isInteger(input.seconds) || input.seconds !== seconds)) {
		throw new Boom('Audio sticker seconds must match the rounded-up audio duration', { statusCode: 400 })
	}

	return { sticker, audio, width, height, isAnimated, seconds }
}
