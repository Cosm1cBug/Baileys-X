import { proto } from '../../../WAProto/index.js'

describe('audio sticker protobuf structure', () => {
	it('round-trips the structure reported by the tester without patching the encoder', () => {
		const stickerKey = Buffer.alloc(32, 1)
		const audioKey = Buffer.alloc(32, 2)
		const encode = proto.Message.encode
		const message = proto.Message.create({
			messageContextInfo: { messageSecret: Buffer.alloc(32, 3) },
			audioStickerMessage: {
				message: {
					stickerMessage: {
						mimetype: 'image/webp',
						mediaKey: stickerKey,
						contextInfo: {
							mediaDomainInfo: { mediaKeyDomain: proto.MediaKeyDomain.MEDIA_KEY_DOMAIN_E2EE, e2EeMediaKey: stickerKey },
							experienceIds: [13001]
						},
						audioMessage: {
							mimetype: 'audio/ogg; codecs=opus',
							mediaKey: audioKey,
							contextInfo: {
								mediaDomainInfo: { mediaKeyDomain: proto.MediaKeyDomain.MEDIA_KEY_DOMAIN_E2EE, e2EeMediaKey: audioKey }
							}
						}
					}
				}
			}
		})

		const decoded = proto.Message.decode(proto.Message.encode(message).finish())
		const sticker = decoded.audioStickerMessage?.message?.stickerMessage
		expect(proto.Message.encode).toBe(encode)
		expect(sticker?.mimetype).toBe('image/webp')
		expect(sticker?.contextInfo?.experienceIds).toEqual([13001])
		expect(Buffer.from(sticker!.contextInfo!.mediaDomainInfo!.e2EeMediaKey!)).toEqual(stickerKey)
		expect(sticker?.audioMessage?.mimetype).toBe('audio/ogg; codecs=opus')
		expect(Buffer.from(sticker!.audioMessage!.contextInfo!.mediaDomainInfo!.e2EeMediaKey!)).toEqual(audioKey)
	})

	it('matches the reported field layout using synthetic media keys', () => {
		// This synthetic wire reference reflects the tester's script, not a client capture.
		const varint = (value: number): Buffer => {
			const bytes: number[] = []
			while (value > 127) {
				bytes.push(value % 128 | 128)
				value = Math.floor(value / 128)
			}

			bytes.push(value)
			return Buffer.from(bytes)
		}

		const field = (number: number, value: Uint8Array) =>
			Buffer.concat([varint(number * 8 + 2), varint(value.length), value])
		const stickerKey = Buffer.alloc(32, 1)
		const audioKey = Buffer.alloc(32, 2)
		const domain = (key: Buffer) => field(74, Buffer.concat([Buffer.from([8, 1]), field(2, key)]))
		const audio = Buffer.concat([
			field(2, Buffer.from('audio/ogg; codecs=opus')),
			field(7, audioKey),
			field(17, domain(audioKey))
		])
		const sticker = Buffer.concat([
			field(4, stickerKey),
			field(5, Buffer.from('image/webp')),
			field(17, Buffer.concat([domain(stickerKey), field(82, varint(13001))])),
			field(26, audio)
		])
		const reference = field(134, field(1, field(26, sticker)))
		const generated = proto.Message.encode({
			audioStickerMessage: {
				message: {
					stickerMessage: {
						mediaKey: stickerKey,
						mimetype: 'image/webp',
						contextInfo: {
							mediaDomainInfo: { mediaKeyDomain: proto.MediaKeyDomain.MEDIA_KEY_DOMAIN_E2EE, e2EeMediaKey: stickerKey },
							experienceIds: [13001]
						},
						audioMessage: {
							mimetype: 'audio/ogg; codecs=opus',
							mediaKey: audioKey,
							contextInfo: {
								mediaDomainInfo: { mediaKeyDomain: proto.MediaKeyDomain.MEDIA_KEY_DOMAIN_E2EE, e2EeMediaKey: audioKey }
							}
						}
					}
				}
			}
		}).finish()

		expect(Buffer.from(generated)).toEqual(reference)
	})
})
