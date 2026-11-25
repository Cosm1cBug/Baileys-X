import { createHash } from 'crypto'
import { readFile, stat } from 'fs/promises'
import { Readable } from 'stream'
import { proto } from '../../../WAProto/index.js'
import type { AudioStickerContent, MessageContentGenerationOptions } from '../../Types'
import { prepareAudioStickerAssets } from '../../Utils/audio-sticker'
import { generateWAMessage, generateWAMessageContent } from '../../Utils/messages'

const fixture = (name: string) => readFile(`src/__tests__/fixtures/audio-sticker/${name}`)
const createOptions = () => {
	const uploads: { type: string; path: string }[] = []
	const options: MessageContentGenerationOptions = {
		upload: async (path, { mediaType }) => {
			await stat(path)
			uploads.push({ type: mediaType, path })
			return { mediaUrl: `https://example.invalid/${mediaType}`, directPath: `/${mediaType}` }
		}
	}
	return { options, uploads }
}

describe('provisional audio sticker', () => {
	it.each(['static.webp', 'animated.webp'])('infers metadata and uploads both assets for %s', async name => {
		const image = await fixture(name)
		const audio = await fixture('tone.ogg')
		const { options, uploads } = createOptions()
		const originalEncoder = proto.Message.encode
		const result = await generateWAMessageContent({ audioSticker: { sticker: image, audio } }, options)
		const sticker = result.audioStickerMessage?.message?.stickerMessage
		const sound = sticker?.audioMessage
		expect(uploads.map(item => item.type)).toEqual(['sticker', 'audio'])
		expect(sticker).toMatchObject({
			width: 16,
			height: 16,
			isAnimated: name === 'animated.webp',
			directPath: '/sticker'
		})
		expect(sound).toMatchObject({ seconds: 1, directPath: '/audio', mimetype: 'audio/ogg; codecs=opus' })
		expect(Buffer.from(sticker!.fileSha256!)).toEqual(createHash('sha256').update(image).digest())
		expect(Buffer.from(sound!.fileSha256!)).toEqual(createHash('sha256').update(audio).digest())
		expect(Buffer.from(sticker!.mediaKey!)).not.toEqual(Buffer.from(sound!.mediaKey!))
		expect(sticker!.contextInfo!.mediaDomainInfo!.e2EeMediaKey).toEqual(sticker!.mediaKey)
		expect(sound!.contextInfo!.mediaDomainInfo!.e2EeMediaKey).toEqual(sound!.mediaKey)
		expect(sticker!.contextInfo!.experienceIds).toEqual([13001])
		expect(
			proto.Message.decode(proto.Message.encode(result).finish()).audioStickerMessage?.message?.stickerMessage
				?.audioMessage
		).toBeTruthy()
		expect(proto.Message.encode).toBe(originalEncoder)
		for (const upload of uploads) await expect(stat(upload.path)).rejects.toMatchObject({ code: 'ENOENT' })
	})

	it('keeps concurrent messages and their encryption keys independent', async () => {
		const sticker = await fixture('static.webp')
		const audio = await fixture('tone.ogg')
		const first = createOptions()
		const second = createOptions()
		const [a, b] = await Promise.all([
			generateWAMessageContent({ audioSticker: { sticker, audio } }, first.options),
			generateWAMessageContent({ audioSticker: { sticker, audio } }, second.options)
		])
		const firstSticker = a.audioStickerMessage!.message!.stickerMessage!
		const secondSticker = b.audioStickerMessage!.message!.stickerMessage!
		expect(Buffer.from(firstSticker.mediaKey!)).not.toEqual(Buffer.from(secondSticker.mediaKey!))
		expect(Buffer.from(firstSticker.audioMessage!.mediaKey!)).not.toEqual(
			Buffer.from(secondSticker.audioMessage!.mediaKey!)
		)
	})

	it('supports streams and local paths', async () => {
		const sound = await fixture('tone.ogg')
		const result = await prepareAudioStickerAssets({
			sticker: { url: 'src/__tests__/fixtures/audio-sticker/static.webp' },
			audio: { stream: Readable.from(sound) }
		})
		expect(result).toMatchObject({ width: 16, height: 16, isAnimated: false, seconds: 1 })
	})

	it('rejects invalid media and mismatched metadata before uploading', async () => {
		const sticker = await fixture('static.webp')
		const audio = await fixture('tone.ogg')
		const vorbis = await fixture('vorbis.ogg')
		const long = await fixture('long.ogg')
		const { options, uploads } = createOptions()
		for (const content of [
			{ sticker: Buffer.from('bad'), audio },
			{ sticker: sticker.subarray(0, 20), audio },
			{ sticker, audio: Buffer.from('bad') },
			{ sticker, audio: vorbis },
			{ sticker, audio: long },
			{ sticker, audio, width: 42 },
			{ sticker, audio, isAnimated: true },
			{ sticker, audio, seconds: 0 },
			{ sticker, audio: Buffer.alloc(2 * 1024 * 1024 + 1) }
		]) {
			await expect(generateWAMessageContent({ audioSticker: content }, options)).rejects.toThrow()
		}

		expect(uploads).toHaveLength(0)
	})

	it('rejects missing sources, oversize data URLs and incomplete upload results', async () => {
		const sticker = await fixture('static.webp')
		const audio = await fixture('tone.ogg')
		await expect(prepareAudioStickerAssets({ sticker } as AudioStickerContent)).rejects.toThrow('requires both')
		await expect(prepareAudioStickerAssets({ audio } as AudioStickerContent)).rejects.toThrow('requires both')
		await expect(
			prepareAudioStickerAssets({ sticker: { url: `data:image/webp;base64,${'A'.repeat(3 * 1024 * 1024)}` }, audio })
		).rejects.toThrow('exceeds')
		await expect(
			generateWAMessageContent(
				{ audioSticker: { sticker, audio } },
				{ upload: async () => ({ mediaUrl: '', directPath: '/media' }) }
			)
		).rejects.toThrow('incomplete metadata')
	})

	it('cleans encrypted temporary files and fails when either upload fails', async () => {
		const sticker = await fixture('static.webp')
		const audio = await fixture('tone.ogg')
		for (const failAt of [1, 2]) {
			const paths: string[] = []
			const options: MessageContentGenerationOptions = {
				upload: async (path, { mediaType }) => {
					paths.push(path)
					if (paths.length === failAt) throw new Error('upload failed')
					return { mediaUrl: 'https://example.invalid', directPath: `/${mediaType}` }
				}
			}
			await expect(generateWAMessageContent({ audioSticker: { sticker, audio } }, options)).rejects.toThrow(
				'upload failed'
			)
			for (const path of paths) await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
		}
	})

	it('rejects quotes and unsupported destinations before uploading', async () => {
		const { options, uploads } = createOptions()
		const content = { audioSticker: { sticker: await fixture('static.webp'), audio: await fixture('tone.ogg') } }
		await expect(generateWAMessageContent(content, { ...options, jid: '123@newsletter' })).rejects.toThrow(
			'destination'
		)
		await expect(
			generateWAMessage('123@s.whatsapp.net', content, {
				...options,
				userJid: '456@s.whatsapp.net',
				quoted: { key: { id: 'a' } }
			})
		).rejects.toThrow('quotes')
		expect(uploads).toHaveLength(0)
	})
})
