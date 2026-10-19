import type { GroupMetadata, SocketConfig } from '../Types'
import { generateMessageIDV2 } from '../Utils'
import type { BinaryNode } from '../WABinary'
import { getBinaryNodeChild, getBinaryNodeChildren } from '../WABinary'
import { makeCommunitiesSocket } from './communities'
import { extractGroupMetadata } from './groups'

export type AIGroupParticipantUpdate = {
	status: string
	jid: string | undefined
	content: BinaryNode
}

export type AIGroupCreateOptions = {
	ephemeralExpiration?: number
	memberAddMode?: string
	memberShareGroupHistoryMode?: string
	memberLinkMode?: string
}

/**
 * The default Meta AI bot user that is added to AI groups.
 */
export const DEFAULT_AI_GROUP_BOT_USER = '867051314767696'

/**
 * Extract AI group metadata from an interactive query/create response.
 * Create responses wrap the group node in a <create> child.
 */
export const extractAIGroupMetadata = (result: BinaryNode): GroupMetadata => {
	const createNode = getBinaryNodeChild(result, 'create')
	const groupInCreate = createNode ? getBinaryNodeChild(createNode, 'group') : undefined
	if (groupInCreate) {
		return extractGroupMetadata({ tag: 'iq', attrs: { type: 'result' }, content: [groupInCreate] })
	}

	return extractGroupMetadata(result)
}

export const makeAIGroupsSocket = (config: SocketConfig) => {
	const sock = makeCommunitiesSocket(config)
	const { query } = sock

	const aiGroupQuery = async (jid: string, type: 'get' | 'set', content: BinaryNode[]) =>
		query({
			tag: 'iq',
			attrs: {
				type,
				xmlns: 'w:g2',
				to: jid
			},
			content
		})

	const aiGroupMetadata = async (jid: string) => {
		const result = await aiGroupQuery(jid, 'get', [{ tag: 'query', attrs: { request: 'interactive' } }])
		return extractAIGroupMetadata(result)
	}

	const aiGroupCreate = async (subject: string, participants: string[] = [], options: AIGroupCreateOptions = {}) => {
		const {
			ephemeralExpiration = 86400,
			memberAddMode = 'all_member_add',
			memberShareGroupHistoryMode = 'all_member_share',
			memberLinkMode = 'all_member_link'
		} = options
		const result = await aiGroupQuery('@g.us', 'set', [
			{
				tag: 'create',
				attrs: { subject, key: generateMessageIDV2() },
				content: participants.map(jid => ({
					tag: 'participant',
					attrs: { jid }
				}))
			},
			{
				tag: 'linked_parent',
				attrs: {},
				content: [
					{
						tag: 'ephemeral',
						attrs: { expiration: ephemeralExpiration.toString() }
					},
					{
						tag: 'member_add_mode',
						attrs: {},
						content: Buffer.from(memberAddMode, 'utf-8')
					},
					{
						tag: 'member_share_group_history_mode',
						attrs: {},
						content: Buffer.from(memberShareGroupHistoryMode, 'utf-8')
					},
					{
						tag: 'member_link_mode',
						attrs: {},
						content: Buffer.from(memberLinkMode, 'utf-8')
					}
				]
			}
		])
		return extractAIGroupMetadata(result)
	}

	const aiGroupAddBot = async (jid: string, botUser = DEFAULT_AI_GROUP_BOT_USER) => {
		const result = await aiGroupQuery(jid, 'set', [
			{
				tag: 'add',
				attrs: {},
				content: [
					{
						tag: 'participant',
						attrs: { jid: `${botUser}@bot` }
					}
				]
			}
		])
		const node = getBinaryNodeChild(result, 'add')
		const participantsAffected = getBinaryNodeChildren(node, 'participant')
		return participantsAffected.map(p => ({
			status: p.attrs.error || '200',
			jid: p.attrs.jid
		}))
	}

	const aiGroupParticipantsUpdate = async (
		jid: string,
		participants: string[],
		action: string
	): Promise<AIGroupParticipantUpdate[]> => {
		const result = await aiGroupQuery(jid, 'set', [
			{
				tag: action,
				attrs: {},
				content: participants.map(participantJid => ({
					tag: 'participant',
					attrs: { jid: participantJid }
				}))
			}
		])
		const node = getBinaryNodeChild(result, action)
		const participantsAffected = getBinaryNodeChildren(node, 'participant')
		return participantsAffected.map(p => ({
			status: p.attrs.error || '200',
			jid: p.attrs.jid,
			content: p
		}))
	}

	const aiGroupUpdateSubject = async (jid: string, subject: string) => {
		await aiGroupQuery(jid, 'set', [
			{
				tag: 'subject',
				attrs: {},
				content: Buffer.from(subject, 'utf-8')
			}
		])
	}

	const aiGroupInviteCode = async (jid: string) => {
		const result = await aiGroupQuery(jid, 'get', [{ tag: 'invite', attrs: {} }])
		const inviteNode = getBinaryNodeChild(result, 'invite')
		return inviteNode?.attrs.code
	}

	const aiGroupRevokeInvite = async (jid: string) => {
		const result = await aiGroupQuery(jid, 'set', [{ tag: 'invite', attrs: {} }])
		const inviteNode = getBinaryNodeChild(result, 'invite')
		return inviteNode?.attrs.code
	}

	const aiGroupAcceptInvite = async (code: string) => {
		const results = await aiGroupQuery('@g.us', 'set', [{ tag: 'invite', attrs: { code } }])
		const result = getBinaryNodeChild(results, 'group')
		return result?.attrs.jid
	}

	const aiGroupSettingUpdate = async (jid: string, setting: string) => {
		await aiGroupQuery(jid, 'set', [{ tag: setting, attrs: {} }])
	}

	const aiGroupToggleEphemeral = async (jid: string, ephemeralExpiration?: number) => {
		const content: BinaryNode = ephemeralExpiration
			? { tag: 'ephemeral', attrs: { expiration: ephemeralExpiration.toString() } }
			: { tag: 'not_ephemeral', attrs: {} }
		await aiGroupQuery(jid, 'set', [content])
	}

	const aiGroupLeave = async (id: string) => {
		await aiGroupQuery('@g.us', 'set', [
			{
				tag: 'leave',
				attrs: {},
				content: [{ tag: 'group', attrs: { id } }]
			}
		])
	}

	// Group notifications for AI groups (create/promote/demote/add/remove/subject) arrive
	// over the same w:gp2 namespace as regular groups and are already normalised into
	// groups.upsert / group-participants.update / groups.update by the message pipeline,
	// so no extra raw listener is registered here.

	return {
		...sock,
		aiGroupMetadata,
		aiGroupCreate,
		aiGroupAddBot,
		aiGroupParticipantsUpdate,
		aiGroupUpdateSubject,
		aiGroupInviteCode,
		aiGroupRevokeInvite,
		aiGroupAcceptInvite,
		aiGroupSettingUpdate,
		aiGroupToggleEphemeral,
		aiGroupLeave
	}
}
