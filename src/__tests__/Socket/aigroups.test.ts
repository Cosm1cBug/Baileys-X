import { jest } from '@jest/globals'
import type { SocketConfig } from '../../Types'
import type { ILogger } from '../../Utils/logger'
import { type BinaryNode, getBinaryNodeChild } from '../../WABinary'

const logger: ILogger = {
	level: 'silent',
	child: () => logger,
	trace: jest.fn(),
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn()
}

const query = jest.fn(async (_node: BinaryNode): Promise<BinaryNode> => {
	void _node
	return { tag: 'iq', attrs: { type: 'result' }, content: undefined }
})

jest.unstable_mockModule('../../Socket/communities', () => ({
	makeCommunitiesSocket: () => ({ query })
}))

const { makeAIGroupsSocket, extractAIGroupMetadata, DEFAULT_AI_GROUP_BOT_USER } = await import('../../Socket/aigroups')

const makeSock = () => makeAIGroupsSocket({ logger } as SocketConfig)

const lastQueryNode = () => query.mock.calls[query.mock.calls.length - 1]![0] as BinaryNode

const groupNode = (): BinaryNode => ({
	tag: 'group',
	attrs: {
		id: '120363000000000001',
		subject: 'My AI Group',
		creation: '1700000000',
		s_t: '1700000000'
	},
	content: [{ tag: 'participant', attrs: { jid: '5511888888888@s.whatsapp.net', type: 'admin' } }]
})

describe('extractAIGroupMetadata', () => {
	it('parses a bare <group> response', () => {
		const result: BinaryNode = { tag: 'iq', attrs: { type: 'result' }, content: [groupNode()] }
		const metadata = extractAIGroupMetadata(result)
		expect(metadata.id).toBe('120363000000000001@g.us')
		expect(metadata.subject).toBe('My AI Group')
		expect(metadata.participants).toHaveLength(1)
	})

	it('unwraps a <create> response', () => {
		const result: BinaryNode = {
			tag: 'iq',
			attrs: { type: 'result' },
			content: [{ tag: 'create', attrs: {}, content: [groupNode()] }]
		}
		const metadata = extractAIGroupMetadata(result)
		expect(metadata.id).toBe('120363000000000001@g.us')
		expect(metadata.subject).toBe('My AI Group')
	})
})

describe('ai groups socket', () => {
	beforeEach(() => {
		query.mockClear()
	})

	it('queries metadata with an interactive request', async () => {
		query.mockResolvedValueOnce({ tag: 'iq', attrs: { type: 'result' }, content: [groupNode()] })
		const sock = makeSock()
		const metadata = await sock.aiGroupMetadata('120363000000000001@g.us')

		expect(metadata.subject).toBe('My AI Group')
		const node = lastQueryNode()
		expect(node.attrs).toMatchObject({ type: 'get', xmlns: 'w:g2', to: '120363000000000001@g.us' })
		expect(node.content?.[0]).toEqual({ tag: 'query', attrs: { request: 'interactive' } })
	})

	it('creates a group with participants and linked-parent settings', async () => {
		query.mockResolvedValueOnce({
			tag: 'iq',
			attrs: { type: 'result' },
			content: [{ tag: 'create', attrs: {}, content: [groupNode()] }]
		})

		const sock = makeSock()
		const metadata = await sock.aiGroupCreate('My AI Group', ['5511888888888@s.whatsapp.net'])
		expect(metadata.id).toBe('120363000000000001@g.us')

		const node = lastQueryNode()
		expect(node.attrs).toMatchObject({ type: 'set', xmlns: 'w:g2', to: '@g.us' })
		const [create, linkedParent] = node.content as BinaryNode[]
		expect(create!.tag).toBe('create')
		expect(create!.attrs.subject).toBe('My AI Group')
		expect(create!.attrs.key).toBeTruthy()
		expect(linkedParent!.tag).toBe('linked_parent')
		expect((linkedParent!.content as BinaryNode[]).map(c => c.tag)).toEqual([
			'ephemeral',
			'member_add_mode',
			'member_share_group_history_mode',
			'member_link_mode'
		])
	})

	it('adds the default Meta AI bot to a group', async () => {
		query.mockResolvedValueOnce({
			tag: 'iq',
			attrs: { type: 'result' },
			content: [
				{
					tag: 'add',
					attrs: {},
					content: [{ tag: 'participant', attrs: { jid: `${DEFAULT_AI_GROUP_BOT_USER}@bot`, error: '200' } }]
				}
			]
		})

		const sock = makeSock()
		const results = await sock.aiGroupAddBot('120363000000000001@g.us')
		expect(results).toEqual([{ status: '200', jid: `${DEFAULT_AI_GROUP_BOT_USER}@bot` }])

		const node = lastQueryNode()
		const add = node.content?.[0] as BinaryNode
		expect(add.tag).toBe('add')
		expect(add.content?.[0]).toEqual({ tag: 'participant', attrs: { jid: `${DEFAULT_AI_GROUP_BOT_USER}@bot` } })
	})

	it('updates participants and reports their status', async () => {
		query.mockResolvedValueOnce({
			tag: 'iq',
			attrs: { type: 'result' },
			content: [
				{
					tag: 'promote',
					attrs: {},
					content: [{ tag: 'participant', attrs: { jid: '5511888888888@s.whatsapp.net' } }]
				}
			]
		})

		const sock = makeSock()
		const results = await sock.aiGroupParticipantsUpdate(
			'120363000000000001@g.us',
			['5511888888888@s.whatsapp.net'],
			'promote'
		)
		expect(results[0]).toMatchObject({ status: '200', jid: '5511888888888@s.whatsapp.net' })
		const promote = lastQueryNode().content?.[0] as BinaryNode
		expect(promote.tag).toBe('promote')
	})

	it('updates the subject with buffer content', async () => {
		const sock = makeSock()
		await sock.aiGroupUpdateSubject('120363000000000001@g.us', 'New name')
		const subject = lastQueryNode().content?.[0] as BinaryNode
		expect(subject.tag).toBe('subject')
		expect(Buffer.from(subject.content as Uint8Array).toString('utf-8')).toBe('New name')
	})

	it('fetches and revokes invite codes', async () => {
		query.mockResolvedValueOnce({
			tag: 'iq',
			attrs: { type: 'result' },
			content: [{ tag: 'invite', attrs: { code: 'abc123' }, content: undefined }]
		})
		const sock = makeSock()
		await expect(sock.aiGroupInviteCode('120363000000000001@g.us')).resolves.toBe('abc123')

		query.mockResolvedValueOnce({
			tag: 'iq',
			attrs: { type: 'result' },
			content: [{ tag: 'invite', attrs: { code: 'def456' }, content: undefined }]
		})
		await expect(sock.aiGroupRevokeInvite('120363000000000001@g.us')).resolves.toBe('def456')
	})

	it('accepts an invite and returns the group jid', async () => {
		query.mockResolvedValueOnce({
			tag: 'iq',
			attrs: { type: 'result' },
			content: [{ tag: 'group', attrs: { jid: '120363000000000001@g.us' }, content: undefined }]
		})
		const sock = makeSock()
		await expect(sock.aiGroupAcceptInvite('abc123')).resolves.toBe('120363000000000001@g.us')
		expect((lastQueryNode().content?.[0] as BinaryNode).attrs).toEqual({ code: 'abc123' })
	})

	it('toggles ephemeral expiry on and off', async () => {
		const sock = makeSock()
		await sock.aiGroupToggleEphemeral('120363000000000001@g.us', 86400)
		expect(lastQueryNode().content?.[0]).toEqual({ tag: 'ephemeral', attrs: { expiration: '86400' } })

		await sock.aiGroupToggleEphemeral('120363000000000001@g.us')
		expect(lastQueryNode().content?.[0]).toEqual({ tag: 'not_ephemeral', attrs: {} })
	})

	it('updates a setting and leaves the group', async () => {
		const sock = makeSock()
		await sock.aiGroupSettingUpdate('120363000000000001@g.us', 'announcement')
		expect(lastQueryNode().content?.[0]).toEqual({ tag: 'announcement', attrs: {} })

		await sock.aiGroupLeave('120363000000000001@g.us')
		const leave = lastQueryNode().content?.[0] as BinaryNode
		expect(leave.tag).toBe('leave')
		expect(getBinaryNodeChild(leave, 'group')?.attrs.id).toBe('120363000000000001@g.us')
	})
})
