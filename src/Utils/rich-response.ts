import { randomUUID } from 'crypto'
import { proto } from '../../WAProto/index.js'
import type { MessageRelayOptions } from '../Types'

/**
 * Meta AI rich-response helpers.
 *
 * These build the `botForwardedMessage.richResponseMessage` payload family:
 * markdown text with inline entities (hyperlinks, citations, LaTeX), code
 * blocks with syntax highlighting, tables, and source attributions.
 */

export type InlineEntityKind = 'hyperlink' | 'citation' | 'latex'

export type HyperlinkEntityInput = {
	/** entity tag key used in the rewritten text */
	key: string
	text: string
	url: string
	/** untrusted links are prefixed with `!` in the markdown syntax */
	isTrusted?: boolean
}

export type CitationEntityInput = {
	/** entity tag key used in the rewritten text */
	key: string
	/** reference number, 1-based */
	referenceId: number
	url: string
}

export type LatexEntityInput = {
	/** entity tag key used in the rewritten text */
	key: string
	text: string
	url: string
	width?: number | null
	height?: number | null
	fontHeight?: number
	padding?: number
}

export type ExtractedInlineEntity =
	| ({ kind: 'hyperlink' } & HyperlinkEntityInput)
	| ({ kind: 'citation' } & CitationEntityInput)
	| ({ kind: 'latex' } & LatexEntityInput)

export type ExtractInlineEntitiesOptions = {
	extract?: boolean
	hyperlink?: boolean
	citation?: boolean
	latex?: boolean
}

export type ExtractInlineEntitiesResult = {
	/** the markdown text with `{{KEY}}...{{/KEY}}` entity tags */
	text: string
	entities: ExtractedInlineEntity[]
}

/** A GenAI unified-response section (open-ended JSON layout model). */
export type RichSection = Record<string, unknown>

export type RichSubMessageInput = proto.IAIRichResponseSubMessage

export type RichSourceInput = {
	/** favicon / provider icon URL */
	icon?: string
	url?: string
	text?: string
}

export type BuildRichResponseOptions = {
	/** wrap the message as forwarded from an AI bot (default true) */
	forwarded?: boolean
	/** attach session transparency metadata (default false) */
	notification?: boolean
	includesUnifiedResponse?: boolean
	includesSubmessages?: boolean
	quoted?:
		| proto.IMessage
		| {
				key?: { id?: string | null; participant?: string | null; remoteJid?: string | null }
				message?: proto.IMessage | null
		  }
		| null
	quotedParticipant?: string
}

export type RichResponseClient = {
	relayMessage: (jid: string, content: proto.IMessage, options: MessageRelayOptions) => Promise<unknown>
}

const LATEX_FALLBACK_WIDTH_PER_CHAR = 8.5
const LATEX_FALLBACK_MIN_WIDTH = 30
const LATEX_FALLBACK_HEIGHT_TALL = 32
const LATEX_FALLBACK_HEIGHT = 20

/**
 * Estimate the rendered size of a LaTeX image when the caller does not supply
 * explicit dimensions. Uses the same heuristic the WhatsApp client fallback
 * applies to `latex.codecogs.com`-style URLs.
 */
export const estimateLatexDimensions = (
	url: string,
	fontHeight = 45
): { url: string; width: number; height: number } => {
	const fh = fontHeight || 45
	let formula = ''
	try {
		const parsedUrl = new URL(url)
		if (parsedUrl.hostname === 'latex.codecogs.com') {
			formula = decodeURIComponent((parsedUrl.search || '').replace(/^\?/, ''))
			formula = formula
				.replace(/\\dpi\{\d+\}/g, '')
				.replace(/\\bg\{[a-zA-Z0-9#_]+\}/g, '')
				.replace(/\\color\{[a-zA-Z0-9#_]+\}/g, '')
				.replace(/\\space\s+/g, '')
				.trim()
		}
	} catch {
		// not a URL; fall through to the path heuristic
	}

	if (!formula) {
		formula = url.split('/').pop() || ''
	}

	const cleanExpr = formula.replace(/\\[a-zA-Z]+/g, ' ')
	const charCount = Math.max(5, cleanExpr.length)
	const estWidth = Math.max(LATEX_FALLBACK_MIN_WIDTH, charCount * LATEX_FALLBACK_WIDTH_PER_CHAR)
	const estHeight =
		formula.includes('\\frac') || formula.includes('\\sum') || formula.includes('\\int')
			? LATEX_FALLBACK_HEIGHT_TALL
			: LATEX_FALLBACK_HEIGHT

	return {
		url,
		width: Math.max(10, Math.round((estWidth / estHeight) * fh)),
		height: fh
	}
}

/**
 * Build the inline-entity metadata for the unified response payload.
 */
export const createInlineEntity = (entity: ExtractedInlineEntity): Record<string, unknown> => {
	if (entity.kind === 'hyperlink') {
		return {
			key: entity.key,
			metadata: {
				display_name: entity.text,
				is_trusted: entity.isTrusted ?? true,
				url: entity.url,
				__typename: 'GenAIInlineLinkItem'
			}
		}
	}

	if (entity.kind === 'citation') {
		return {
			key: entity.key,
			metadata: {
				reference_id: entity.referenceId,
				reference_url: entity.url,
				reference_title: entity.url,
				reference_display_name: entity.url,
				sources: [],
				__typename: 'GenAISearchCitationItem'
			}
		}
	}

	let fh = Number(entity.fontHeight) || 50
	const lines = entity.text ? entity.text.split(/\\\\/g) : ['']
	const textLen = Math.max(...lines.map(l => l.trim().length)) || 1

	// scale down tall equations so they do not crop on narrow screens (~280px)
	const estimatedWidth = textLen * (fh / 1.8)
	if (estimatedWidth > 280) {
		fh = Math.max(10, Math.floor((280 * 1.8) / textLen))
	}

	const meta: Record<string, unknown> = {
		latex_expression: entity.text,
		font_height: fh,
		padding: Number(entity.padding) || 8,
		__typename: 'GenAILatexItem'
	}

	if (entity.width && entity.height) {
		const w = Number(entity.width) || 100
		const h = Number(entity.height) || 50
		meta.latex_image = {
			url: entity.url,
			width: Math.max(10, Math.round((w / h) * fh)),
			height: fh
		}
	} else {
		const dimensions = estimateLatexDimensions(entity.url, fh)
		meta.latex_image = {
			url: dimensions.url,
			width: dimensions.width,
			height: dimensions.height
		}
	}

	return {
		key: entity.key,
		metadata: meta
	}
}

type InlineEntityIndices = {
	citationIndex: number
	hyperlinkIndex: number
	latexIndex: number
}

const parseLatexEntity = (
	raw: string,
	url: string,
	indices: InlineEntityIndices
): { tag: string; entity: ExtractedInlineEntity } => {
	let txt = raw
	let width: number | null = null
	let height: number | null = null
	let fontHeight = 50
	let padding = 8

	const match = raw.match(/^(.*?)(?:\|(\d+)\|(\d+)(?:\|(\d+)(?:\|(\d+))?)?)?$/)
	if (match?.[2] && match[3]) {
		txt = match[1]!
		width = Number(match[2])
		height = Number(match[3])
		if (match[4]) {
			fontHeight = Number(match[4])
		}

		if (match[5]) {
			padding = Number(match[5])
		}
	}

	let cleanUrl = url
	try {
		const hashIdx = url.indexOf('#')
		if (hashIdx !== -1) {
			const params = new URLSearchParams(url.substring(hashIdx + 1))
			if (params.has('width')) {
				width = Number(params.get('width'))
			}

			if (params.has('height')) {
				height = Number(params.get('height'))
			}

			if (params.has('font_height')) {
				fontHeight = Number(params.get('font_height'))
			}

			if (params.has('padding')) {
				padding = Number(params.get('padding'))
			}

			cleanUrl = url.substring(0, hashIdx)
		}
	} catch {
		// keep the url untouched when it is not parseable
	}

	const key = `KARL_LATEX_${indices.latexIndex++}`
	return {
		tag: `{{${key}}}${txt || 'image'}{{/${key}}}`,
		entity: {
			kind: 'latex',
			key,
			text: txt,
			url: cleanUrl,
			width,
			height,
			fontHeight,
			padding
		}
	}
}

/**
 * Parse one `[...](...)` / `[...]<...>` entity whose closing bracket is at
 * `closeIdx` and whose opening bracket is at `start`. Returns the rewritten
 * tag, the extracted entity and the index just past the closing delimiter,
 * or null when the entity is disabled or unbalanced.
 */
const parseInlineEntityAt = (
	text: string,
	start: number,
	closeIdx: number,
	opts: { hyperlink: boolean; citation: boolean; latex: boolean },
	indices: InlineEntityIndices
): { tag: string; entity: ExtractedInlineEntity; end: number } | null => {
	const open = text[closeIdx + 1]!
	const close = open === '(' ? ')' : '>'
	const type = open === '(' ? 'link' : 'latex'
	let end = closeIdx + 2
	let depth = 1
	while (end < text.length && depth) {
		if (text[end] === open && text[end - 1] !== '\\') {
			depth++
		} else if (text[end] === close && text[end - 1] !== '\\') {
			depth--
		}

		end++
	}

	if (depth) {
		return null
	}

	const raw = text.slice(start + 1, closeIdx).trim()
	const url = text.slice(closeIdx + 2, end - 1).trim()

	if (type === 'latex') {
		if (!opts.latex) {
			return null
		}

		const parsed = parseLatexEntity(raw, url, indices)
		return { ...parsed, end }
	}

	if (raw) {
		if (!opts.hyperlink) {
			return null
		}

		const trusted = !url.startsWith('!')
		const cleanUrl = trusted ? url : url.slice(1)
		const key = `KARL_HYPERLINK_${indices.hyperlinkIndex++}`
		return {
			tag: `{{${key}}}${raw}{{/${key}}}`,
			entity: {
				kind: 'hyperlink',
				key,
				text: raw,
				url: cleanUrl,
				isTrusted: trusted
			},
			end
		}
	}

	if (!opts.citation) {
		return null
	}

	const key = `KARL_CITATION_${indices.citationIndex - 1}`
	return {
		tag: `{{${key}}}${url}{{/${key}}}`,
		entity: {
			kind: 'citation',
			key,
			referenceId: indices.citationIndex++,
			url
		},
		end
	}
}

/**
 * Extract rich inline entities from a markdown-ish text:
 *
 * - `[display](url)` — hyperlink (prefix the url with `!` to mark it untrusted)
 * - `[](url)` — search citation (numbered automatically)
 * - `[expression]<url>` — LaTeX render; optional size params as
 *   `[expression|width|height|fontHeight|padding]<url>` or as
 *   `#width=&height=&font_height=&padding=` query params on the url
 *
 * Returns the rewritten text (with `{{KEY}}...{{/KEY}}` tags) and the
 * extracted entities.
 */
export const extractInlineEntities = (
	text: string,
	opts: ExtractInlineEntitiesOptions = {}
): ExtractInlineEntitiesResult => {
	const { extract = true, hyperlink = true, citation = true, latex = true } = opts
	if (!extract) {
		return { text, entities: [] }
	}

	const entities: ExtractedInlineEntity[] = []
	const indices: InlineEntityIndices = { citationIndex: 1, hyperlinkIndex: 0, latexIndex: 0 }
	const stack: number[] = []
	let result = ''
	let last = 0

	for (let i = 0; i < text.length; i++) {
		if (text[i] === '[' && text[i - 1] !== '\\') {
			stack.push(i)
			continue
		}

		if (text[i] !== ']' || text[i - 1] === '\\') {
			continue
		}

		if (text[i + 1] !== '(' && text[i + 1] !== '<') {
			stack.pop()
			continue
		}

		const start = stack.pop()
		if (start === undefined) {
			continue
		}

		const parsed = parseInlineEntityAt(text, start, i, { hyperlink, citation, latex }, indices)
		if (!parsed) {
			continue
		}

		result += text.slice(last, start) + parsed.tag
		last = parsed.end
		entities.push(parsed.entity)
		i = parsed.end - 1
	}

	result += text.slice(last)
	return { text: result, entities }
}

export type CodeBlockToken = {
	codeContent: string
	highlightType: proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType
}

export type TokenizedCode = {
	codeBlocks: CodeBlockToken[]
	/** wire names for the unified response JSON */
	unifiedCodeBlocks: { content: string; type: string }[]
}

const CODE_KEYWORDS: Record<string, Set<string>> = {
	javascript: new Set([
		'break',
		'case',
		'catch',
		'continue',
		'debugger',
		'delete',
		'do',
		'else',
		'finally',
		'for',
		'function',
		'if',
		'in',
		'instanceof',
		'new',
		'return',
		'switch',
		'this',
		'throw',
		'try',
		'typeof',
		'var',
		'void',
		'while',
		'with',
		'true',
		'false',
		'null',
		'undefined',
		'class',
		'const',
		'let',
		'super',
		'extends',
		'export',
		'import',
		'yield',
		'static',
		'constructor',
		'async',
		'await',
		'get',
		'set'
	]),
	typescript: new Set([
		'abstract',
		'any',
		'as',
		'asserts',
		'bigint',
		'boolean',
		'declare',
		'enum',
		'implements',
		'infer',
		'interface',
		'is',
		'keyof',
		'module',
		'namespace',
		'never',
		'readonly',
		'require',
		'number',
		'object',
		'override',
		'private',
		'protected',
		'public',
		'satisfies',
		'string',
		'symbol',
		'type',
		'unknown',
		'using',
		'from',
		'break',
		'case',
		'catch',
		'continue',
		'do',
		'else',
		'finally',
		'for',
		'function',
		'if',
		'new',
		'return',
		'switch',
		'this',
		'throw',
		'try',
		'var',
		'void',
		'while',
		'class',
		'const',
		'let',
		'extends',
		'import',
		'export',
		'async',
		'await'
	]),
	python: new Set([
		'False',
		'None',
		'True',
		'and',
		'as',
		'assert',
		'async',
		'await',
		'break',
		'class',
		'continue',
		'def',
		'del',
		'elif',
		'else',
		'except',
		'finally',
		'for',
		'from',
		'global',
		'if',
		'import',
		'in',
		'is',
		'lambda',
		'nonlocal',
		'not',
		'or',
		'pass',
		'raise',
		'return',
		'try',
		'while',
		'with',
		'yield'
	]),
	java: new Set([
		'abstract',
		'assert',
		'boolean',
		'break',
		'byte',
		'case',
		'catch',
		'char',
		'class',
		'const',
		'continue',
		'default',
		'do',
		'double',
		'else',
		'enum',
		'extends',
		'final',
		'finally',
		'float',
		'for',
		'goto',
		'if',
		'implements',
		'import',
		'instanceof',
		'int',
		'interface',
		'long',
		'native',
		'new',
		'package',
		'private',
		'protected',
		'public',
		'return',
		'short',
		'static',
		'strictfp',
		'super',
		'switch',
		'synchronized',
		'this',
		'throw',
		'throws',
		'transient',
		'try',
		'void',
		'volatile',
		'while'
	]),
	golang: new Set([
		'break',
		'case',
		'chan',
		'const',
		'continue',
		'default',
		'defer',
		'else',
		'fallthrough',
		'for',
		'func',
		'go',
		'goto',
		'if',
		'import',
		'interface',
		'map',
		'package',
		'range',
		'return',
		'select',
		'struct',
		'switch',
		'type',
		'var'
	]),
	c: new Set([
		'auto',
		'break',
		'case',
		'char',
		'const',
		'continue',
		'default',
		'do',
		'double',
		'else',
		'enum',
		'extern',
		'float',
		'for',
		'goto',
		'if',
		'int',
		'long',
		'register',
		'return',
		'short',
		'signed',
		'sizeof',
		'static',
		'struct',
		'switch',
		'typedef',
		'union',
		'unsigned',
		'void',
		'volatile',
		'while'
	]),
	cpp: new Set([
		'alignas',
		'alignof',
		'and',
		'auto',
		'bool',
		'break',
		'case',
		'catch',
		'class',
		'const',
		'constexpr',
		'continue',
		'delete',
		'do',
		'double',
		'else',
		'enum',
		'explicit',
		'export',
		'extern',
		'false',
		'float',
		'for',
		'friend',
		'if',
		'inline',
		'int',
		'long',
		'mutable',
		'namespace',
		'new',
		'noexcept',
		'nullptr',
		'operator',
		'private',
		'protected',
		'public',
		'return',
		'short',
		'signed',
		'sizeof',
		'static',
		'struct',
		'switch',
		'template',
		'this',
		'throw',
		'true',
		'try',
		'typedef',
		'typename',
		'union',
		'unsigned',
		'using',
		'virtual',
		'void',
		'while'
	]),
	php: new Set([
		'abstract',
		'and',
		'array',
		'as',
		'break',
		'callable',
		'case',
		'catch',
		'class',
		'clone',
		'const',
		'continue',
		'declare',
		'default',
		'do',
		'echo',
		'else',
		'elseif',
		'empty',
		'enddeclare',
		'endfor',
		'endforeach',
		'endif',
		'endswitch',
		'endwhile',
		'extends',
		'final',
		'finally',
		'fn',
		'for',
		'foreach',
		'function',
		'global',
		'goto',
		'if',
		'implements',
		'include',
		'include_once',
		'instanceof',
		'interface',
		'match',
		'namespace',
		'new',
		'null',
		'or',
		'private',
		'protected',
		'public',
		'require',
		'require_once',
		'return',
		'static',
		'switch',
		'throw',
		'trait',
		'try',
		'use',
		'var',
		'while',
		'yield'
	]),
	rust: new Set([
		'as',
		'break',
		'const',
		'continue',
		'crate',
		'else',
		'enum',
		'extern',
		'false',
		'fn',
		'for',
		'if',
		'impl',
		'in',
		'let',
		'loop',
		'match',
		'mod',
		'move',
		'mut',
		'pub',
		'ref',
		'return',
		'self',
		'Self',
		'static',
		'struct',
		'super',
		'trait',
		'true',
		'type',
		'unsafe',
		'use',
		'where',
		'while'
	]),
	html: new Set([
		'html',
		'head',
		'body',
		'div',
		'span',
		'p',
		'a',
		'img',
		'video',
		'audio',
		'script',
		'style',
		'link',
		'meta',
		'form',
		'input',
		'button',
		'table',
		'tr',
		'td',
		'th',
		'ul',
		'ol',
		'li',
		'section',
		'article',
		'header',
		'footer',
		'nav',
		'main'
	]),
	bash: new Set([
		'if',
		'then',
		'else',
		'elif',
		'fi',
		'for',
		'while',
		'do',
		'done',
		'case',
		'esac',
		'function',
		'in',
		'select',
		'until',
		'break',
		'continue',
		'return',
		'export',
		'readonly',
		'local',
		'declare'
	]),
	markdown: new Set(['#', '##', '###', '####', '#####', '######'])
}

const HIGHLIGHT_TYPE_NAMES: Record<number, string> = {
	0: 'DEFAULT',
	1: 'KEYWORD',
	2: 'METHOD',
	3: 'STR',
	4: 'NUMBER',
	5: 'COMMENT'
}

/**
 * Split code into highlighted tokens for `AIRich.addCode`.
 * Plain text languages produce a single default token.
 */
export const tokenizeCode = (code: string, lang = 'javascript'): TokenizedCode => {
	const plain = !lang || lang === 'txt' || lang === 'text' || lang === 'plaintext'
	if (plain) {
		return {
			codeBlocks: [
				{
					codeContent: code,
					highlightType:
						proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_DEFAULT
				}
			],
			unifiedCodeBlocks: [{ content: code, type: 'DEFAULT' }]
		}
	}

	const keywords = CODE_KEYWORDS[lang.toLowerCase()] || new Set<string>()
	const tokens: CodeBlockToken[] = []

	let i = 0
	const push = (content: string, type: proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType) => {
		if (!content) {
			return
		}

		const lastToken = tokens[tokens.length - 1]
		if (lastToken?.highlightType === type) {
			lastToken.codeContent += content
		} else {
			tokens.push({ codeContent: content, highlightType: type })
		}
	}

	const isIdentifier = (char: string) => {
		switch (lang.toLowerCase()) {
			case 'css':
				return /[a-zA-Z0-9_$-]/.test(char)
			case 'html':
				return /[a-zA-Z0-9_$:-]/.test(char)
			default:
				return /[a-zA-Z0-9_$]/.test(char)
		}
	}

	while (i < code.length) {
		const c = code[i]!

		if (/\s/.test(c)) {
			const s = i
			while (i < code.length && /\s/.test(code[i]!)) {
				i++
			}

			push(
				code.slice(s, i),
				proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_DEFAULT
			)
			continue
		}

		if ((c === '/' && code[i + 1] === '/') || (c === '#' && ['python', 'bash'].includes(lang.toLowerCase()))) {
			const s = i
			while (i < code.length && code[i] !== '\n') {
				i++
			}

			push(
				code.slice(s, i),
				proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_COMMENT
			)
			continue
		}

		if (c === '"' || c === "'" || c === '`') {
			const s = i
			const q = c
			i++
			while (i < code.length) {
				if (code[i] === '\\' && i + 1 < code.length) {
					i += 2
				} else if (code[i] === q) {
					i++
					break
				} else {
					i++
				}
			}

			push(
				code.slice(s, i),
				proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_STRING
			)
			continue
		}

		if (/[0-9]/.test(c)) {
			const s = i
			while (i < code.length && /[0-9._]/.test(code[i]!)) {
				i++
			}

			push(
				code.slice(s, i),
				proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_NUMBER
			)
			continue
		}

		if (/[a-zA-Z_$]/.test(c)) {
			const s = i
			while (i < code.length && isIdentifier(code[i]!)) {
				i++
			}

			const word = code.slice(s, i)
			let type: proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType =
				proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_DEFAULT
			if (keywords.has(word)) {
				type = proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_KEYWORD
			} else if (lang.toLowerCase() === 'css') {
				let j = i
				while (j < code.length && /\s/.test(code[j]!)) {
					j++
				}

				if (code[j] === ':') {
					type =
						proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_KEYWORD
				}
			} else if (lang.toLowerCase() === 'html') {
				let p = s - 1
				while (p >= 0 && /\s/.test(code[p]!)) {
					p--
				}

				if (code[p] === '<' || (code[p] === '/' && code[p - 1] === '<')) {
					type =
						proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_KEYWORD
				}
			}

			if (
				type ===
				proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_DEFAULT
			) {
				let j = i
				while (j < code.length && /\s/.test(code[j]!)) {
					j++
				}

				if (code[j] === '(') {
					type = proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_METHOD
				}
			}

			push(word, type)
			continue
		}

		push(c, proto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType.AI_RICH_RESPONSE_CODE_HIGHLIGHT_DEFAULT)
		i++
	}

	return {
		codeBlocks: tokens,
		unifiedCodeBlocks: tokens.map(t => ({
			content: t.codeContent,
			type: HIGHLIGHT_TYPE_NAMES[t.highlightType] || 'DEFAULT'
		}))
	}
}

export type TableMetadata = {
	/** proto-compatible table rows */
	rows: proto.AIRichResponseTableMetadata.IAIRichResponseTableRow[]
	/** open JSON rows for the unified response */
	unifiedRows: Record<string, unknown>[]
}

/**
 * Build table metadata from a nested array of strings; the first row is the
 * header. Cells support the same inline-entity syntax as `extractInlineEntities`.
 */
export const buildTableMetadata = (table: string[][], opts: ExtractInlineEntitiesOptions = {}): TableMetadata => {
	const { hyperlink = true, citation = true, latex = true } = opts
	if (!Array.isArray(table) || !table.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string'))) {
		throw new TypeError('Table must be a nested array of strings')
	}

	if (table.length === 0) {
		throw new TypeError('Table must have at least a header row')
	}

	const header = table[0]!
	const rows = table.slice(1)
	const maxLen = Math.max(header.length, ...rows.map(r => r.length), 1)
	const normalize = (r: string[]) => [...r, ...Array(maxLen - r.length).fill('')]

	const unifiedRows = [normalize(header), ...rows.map(r => normalize(r))].map((cells, index) => {
		const isHeader = index === 0
		const markdownCells = cells.map(cell => {
			const extracted = extractInlineEntities(cell, { hyperlink, citation, latex })
			return {
				text: extracted.text,
				...(extracted.entities.length ? { inline_entities: extracted.entities.map(createInlineEntity) } : {})
			}
		})

		return {
			is_header: isHeader,
			cells,
			...(markdownCells.some(c => c.inline_entities?.length) ? { markdown_cells: markdownCells } : {})
		}
	})

	const rowsMeta: proto.AIRichResponseTableMetadata.IAIRichResponseTableRow[] = unifiedRows.map(r => ({
		items: r.cells,
		...(r.is_header ? { isHeading: true } : {})
	}))

	return { rows: rowsMeta, unifiedRows }
}

const newLayout = (
	name: string,
	data: Record<string, unknown> | Record<string, unknown>[],
	extra: Record<string, unknown> = {}
): RichSection => ({
	...extra,
	view_model: {
		[Array.isArray(data) ? 'primitives' : 'primitive']: data,
		__typename: `GenAI${name}LayoutViewModel`
	}
})

/**
 * Builder for Meta AI rich responses: markdown text with citations, links and
 * LaTeX, syntax-highlighted code blocks and tables.
 */
export class AIRich {
	private submessages: proto.IAIRichResponseSubMessage[] = []
	private sections: RichSection[] = []
	private richResponseSources: proto.BotSourcesMetadata.IBotSourceItem[] = []
	private title = ''
	private footer = ''
	private contextInfo: proto.IContextInfo = {}

	setTitle(title: string) {
		if (typeof title !== 'string') {
			throw new TypeError('Title must be a string')
		}

		this.title = title
		return this
	}

	setFooter(footer: string) {
		if (typeof footer !== 'string') {
			throw new TypeError('Footer must be a string')
		}

		this.footer = footer
		return this
	}

	setContextInfo(contextInfo: proto.IContextInfo) {
		if (typeof contextInfo !== 'object' || contextInfo === null || Array.isArray(contextInfo)) {
			throw new TypeError('ContextInfo must be a plain object')
		}

		this.contextInfo = contextInfo
		return this
	}

	/** escape hatch: append raw submessages */
	addSubmessage(submessage: RichSubMessageInput | RichSubMessageInput[]) {
		const items = Array.isArray(submessage) ? submessage : [submessage]
		for (const item of items) {
			if (typeof item !== 'object' || item === null || Array.isArray(item)) {
				throw new TypeError('Submessage must be a plain object or array of plain objects')
			}

			this.submessages.push(item)
		}

		return this
	}

	/** escape hatch: append raw unified-response sections */
	addSection(section: RichSection | RichSection[]) {
		const items = Array.isArray(section) ? section : [section]
		for (const item of items) {
			if (typeof item !== 'object' || item === null || Array.isArray(item)) {
				throw new TypeError('Section must be a plain object or array of plain objects')
			}

			this.sections.push(item)
		}

		return this
	}

	addText(text: string, opts: ExtractInlineEntitiesOptions = {}) {
		if (typeof text !== 'string') {
			throw new TypeError('Text must be a string')
		}

		const extracted = extractInlineEntities(text, opts)
		const inlineEntities = extracted.entities.map(createInlineEntity)
		this.submessages.push({
			messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TEXT,
			messageText: extracted.text
		})

		// keep a visual gap after non-text layouts
		if (this.sections.length > 0) {
			const last = this.sections[this.sections.length - 1]!
			const lastViewModel = last.view_model as Record<string, unknown> | undefined
			const lastPrimitive = lastViewModel?.primitive as Record<string, unknown> | undefined
			const lastType = lastPrimitive?.__typename
			const lastText = lastPrimitive?.text
			if (lastType && lastType !== 'GenAIMarkdownTextUXPrimitive' && lastText !== ' ') {
				this.sections.push(
					newLayout('Single', {
						text: ' ',
						__typename: 'GenAIMarkdownTextUXPrimitive'
					})
				)
			}
		}

		this.sections.push(
			newLayout('Single', {
				text: extracted.text,
				...(inlineEntities.length && { inline_entities: inlineEntities }),
				__typename: 'GenAIMarkdownTextUXPrimitive'
			})
		)

		return this
	}

	addCode(language: string, code: string) {
		if (typeof language !== 'string' || typeof code !== 'string') {
			throw new TypeError('Language and code must be a string')
		}

		const cleanCode = code.replace(/^[\r\n]+|[\r\n]+$/g, '')
		const meta = tokenizeCode(cleanCode, language)
		this.submessages.push({
			messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_CODE,
			codeMetadata: {
				codeLanguage: language,
				codeBlocks: meta.codeBlocks
			}
		})

		this.sections.push(
			newLayout('Single', {
				language,
				code_blocks: meta.unifiedCodeBlocks,
				__typename: 'GenAICodeUXPrimitive'
			})
		)

		return this
	}

	addTable(table: string[][], opts: ExtractInlineEntitiesOptions = {}) {
		const meta = buildTableMetadata(table, opts)
		this.submessages.push({
			messageType: proto.AIRichResponseSubMessageType.AI_RICH_RESPONSE_TABLE,
			tableMetadata: {
				title: '',
				rows: meta.rows
			}
		})

		this.sections.push(
			newLayout('Single', {
				rows: meta.unifiedRows,
				// the client-side layout name used by WhatsApp's rich renderer
				__typename: 'GenATableUXPrimitive'
			})
		)

		return this
	}

	/**
	 * Add a "sources" strip. Each source is `{ icon, url, text }` — icons are
	 * plain image URLs.
	 */
	addSource(sources: RichSourceInput[] = []) {
		const items = Array.isArray(sources) ? sources : [sources]
		const sourceItems = items.map((item, index) => {
			this.richResponseSources.push({
				provider: proto.BotSourcesMetadata.BotSourceItem.SourceProvider.OTHER,
				thumbnailCdnUrl: item.icon ?? '',
				sourceProviderUrl: item.url ?? '',
				sourceQuery: '',
				faviconCdnUrl: item.icon ?? '',
				citationNumber: index + 1,
				sourceTitle: item.text ?? ''
			})

			return {
				source_type: 'THIRD_PARTY',
				source_display_name: item.text ?? '',
				source_subtitle: 'AI',
				source_url: item.url ?? '',
				favicon: {
					url: item.icon ?? '',
					mime_type: 'image/jpeg',
					width: 16,
					height: 16
				}
			}
		})

		this.sections.push(
			newLayout('Single', {
				sources: sourceItems,
				__typename: 'GenAISearchResultPrimitive'
			})
		)

		return this
	}

	/** Build the `botForwardedMessage.richResponseMessage` message content. */
	build(opts: BuildRichResponseOptions = {}): proto.IMessage {
		const {
			forwarded = true,
			notification = false,
			includesUnifiedResponse = true,
			includesSubmessages = true,
			quoted,
			quotedParticipant
		} = opts

		const forward: proto.IContextInfo = forwarded
			? {
					forwardingScore: 1,
					isForwarded: true,
					forwardedAiBotMessageInfo: { botJid: '0@bot' },
					forwardOrigin: proto.ContextInfo.ForwardOrigin.META_AI
				}
			: {}

		const notif: proto.IBotMetadata = notification
			? {
					sessionTransparencyMetadata: {
						disclaimerText: this.title,
						hcaId: `hca_${Date.now()}`,
						sessionTransparencyType: 1
					}
				}
			: {}

		const quotedMessage = (quoted ? ('message' in quoted ? (quoted.message ?? undefined) : quoted) : undefined) as
			| proto.IMessage
			| undefined
		const quotedKey = quoted && 'key' in quoted ? quoted.key : undefined
		const quote: proto.IContextInfo = quoted
			? {
					stanzaId: quotedKey?.id || undefined,
					participant: quotedParticipant || quotedKey?.participant || quotedKey?.remoteJid || undefined,
					quotedType: 0,
					quotedMessage: quotedMessage ?? undefined
				}
			: {}

		const sections = this.footer
			? [
					...this.sections,
					newLayout('Single', {
						text: this.footer,
						__typename: 'GenAIMetadataTextPrimitive'
					})
				]
			: [...this.sections]

		const content: proto.IMessage = {
			messageContextInfo: {
				deviceListMetadata: {},
				deviceListMetadataVersion: 2,
				botMetadata: {
					messageDisclaimerText: this.title,
					richResponseSourcesMetadata: {
						sources: this.richResponseSources
					},
					...notif
				}
			},
			botForwardedMessage: {
				message: {
					richResponseMessage: {
						messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
						submessages: includesSubmessages ? this.submessages : [],
						unifiedResponse: {
							data: includesUnifiedResponse
								? Buffer.from(
										JSON.stringify({
											__typename: 'GenAIUnifiedResponse',
											response_id: randomUUID(),
											sections
										})
									)
								: undefined
						},
						contextInfo: {
							...forward,
							...quote,
							...this.contextInfo
						}
					}
				}
			}
		}

		return content
	}

	async send(
		client: RichResponseClient,
		jid: string,
		opts: BuildRichResponseOptions = {},
		relayOptions: MessageRelayOptions = {}
	) {
		const content = this.build(opts)
		await client.relayMessage(jid, content, relayOptions)
		return content
	}
}

/**
 * Toolkit helpers for rich responses. `extractIE` mirrors the markdown-ish
 * inline-entity extraction used by the builder.
 */
export class Toolkit {
	static extractIE(text: string, opts: ExtractInlineEntitiesOptions = {}) {
		return extractInlineEntities(text, opts)
	}

	static resolveLatexDimensions(url: string, fontHeight = 45) {
		return estimateLatexDimensions(url, fontHeight)
	}
}

/**
 * Build the content for `sendHtml`: an HTML payload rendered through Meta AI's
 * rich-response HTML primitive.
 */
export const buildHtmlResponse = (html: string): proto.IMessage => ({
	botForwardedMessage: {
		message: {
			richResponseMessage: {
				messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
				unifiedResponse: {
					data: Buffer.from(
						JSON.stringify({
							__typename: 'GenAIUnifiedResponse',
							response_id: randomUUID(),
							sections: [
								{
									__typename: 'GenAIUnifiedResponseSection',
									view_model: {
										__typename: 'GenAISingleLayoutViewModel',
										primitive: {
											__typename: 'FOAHtmlPrimitiveDemoDONOTUSE',
											trusted_sources: [],
											payload: String(html).trim()
										}
									}
								}
							]
						})
					)
				},
				contextInfo: {
					isForwarded: true,
					forwardOrigin: proto.ContextInfo.ForwardOrigin.META_AI
				}
			}
		}
	}
})
