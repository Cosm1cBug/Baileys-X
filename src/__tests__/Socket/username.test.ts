import { jest } from '@jest/globals'
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

const MEX_PATHS: Record<string, string> = {
	'26124072630599518': 'xwa2_username_check',
	'27134626522840286': 'xwa2_username_check_multi',
	'27108705368767936': 'xwa2_username_set',
	'32618050064506055': 'xwa2_username_get',
	'26077456248616957': 'xwa2_username_get_recommendations',
	'25529696019976770': 'xwa2_username_pin_set'
}

const mexPayloads: Record<string, unknown> = {
	xwa2_username_check: { result: 'SUCCESS' },
	xwa2_username_check_multi: {},
	xwa2_username_set: {},
	xwa2_username_get: { username: 'my-name' },
	xwa2_username_get_recommendations: {},
	xwa2_username_pin_set: {}
}

const query = jest.fn(async (node: BinaryNode): Promise<BinaryNode> => {
	const queryNode = (node.content as BinaryNode[])[0]!
	const queryId = queryNode.attrs.query_id!
	const dataPath = MEX_PATHS[queryId]!
	// the SET query id backs both the set and delete data paths
	const data: Record<string, unknown> = { [dataPath]: mexPayloads[dataPath] ?? {} }
	if (queryId === '27108705368767936') {
		data.xwa2_username_delete = mexPayloads.xwa2_username_delete ?? {}
	}

	return {
		tag: 'iq',
		attrs: {},
		content: [
			{
				tag: 'result',
				attrs: {},
				content: Buffer.from(JSON.stringify({ data }))
			}
		]
	}
})

type USyncResult = { list: { id: string; [key: string]: unknown }[]; sideList: unknown[] }

const executeUSyncQuery = jest.fn(async (_query: unknown): Promise<USyncResult> => {
	void _query
	return { list: [], sideList: [] }
})

jest.unstable_mockModule('../../Socket/newsletter', () => ({
	makeNewsletterSocket: () => ({
		query,
		generateMessageTag: () => 'message-tag-1',
		executeUSyncQuery
	})
}))

const { makeUsernameSocket, USERNAME_QUERY_IDS, USERNAME_SOURCE } = await import('../../Socket/username')

const makeSock = () => makeUsernameSocket({ logger } as SocketConfig)

const lastQueryNode = () => query.mock.calls[query.mock.calls.length - 1]![0] as BinaryNode

describe('username socket', () => {
	beforeEach(() => {
		query.mockClear()
		executeUSyncQuery.mockClear()
		mexPayloads.xwa2_username_check = { result: 'SUCCESS' }
		mexPayloads.xwa2_username_get = { username: 'my-name' }
	})

	it('reports an available username from the check query', async () => {
		const sock = makeSock()
		const result = await sock.checkUsername('new-name', false, 'session-1')
		expect(result).toEqual({ available: true, username: 'new-name', session_id: 'session-1' })

		const node = lastQueryNode()
		expect(node.attrs.xmlns).toBe('w:mex')
		const queryNode = (node.content as BinaryNode[])[0]!
		expect(queryNode.attrs.query_id).toBe(USERNAME_QUERY_IDS.CHECK)
		const { variables } = JSON.parse((queryNode.content as Buffer).toString('utf-8'))
		expect(variables).toEqual({
			username: 'new-name',
			include_suggestions: false,
			session_id: 'session-1',
			source: 'USER_INPUT'
		})
		expect(query).toHaveBeenCalledTimes(1)
	})

	it('surfaces suggestions and rejection reasons for taken names', async () => {
		mexPayloads.xwa2_username_check = {
			result: 'INVALID',
			suggestions: ['new-name-2'],
			rejection_reasons: ['TAKEN'],
			suggestions_eligible: true
		}

		const sock = makeSock()
		const result = await sock.checkUsername('new-name', true, 'session-2')
		expect(result).toEqual({
			available: false,
			username: 'new-name',
			session_id: 'session-2',
			suggestions: ['new-name-2'],
			rejectionReasons: ['TAKEN'],
			suggestionsEligible: true
		})
		delete mexPayloads.xwa2_username_check
	})

	it('sets a username with the SET query id and a fresh session', async () => {
		const sock = makeSock()
		await sock.setUsername('new-name', { source: USERNAME_SOURCE.SUGGESTION, pin: '1234' })
		expect(query).toHaveBeenCalledTimes(1)
		expect(USERNAME_QUERY_IDS.SET).toBe('27108705368767936')
	})

	it('deletes the username by setting it to null', async () => {
		const sock = makeSock()
		await sock.deleteUsername()
		expect(query).toHaveBeenCalledTimes(1)
	})

	it('reads the account username', async () => {
		const sock = makeSock()
		await expect(sock.getMyUsername()).resolves.toBe('my-name')
	})

	it('returns null when the account has no username', async () => {
		mexPayloads.xwa2_username_get = {}
		const sock = makeSock()
		await expect(sock.getMyUsername()).resolves.toBeNull()
		delete mexPayloads.xwa2_username_get
	})

	it('resolves a user by username through USync contact lookup', async () => {
		executeUSyncQuery.mockImplementationOnce(async () => ({
			list: [{ id: '5511888888888@s.whatsapp.net', contact: true }],
			sideList: []
		}))

		const sock = makeSock()
		await expect(sock.findUserByUsername('their-name', '4321')).resolves.toEqual({
			jid: '5511888888888@s.whatsapp.net',
			contact: true
		})
		expect(executeUSyncQuery).toHaveBeenCalledTimes(1)
	})

	it('returns null when the username does not resolve', async () => {
		const sock = makeSock()
		await expect(sock.findUserByUsername('nobody')).resolves.toBeNull()
	})

	it('fetches contact usernames through the username protocol', async () => {
		executeUSyncQuery.mockImplementationOnce(async () => ({
			list: [{ id: '5511888888888@s.whatsapp.net', username: 'their-name' }],
			sideList: []
		}))

		const sock = makeSock()
		const list = await sock.fetchContactUsernames('5511888888888@s.whatsapp.net')
		expect(list).toEqual([{ id: '5511888888888@s.whatsapp.net', username: 'their-name' }])
	})
})
