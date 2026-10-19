import { jest } from '@jest/globals'
import { proto } from '../../../WAProto/index.js'
import {
	AIRich,
	buildHtmlResponse,
	buildTableMetadata,
	createInlineEntity,
	estimateLatexDimensions,
	extractInlineEntities,
	tokenizeCode,
	Toolkit
} from '../../Utils/rich-response'

describe('extractInlineEntities', () => {
	it('extracts a hyperlink and rewrites it to a tagged entity', () => {
		const result = extractInlineEntities('see [docs](https://example.com/docs) here')
		expect(result.text).toBe('see {{KARL_HYPERLINK_0}}docs{{/KARL_HYPERLINK_0}} here')
		expect(result.entities).toEqual([
			{
				kind: 'hyperlink',
				key: 'KARL_HYPERLINK_0',
				text: 'docs',
				url: 'https://example.com/docs',
				isTrusted: true
			}
		])
	})

	it('marks links prefixed with ! as untrusted', () => {
		const result = extractInlineEntities('[x](!https://evil.example)')
		expect(result.entities[0]).toMatchObject({ kind: 'hyperlink', url: 'https://evil.example', isTrusted: false })
	})

	it('extracts a citation for an empty display text', () => {
		const result = extractInlineEntities('fact [](https://source.example)')
		expect(result.text).toBe('fact {{KARL_CITATION_0}}https://source.example{{/KARL_CITATION_0}}')
		expect(result.entities[0]).toMatchObject({ kind: 'citation', referenceId: 1, url: 'https://source.example' })
	})

	it('numbers multiple citations sequentially', () => {
		const result = extractInlineEntities('[](https://a.example) and [](https://b.example)')
		expect(result.entities.map(e => ('referenceId' in e ? e.referenceId : null))).toEqual([1, 2])
	})

	it('extracts latex with explicit dimensions', () => {
		const result = extractInlineEntities('[x^2|120|40|30|6]<https://latex.example/x.png>')
		expect(result.text).toBe('{{KARL_LATEX_0}}x^2{{/KARL_LATEX_0}}')
		expect(result.entities[0]).toEqual({
			kind: 'latex',
			key: 'KARL_LATEX_0',
			text: 'x^2',
			url: 'https://latex.example/x.png',
			width: 120,
			height: 40,
			fontHeight: 30,
			padding: 6
		})
	})

	it('reads latex dimensions from url hash params', () => {
		const result = extractInlineEntities('[e]<https://latex.example/e.png#width=90&height=30&font_height=25>')
		expect(result.entities[0]).toMatchObject({
			kind: 'latex',
			text: 'e',
			url: 'https://latex.example/e.png',
			width: 90,
			height: 30,
			fontHeight: 25
		})
	})

	it('can disable individual entity kinds', () => {
		const result = extractInlineEntities('[a](https://x.example) [b]<https://y.example>', { hyperlink: false })
		expect(result.entities.every(e => e.kind !== 'hyperlink')).toBe(true)
		expect(result.entities.some(e => e.kind === 'latex')).toBe(true)
	})

	it('returns the raw text when extraction is disabled', () => {
		const text = '[a](https://x.example)'
		expect(extractInlineEntities(text, { extract: false })).toEqual({ text, entities: [] })
	})
})

describe('createInlineEntity', () => {
	it('builds hyperlink metadata', () => {
		const entity = createInlineEntity({
			kind: 'hyperlink',
			key: 'K',
			text: 't',
			url: 'https://x.example',
			isTrusted: true
		})
		expect(entity).toEqual({
			key: 'K',
			metadata: {
				display_name: 't',
				is_trusted: true,
				url: 'https://x.example',
				__typename: 'GenAIInlineLinkItem'
			}
		})
	})

	it('builds citation metadata with a reference id', () => {
		const entity = createInlineEntity({ kind: 'citation', key: 'K', referenceId: 3, url: 'https://x.example' })
		expect(entity.metadata).toMatchObject({ reference_id: 3, __typename: 'GenAISearchCitationItem' })
	})

	it('builds latex metadata with explicit dimensions', () => {
		const entity = createInlineEntity({
			kind: 'latex',
			key: 'K',
			text: 'x',
			url: 'https://x.example/i.png',
			width: 100,
			height: 50,
			fontHeight: 25,
			padding: 4
		})
		expect(entity.metadata).toMatchObject({
			latex_expression: 'x',
			font_height: 25,
			padding: 4,
			latex_image: { url: 'https://x.example/i.png', width: 50, height: 25 },
			__typename: 'GenAILatexItem'
		})
	})

	it('estimates latex image dimensions when none are given', () => {
		const entity = createInlineEntity({ kind: 'latex', key: 'K', text: 'x', url: 'https://x.example/i.png' })
		const latexImage = (entity.metadata as Record<string, unknown>).latex_image as Record<string, number | string>
		expect(typeof latexImage.width).toBe('number')
		expect(latexImage.height).toBe(50)
	})
})

describe('estimateLatexDimensions', () => {
	it('scales the estimated width with the font height', () => {
		const base = estimateLatexDimensions('https://x.example/abcdef.png', 20)
		const taller = estimateLatexDimensions('https://x.example/abcdef.png', 40)
		expect(taller.width).toBeGreaterThan(base.width)
		expect(base.height).toBe(20)
		expect(taller.height).toBe(40)
	})

	it('narrows the estimated width for stacked expressions', () => {
		const flat = estimateLatexDimensions('https://latex.codecogs.com/png?abcde', 40)
		const stacked = estimateLatexDimensions('https://latex.codecogs.com/png?%5Cfrac%7Ba%7D%7Bb%7D', 40)
		// the rendered height is always the font height; only the width estimate differs
		expect(flat.height).toBe(40)
		expect(stacked.height).toBe(40)
		expect(stacked.width).toBeLessThan(flat.width)
	})
})

describe('tokenizeCode', () => {
	it('emits a single default token for plain text languages', () => {
		const meta = tokenizeCode('hello world', 'text')
		expect(meta.codeBlocks).toEqual([{ codeContent: 'hello world', highlightType: 0 }])
		expect(meta.unifiedCodeBlocks).toEqual([{ content: 'hello world', type: 'DEFAULT' }])
	})

	it('classifies keywords, methods, strings, numbers and comments', () => {
		const meta = tokenizeCode('const x = 42 // note\nfoo("s")', 'javascript')
		const types = meta.unifiedCodeBlocks.map(t => t.type)
		expect(types).toContain('KEYWORD')
		expect(types).toContain('NUMBER')
		expect(types).toContain('COMMENT')
		expect(types).toContain('STR')
		expect(types).toContain('METHOD')
		// the whole code survives the split
		expect(meta.unifiedCodeBlocks.map(t => t.content).join('')).toBe('const x = 42 // note\nfoo("s")')
	})

	it('merges neighbouring tokens of the same type', () => {
		const meta = tokenizeCode('let value', 'javascript')
		// 'let' is a keyword, then whitespace and identifier share the default type
		expect(meta.codeBlocks).toEqual([
			{ codeContent: 'let', highlightType: 1 },
			{ codeContent: ' value', highlightType: 0 }
		])
	})

	it('handles unknown languages with empty keyword sets', () => {
		const meta = tokenizeCode('whatever', 'klingon')
		expect(meta.unifiedCodeBlocks.length).toBeGreaterThan(0)
	})
})

describe('buildTableMetadata', () => {
	it('marks the first row as heading and pads rows to the same width', () => {
		const meta = buildTableMetadata([['Name', 'Qty'], ['Tea']])
		expect(meta.rows).toEqual([{ items: ['Name', 'Qty'], isHeading: true }, { items: ['Tea', ''] }])
		expect(meta.unifiedRows[0]).toMatchObject({ is_header: true, cells: ['Name', 'Qty'] })
		expect(meta.unifiedRows[1]).toMatchObject({ is_header: false, cells: ['Tea', ''] })
	})

	it('rejects malformed tables', () => {
		expect(() => buildTableMetadata([['a'], [1]] as unknown as string[][])).toThrow(TypeError)
		expect(() => buildTableMetadata([])).toThrow(TypeError)
	})

	it('attaches markdown cells when a cell has inline entities', () => {
		const meta = buildTableMetadata([['Link'], ['[x](https://x.example)']])
		expect(meta.unifiedRows[1]!.markdown_cells).toBeDefined()
		expect(meta.unifiedRows[0]!.markdown_cells).toBeUndefined()
	})
})

describe('AIRich', () => {
	it('builds a botForwardedMessage rich response with text sections', () => {
		const content = new AIRich().setTitle('Disclaimer').setFooter('The end').addText('Hello **world**').build()
		expect(content.botForwardedMessage?.message?.richResponseMessage?.messageType).toBe(
			proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD
		)

		const rich = content.botForwardedMessage!.message!.richResponseMessage!
		expect(rich.submessages).toEqual([
			{ messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT, messageText: 'Hello **world**' }
		])

		const unified = JSON.parse(Buffer.from(rich.unifiedResponse!.data!).toString('utf-8'))
		expect(unified.__typename).toBe('GenAIUnifiedResponse')
		expect(unified.sections).toHaveLength(2) // text + footer
		expect(unified.sections[0].view_model.primitive.text).toBe('Hello **world**')
		expect(unified.sections[1].view_model.primitive.text).toBe('The end')

		expect(content.messageContextInfo?.botMetadata?.messageDisclaimerText).toBe('Disclaimer')
		const context = rich.contextInfo!
		expect(context.isForwarded).toBe(true)
		expect(context.forwardedAiBotMessageInfo?.botJid).toBe('0@bot')
		expect(context.forwardOrigin).toBe(proto.ContextInfo.ForwardOrigin.META_AI)
	})

	it('adds code and table submessages with the right message types', () => {
		const content = new AIRich()
			.addCode('javascript', 'const a = 1')
			.addTable([['H'], ['1']])
			.build()
		const submessages = content.botForwardedMessage!.message!.richResponseMessage!.submessages!
		expect(submessages[0]!.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CODE)
		expect(submessages[0]!.codeMetadata?.codeLanguage).toBe('javascript')
		expect(submessages[1]!.messageType).toBe(proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TABLE)
		expect(submessages[1]!.tableMetadata?.rows?.[0]).toEqual({ items: ['H'], isHeading: true })
	})

	it('adds source attributions to bot metadata and a sources section', () => {
		const content = new AIRich()
			.addSource([{ icon: 'https://i.example/f.png', url: 'https://s.example', text: 'Source' }])
			.build()
		const sources = content.messageContextInfo?.botMetadata?.richResponseSourcesMetadata?.sources
		expect(sources?.[0]).toMatchObject({ sourceProviderUrl: 'https://s.example', sourceTitle: 'Source' })
	})

	it('separates non-text layouts from following text with a spacer', () => {
		const content = new AIRich().addCode('text', 'x').addText('after').build()
		const unified = JSON.parse(
			Buffer.from(content.botForwardedMessage!.message!.richResponseMessage!.unifiedResponse!.data!).toString('utf-8')
		)
		expect(unified.sections[1].view_model.primitive.text).toBe(' ')
		expect(unified.sections[2].view_model.primitive.text).toBe('after')
	})

	it('embeds a quoted message in the rich response context', () => {
		const quoted = {
			key: { id: 'ABC', participant: '1@s.whatsapp.net', remoteJid: '1@s.whatsapp.net' },
			message: { conversation: 'hi' } as proto.IMessage
		}
		const content = new AIRich().addText('reply').build({ quoted, quotedParticipant: '1@s.whatsapp.net' })
		const context = content.botForwardedMessage!.message!.richResponseMessage!.contextInfo!
		expect(context.stanzaId).toBe('ABC')
		expect(context.participant).toBe('1@s.whatsapp.net')
		expect(context.quotedMessage?.conversation).toBe('hi')
	})

	it('omits the unified response and submessages when disabled', () => {
		const content = new AIRich()
			.addText('x')
			.build({ includesUnifiedResponse: false, includesSubmessages: false, forwarded: false })
		const rich = content.botForwardedMessage!.message!.richResponseMessage!
		expect(rich.unifiedResponse?.data ?? null).toBeNull()
		expect(rich.submessages).toEqual([])
		expect(rich.contextInfo?.isForwarded ?? null).toBeNull()
	})

	it('validates its inputs', () => {
		expect(() => new AIRich().addText(1 as unknown as string)).toThrow(TypeError)
		expect(() => new AIRich().addCode('js', 2 as unknown as string)).toThrow(TypeError)
		expect(() => new AIRich().addTable('x' as unknown as string[][])).toThrow(TypeError)
		expect(() => new AIRich().setContextInfo(null as unknown as proto.IContextInfo)).toThrow(TypeError)
	})

	it('relays through the provided client', async () => {
		const relayMessage = jest.fn(async (jid: string) => {
			if (!jid) throw new Error('missing jid')
		})
		await new AIRich().addText('hi').send({ relayMessage }, '1@s.whatsapp.net')
		expect(relayMessage).toHaveBeenCalledTimes(1)
		expect(relayMessage.mock.calls[0]![0]).toBe('1@s.whatsapp.net')
	})
})

describe('buildHtmlResponse', () => {
	it('wraps the html in the rich-response html primitive', () => {
		const content = buildHtmlResponse('  <b>hi</b>  ')
		const unified = JSON.parse(
			Buffer.from(content.botForwardedMessage!.message!.richResponseMessage!.unifiedResponse!.data!).toString('utf-8')
		)
		expect(unified.sections[0].view_model.primitive).toEqual({
			__typename: 'FOAHtmlPrimitiveDemoDONOTUSE',
			trusted_sources: [],
			payload: '<b>hi</b>'
		})
	})
})

describe('Toolkit', () => {
	it('aliases extractIE and latex dimension estimation', () => {
		expect(Toolkit.extractIE('[a](https://x.example)')).toEqual(extractInlineEntities('[a](https://x.example)'))
		expect(Toolkit.resolveLatexDimensions('https://x.example/a.png', 30)).toEqual(
			estimateLatexDimensions('https://x.example/a.png', 30)
		)
	})
})
