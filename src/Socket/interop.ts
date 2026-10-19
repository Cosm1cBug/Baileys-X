import { Boom } from '@hapi/boom'
import type { SocketConfig } from '../Types'
import { getBinaryNodeChild, getBinaryNodeChildren, S_WHATSAPP_NET } from '../WABinary'
import { makeAIGroupsSocket } from './aigroups'

export const INTEGRATOR_BIRDYCHAT = 12
export const INTEGRATOR_HAIKET = 13

const TOS_TRACKABLE_ID = '20240306'
const TOS_RESULT_SHOWN = '105'
const TOS_RESULT_ACCEPTED = '160'

const INTEROP_BATCH_MAX = 256

export type InteropIntegrator = {
	id: number
	name: string
	status: 'active' | 'onboarding' | 'removed'
	icon: string | undefined
	identifierType: 'email' | 'pn' | 'username'
	optedIn: boolean
	features: {
		groupMessaging: boolean
	}
}

export type InteropUserRef = {
	externalId: string
	integratorId: number
}

export type InteropUserResolved = {
	jid: string
	externalId: string
	normalizedExternalId: string
	integratorId: number
	error?: undefined
}

export type InteropUserError = {
	externalId: string
	integratorId: number
	error: {
		code: number
		text: string
	}
	jid?: undefined
}

export type InteropUserResult = InteropUserResolved | InteropUserError

export type InteropReachabilitySettings = {
	enabled: string | undefined
	users: {
		externalId: string
		integratorId: number
		jid: string
	}[]
}

export const makeInteropSocket = (config: SocketConfig) => {
	const sock = makeAIGroupsSocket(config)
	const { query } = sock
	const logger = config.logger

	const fetchIntegrators = async (): Promise<InteropIntegrator[]> => {
		const result = await query({
			tag: 'iq',
			attrs: {
				type: 'get',
				xmlns: 'w:interop',
				to: S_WHATSAPP_NET
			},
			content: [{ tag: 'integrator', attrs: { fetch: 'all' } }]
		})
		const listNode = getBinaryNodeChild(result, 'integrator_list')
		if (!listNode) {
			return []
		}

		const globalOptedIn = listNode.attrs?.opted_in === 'true'
		return getBinaryNodeChildren(listNode, 'integrator').map(node => {
			const featuresNode = getBinaryNodeChild(node, 'features')
			return {
				id: parseInt(node.attrs.id ?? '0'),
				name: node.attrs.name ?? '',
				status: node.attrs.status as InteropIntegrator['status'],
				icon: node.attrs.icon,
				identifierType: node.attrs.identifier_type as InteropIntegrator['identifierType'],
				optedIn: node.attrs.opted_in === 'true' || globalOptedIn,
				features: {
					groupMessaging: featuresNode?.attrs?.group_messaging === 'true'
				}
			}
		})
	}

	const sendTOSTrackable = async (id: string, result: string) => {
		await query({
			tag: 'iq',
			attrs: { to: S_WHATSAPP_NET, type: 'set', xmlns: 'tos' },
			content: [{ tag: 'trackable', attrs: { id, result } }]
		})
	}

	const acceptInteropTOS = async () => {
		await sendTOSTrackable(TOS_TRACKABLE_ID, TOS_RESULT_SHOWN)
		await sendTOSTrackable(TOS_TRACKABLE_ID, TOS_RESULT_ACCEPTED)
	}

	const optInIntegrators = async (integratorIds: number[] = [INTEGRATOR_BIRDYCHAT, INTEGRATOR_HAIKET]) => {
		await query({
			tag: 'iq',
			attrs: { type: 'set', xmlns: 'w:interop', to: S_WHATSAPP_NET },
			content: [
				{
					tag: 'opt_in_integrators',
					attrs: {},
					content: [
						{
							tag: 'integrator_list',
							attrs: {},
							content: integratorIds.map(id => ({
								tag: 'integrator',
								attrs: { id: id.toString() }
							}))
						}
					]
				}
			]
		})
	}

	const optOutIntegrators = async (integratorIds: number[] = [INTEGRATOR_BIRDYCHAT, INTEGRATOR_HAIKET]) => {
		await query({
			tag: 'iq',
			attrs: { type: 'set', xmlns: 'w:interop', to: S_WHATSAPP_NET },
			content: [
				{
					tag: 'opt_out_integrators',
					attrs: {},
					content: [
						{
							tag: 'integrator_list',
							attrs: {},
							content: integratorIds.map(id => ({
								tag: 'integrator',
								attrs: { id: id.toString() }
							}))
						}
					]
				}
			]
		})
	}

	const resolveInteropUsers = async (users: InteropUserRef[]): Promise<InteropUserResult[]> => {
		if (users.length > INTEROP_BATCH_MAX) {
			throw new Boom(`Batch size exceeds maximum of ${INTEROP_BATCH_MAX}`, { statusCode: 400 })
		}

		const result = await query({
			tag: 'iq',
			attrs: { type: 'get', xmlns: 'w:interop', to: S_WHATSAPP_NET },
			content: [
				{
					tag: 'users',
					attrs: {},
					content: users.map(({ externalId, integratorId }) => ({
						tag: 'user',
						attrs: {
							external_id: externalId,
							integrator_id: integratorId.toString()
						}
					}))
				}
			]
		})
		const usersNode = getBinaryNodeChild(result, 'users')
		if (!usersNode) {
			return []
		}

		return getBinaryNodeChildren(usersNode, 'user').map(userNode => {
			const errorNode = getBinaryNodeChild(userNode, 'error')
			if (errorNode) {
				return {
					externalId: userNode.attrs.external_id ?? '',
					integratorId: parseInt(userNode.attrs.integrator_id ?? '0'),
					error: {
						code: parseInt(errorNode.attrs.code ?? '0'),
						text: errorNode.attrs.text ?? ''
					}
				}
			}

			return {
				jid: userNode.attrs.jid ?? '',
				externalId: userNode.attrs.external_id ?? '',
				normalizedExternalId: userNode.attrs.normalized_external_id ?? '',
				integratorId: parseInt(userNode.attrs.integrator_id ?? '0')
			}
		})
	}

	const resolveInteropUser = async (externalId: string, integratorId: number): Promise<InteropUserResult | null> => {
		const results = await resolveInteropUsers([{ externalId, integratorId }])
		return results[0] ?? null
	}

	const getReachabilitySettings = async (): Promise<InteropReachabilitySettings | null> => {
		const result = await query({
			tag: 'iq',
			attrs: { type: 'get', xmlns: 'w:interop', to: S_WHATSAPP_NET },
			content: [{ tag: 'reachability_settings', attrs: {} }]
		})
		const settingsNode = getBinaryNodeChild(result, 'reachability_settings')
		if (!settingsNode) {
			return null
		}

		return {
			enabled: settingsNode.attrs?.enabled,
			users: getBinaryNodeChildren(settingsNode, 'user').map(n => ({
				externalId: n.attrs.external_id ?? '',
				integratorId: parseInt(n.attrs.integrator_id ?? '0'),
				jid: n.attrs.jid ?? ''
			}))
		}
	}

	const setReachabilitySettings = async (users: InteropUserRef[], enabled = 'true') => {
		await query({
			tag: 'iq',
			attrs: { type: 'set', xmlns: 'w:interop', to: S_WHATSAPP_NET },
			content: [
				{
					tag: 'reachability_settings',
					attrs: { enabled },
					content: users.map(({ externalId, integratorId }) => ({
						tag: 'user',
						attrs: {
							external_id: externalId,
							integrator_id: integratorId.toString()
						}
					}))
				}
			]
		})
	}

	const updateInteropBlockStatus = async (jid: string, action: 'block' | 'unblock') => {
		await query({
			tag: 'iq',
			attrs: { type: 'set', xmlns: 'w:interop', to: S_WHATSAPP_NET },
			content: [
				{
					tag: 'blocklist',
					attrs: {},
					content: [{ tag: 'item', attrs: { action, jid } }]
				}
			]
		})
	}

	const blockInteropUser = (jid: string) => updateInteropBlockStatus(jid, 'block')
	const unblockInteropUser = (jid: string) => updateInteropBlockStatus(jid, 'unblock')

	const reportInteropSpam = async (jid: string, spamFlow = 'account_info_block') => {
		await query({
			tag: 'iq',
			attrs: { type: 'set', xmlns: 'spam', to: S_WHATSAPP_NET },
			content: [{ tag: 'spam_list', attrs: { jid, spam_flow: spamFlow } }]
		})
	}

	const trustInteropContact = async (jid: string) => {
		const t = Math.floor(Date.now() / 1000).toString()
		await query({
			tag: 'iq',
			attrs: { to: S_WHATSAPP_NET, xmlns: 'privacy', type: 'set' },
			content: [
				{
					tag: 'tokens',
					attrs: {},
					content: [{ tag: 'token', attrs: { jid, type: 'trusted_contact', t } }]
				}
			]
		})
	}

	const initInterop = async () => {
		let integrators: InteropIntegrator[]
		try {
			integrators = await fetchIntegrators()
		} catch (err) {
			logger.warn({ err }, 'interop: failed to fetch integrators')
			return []
		}

		const toOptIn = integrators.filter(i => i.status === 'active' || i.status === 'onboarding')
		if (toOptIn.length === 0) {
			return integrators
		}

		try {
			await acceptInteropTOS()
		} catch (err) {
			logger.warn({ err }, 'interop: failed to accept TOS')
		}

		try {
			await optInIntegrators(toOptIn.map(i => i.id))
		} catch (err) {
			logger.warn({ err }, 'interop: failed to opt-in integrators')
		}

		logger.info({ integrators: toOptIn.map(i => i.name) }, 'interop: initialized')
		return integrators
	}

	return {
		...sock,
		fetchIntegrators,
		acceptInteropTOS,
		optInIntegrators,
		optOutIntegrators,
		resolveInteropUser,
		resolveInteropUsers,
		getReachabilitySettings,
		setReachabilitySettings,
		blockInteropUser,
		unblockInteropUser,
		reportInteropSpam,
		trustInteropContact,
		initInterop
	}
}
