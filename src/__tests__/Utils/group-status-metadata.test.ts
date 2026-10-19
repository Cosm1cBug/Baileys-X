import P from 'pino'
import { proto } from '../../../WAProto/index.js'
import { generateWAMessageContent } from '../../Utils/messages'

const logger = P({ level: 'silent' })
const upload = async () => {
	throw new Error('upload is not expected for text messages')
}

describe('group status metadata', () => {
	it('wraps the message and marks the context as group status', async () => {
		const content = await generateWAMessageContent({ text: 'status!', groupStatus: true }, { logger, upload })
		const wrapper = content.groupStatusMessageV2
		expect(wrapper).toBeDefined()
		const inner = wrapper!.message!
		expect(inner.extendedTextMessage?.contextInfo?.isGroupStatus).toBe(true)
	})

	it('merges status source, attribution and audience metadata into the context', async () => {
		const content = await generateWAMessageContent(
			{
				text: 'close friends only',
				groupStatus: {
					statusSourceType: proto.ContextInfo.StatusSourceType.TEXT,
					statusAttributions: [{ type: proto.StatusAttribution.Type.GROUP_STATUS }],
					statusAudienceMetadata: {
						audienceType: proto.ContextInfo.StatusAudienceMetadata.AudienceType.CLOSE_FRIENDS
					}
				}
			},
			{ logger, upload }
		)
		const inner = content.groupStatusMessageV2!.message!
		const context = inner.extendedTextMessage?.contextInfo
		expect(context?.isGroupStatus).toBe(true)
		expect(context?.statusSourceType).toBe(proto.ContextInfo.StatusSourceType.TEXT)
		expect(context?.statusAttributions).toEqual([{ type: proto.StatusAttribution.Type.GROUP_STATUS }])
		expect(context?.statusAudienceMetadata?.audienceType).toBe(
			proto.ContextInfo.StatusAudienceMetadata.AudienceType.CLOSE_FRIENDS
		)
	})

	it('keeps caller-supplied contextInfo fields', async () => {
		const content = await generateWAMessageContent(
			{
				text: 'with context',
				groupStatus: { statusSourceType: proto.ContextInfo.StatusSourceType.IMAGE },
				contextInfo: { mentionedJid: ['1@s.whatsapp.net'] }
			},
			{ logger, upload }
		)
		const context = content.groupStatusMessageV2!.message!.extendedTextMessage?.contextInfo
		expect(context?.mentionedJid).toEqual(['1@s.whatsapp.net'])
		expect(context?.statusSourceType).toBe(proto.ContextInfo.StatusSourceType.IMAGE)
	})
})
