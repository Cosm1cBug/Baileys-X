import { jest } from '@jest/globals'
import { Boom } from '@hapi/boom'
import type { SocketConfig } from '../../Types'
import type { ILogger } from '../../Utils/logger'
import type { BinaryNode } from '../../WABinary'

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

jest.unstable_mockModule('../../Socket/aigroups', () => ({
	makeAIGroupsSocket: () => ({ query })
}))

const { makeInteropSocket, INTEGRATOR_BIRDYCHAT, INTEGRATOR_HAIKET } = await import('../../Socket/interop')

const makeSock = () => makeInteropSocket({ logger } as SocketConfig)

const lastQueryNode = () => query.mock.calls[query.mock.calls.length - 1]![0] as BinaryNode

const iqResult = (content: BinaryNode['content']): BinaryNode => ({ tag: 'iq', attrs: { type: 'result' }, content })

describe('interop socket', () => {
	beforeEach(() => {
		query.mockClear()
	})

	it('parses the integrator list, honouring the global opt-in flag', async () => {
		query.mockResolvedValueOnce(
			iqResult([
				{
					tag: 'integrator_list',
					attrs: { opted_in: 'true' },
					content: [
						{
							tag: 'integrator',
							attrs: { id: '12', name: 'BirdyChat', status: 'active', identifier_type: 'pn', opted_in: 'false' },
							content: [{ tag: 'features', attrs: { group_messaging: 'true' } }]
						},
						{
							tag: 'integrator',
							attrs: { id: '13', name: 'Haiket', status: 'onboarding', identifier_type: 'email', opted_in: 'true' },
							content: []
						}
					]
				}
			])
		)

		const sock = makeSock()
		const integrators = await sock.fetchIntegrators()
		expect(integrators).toEqual([
			{
				id: 12,
				name: 'BirdyChat',
				status: 'active',
				icon: undefined,
				identifierType: 'pn',
				optedIn: true,
				features: { groupMessaging: true }
			},
			{
				id: 13,
				name: 'Haiket',
				status: 'onboarding',
				icon: undefined,
				identifierType: 'email',
				optedIn: true,
				features: { groupMessaging: false }
			}
		])
	})

	it('returns an empty list when no integrator_list is present', async () => {
		const sock = makeSock()
		await expect(sock.fetchIntegrators()).resolves.toEqual([])
	})

	it('accepts the interop TOS with shown + accepted trackables', async () => {
		const sock = makeSock()
		await sock.acceptInteropTOS()
		expect(query).toHaveBeenCalledTimes(2)

		const first = lastQueryNode()
		expect(first.attrs.xmlns).toBe('tos')
		const shown = query.mock.calls[0]![0] as BinaryNode
		expect((shown.content?.[0] as BinaryNode).attrs).toEqual({ id: '20240306', result: '105' })
		const accepted = query.mock.calls[1]![0] as BinaryNode
		expect((accepted.content?.[0] as BinaryNode).attrs).toEqual({ id: '20240306', result: '160' })
	})

	it('opts into the default integrators', async () => {
		const sock = makeSock()
		await sock.optInIntegrators()
		const node = lastQueryNode()
		expect(node.attrs).toMatchObject({ type: 'set', xmlns: 'w:interop' })
		const optIn = node.content?.[0] as BinaryNode
		expect(optIn.tag).toBe('opt_in_integrators')
		const list = optIn.content?.[0] as BinaryNode
		expect((list.content as BinaryNode[]).map(child => child.attrs.id)).toEqual([
			INTEGRATOR_BIRDYCHAT.toString(),
			INTEGRATOR_HAIKET.toString()
		])
	})

	it('opts out of specific integrators', async () => {
		const sock = makeSock()
		await sock.optOutIntegrators([12])
		const optOut = lastQueryNode().content?.[0] as BinaryNode
		expect(optOut.tag).toBe('opt_out_integrators')
	})

	it('resolves interop users, including per-user errors', async () => {
		query.mockResolvedValueOnce(
			iqResult([
				{
					tag: 'users',
					attrs: {},
					content: [
						{
							tag: 'user',
							attrs: {
								jid: '123@interop',
								external_id: 'ext-1',
								normalized_external_id: 'ext1',
								integrator_id: '12'
							},
							content: []
						},
						{
							tag: 'user',
							attrs: { external_id: 'ext-2', integrator_id: '13' },
							content: [{ tag: 'error', attrs: { code: '404', text: 'not found' }, content: undefined }]
						}
					]
				}
			])
		)

		const sock = makeSock()
		const results = await sock.resolveInteropUsers([
			{ externalId: 'ext-1', integratorId: 12 },
			{ externalId: 'ext-2', integratorId: 13 }
		])
		expect(results[0]).toEqual({
			jid: '123@interop',
			externalId: 'ext-1',
			normalizedExternalId: 'ext1',
			integratorId: 12
		})
		expect(results[1]).toEqual({
			externalId: 'ext-2',
			integratorId: 13,
			error: { code: 404, text: 'not found' }
		})
	})

	it('rejects oversized resolution batches', async () => {
		const sock = makeSock()
		const users = Array.from({ length: 257 }, (_, i) => ({ externalId: `e${i}`, integratorId: 12 }))
		await expect(sock.resolveInteropUsers(users)).rejects.toBeInstanceOf(Boom)
		expect(query).not.toHaveBeenCalled()
	})

	it('resolves a single user', async () => {
		query.mockResolvedValueOnce(
			iqResult([
				{
					tag: 'users',
					attrs: {},
					content: [
						{
							tag: 'user',
							attrs: { jid: '123@interop', external_id: 'ext-1', normalized_external_id: 'ext1', integrator_id: '12' },
							content: []
						}
					]
				}
			])
		)

		const sock = makeSock()
		await expect(sock.resolveInteropUser('ext-1', 12)).resolves.toMatchObject({ jid: '123@interop' })
	})

	it('reports interop spam through the spam namespace', async () => {
		const sock = makeSock()
		await sock.reportInteropSpam('123@interop')
		const node = lastQueryNode()
		expect(node.attrs).toMatchObject({ type: 'set', xmlns: 'spam' })
		expect(node.content?.[0]).toEqual({
			tag: 'spam_list',
			attrs: { jid: '123@interop', spam_flow: 'account_info_block' }
		})
	})

	it('reads and writes reachability settings', async () => {
		query.mockResolvedValueOnce(
			iqResult([
				{
					tag: 'reachability_settings',
					attrs: { enabled: 'true' },
					content: [
						{ tag: 'user', attrs: { external_id: 'ext-1', integrator_id: '12', jid: '123@interop' }, content: [] }
					]
				}
			])
		)

		const sock = makeSock()
		await expect(sock.getReachabilitySettings()).resolves.toEqual({
			enabled: 'true',
			users: [{ externalId: 'ext-1', integratorId: 12, jid: '123@interop' }]
		})

		await sock.setReachabilitySettings([{ externalId: 'ext-1', integratorId: 12 }], 'false')
		const node = lastQueryNode()
		const settings = node.content?.[0] as BinaryNode
		expect(settings.attrs.enabled).toBe('false')
	})

	it('blocks and unblocks interop users', async () => {
		const sock = makeSock()
		await sock.blockInteropUser('123@interop')
		expect((lastQueryNode().content?.[0] as BinaryNode).content?.[0]).toEqual({
			tag: 'item',
			attrs: { action: 'block', jid: '123@interop' }
		})

		await sock.unblockInteropUser('123@interop')
		expect(((lastQueryNode().content?.[0] as BinaryNode).content?.[0] as BinaryNode).attrs.action).toBe('unblock')
	})

	it('trusts an interop contact with a privacy token', async () => {
		const sock = makeSock()
		await sock.trustInteropContact('123@interop')
		const node = lastQueryNode()
		expect(node.attrs.xmlns).toBe('privacy')
		const token = ((node.content?.[0] as BinaryNode).content?.[0] as BinaryNode).attrs
		expect(token.jid).toBe('123@interop')
		expect(token.type).toBe('trusted_contact')
	})

	it('initialises interop: TOS + opt-in for active integrators', async () => {
		query.mockResolvedValueOnce(
			iqResult([
				{
					tag: 'integrator_list',
					attrs: {},
					content: [{ tag: 'integrator', attrs: { id: '12', name: 'BirdyChat', status: 'active' }, content: [] }]
				}
			])
		)

		const sock = makeSock()
		const integrators = await sock.initInterop()
		expect(integrators).toHaveLength(1)
		// fetch + 2 TOS trackables + opt-in
		expect(query).toHaveBeenCalledTimes(4)
		expect(logger.info).toHaveBeenCalled()
	})
})
