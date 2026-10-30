import { jest } from '@jest/globals'
import type { SignalDataSet, SignalKeyStore } from '../../Types'
import type { ILogger } from '../../Utils/logger'
import { PreKeyManager } from '../../Utils/pre-key-manager'

const logger = {
	trace: jest.fn(),
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	child: jest.fn()
} as unknown as ILogger

const makeStore = (existing: Record<string, unknown> = {}) =>
	({
		get: jest.fn(async (_type: string, ids: string[]) => {
			void _type
			// yield so concurrent callers would interleave without the queue
			await new Promise<void>(r => setImmediate(r))
			const out: Record<string, unknown> = {}
			for (const id of ids) {
				if (id in existing) {
					out[id] = existing[id]
				}
			}
			return out
		}),
		set: jest.fn(async () => undefined)
	}) as unknown as SignalKeyStore & { get: jest.Mock }

const emptySet = (): SignalDataSet => ({}) as SignalDataSet

describe('PreKeyManager concurrency', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	it('applies many concurrent same-type updates without losing any', async () => {
		const manager = new PreKeyManager(makeStore(), logger)
		const cache = emptySet()
		const mutations = emptySet()

		await Promise.all(
			Array.from({ length: 25 }, (_, i) =>
				manager.processOperations(
					{ 'pre-key': { [`id-${i}`]: { key: i } } } as unknown as SignalDataSet,
					'pre-key',
					cache,
					mutations,
					false
				)
			)
		)

		expect(Object.keys(cache['pre-key']!)).toHaveLength(25)
		expect(Object.keys(mutations['pre-key']!)).toHaveLength(25)
		expect(cache['pre-key']!['id-17']).toEqual({ key: 17 })
	})

	it('serializes update/delete/update sequences for the same key (last op wins)', async () => {
		const store = makeStore({ 'id-1': { key: 'existing' } })
		const manager = new PreKeyManager(store, logger)
		const cache = emptySet()
		const mutations = emptySet()

		await Promise.all([
			manager.processOperations(
				{ 'pre-key': { 'id-1': { key: 'v1' } } } as unknown as SignalDataSet,
				'pre-key',
				cache,
				mutations,
				false
			),
			manager.processOperations(
				{ 'pre-key': { 'id-1': null } } as unknown as SignalDataSet,
				'pre-key',
				cache,
				mutations,
				false
			),
			manager.processOperations(
				{ 'pre-key': { 'id-1': { key: 'v2' } } } as unknown as SignalDataSet,
				'pre-key',
				cache,
				mutations,
				false
			)
		])

		// delete-then-recreate: the final update is the surviving state
		expect(cache['pre-key']!['id-1']).toEqual({ key: 'v2' })
		expect(mutations['pre-key']!['id-1']).toEqual({ key: 'v2' })
	})

	it('skips deletions of non-existent keys outside a transaction (store-validated)', async () => {
		const manager = new PreKeyManager(makeStore({}), logger)
		const cache = emptySet()
		const mutations = emptySet()

		await manager.processOperations(
			{ 'pre-key': { ghost: null } } as unknown as SignalDataSet,
			'pre-key',
			cache,
			mutations,
			false
		)

		expect(cache['pre-key']!['ghost']).toBeUndefined()
		expect(mutations['pre-key']!['ghost']).toBeUndefined()
		expect(logger.warn).toHaveBeenCalled()
	})

	it('in a transaction, deletes only keys present in the cache', async () => {
		const manager = new PreKeyManager(makeStore(), logger)
		const cache = { 'pre-key': { kept: { key: 1 } } } as unknown as SignalDataSet
		const mutations = emptySet()

		await manager.processOperations(
			{ 'pre-key': { kept: null, ghost: null } } as unknown as SignalDataSet,
			'pre-key',
			cache,
			mutations,
			true
		)

		expect(cache['pre-key']!['kept']).toBeNull()
		expect(mutations['pre-key']!['kept']).toBeNull()
		expect(mutations['pre-key']!['ghost']).toBeUndefined()
	})

	it('validateDeletions strips deletion requests for keys the store does not have', async () => {
		const manager = new PreKeyManager(makeStore({ real: { key: 1 } }), logger)
		const data = { 'pre-key': { real: null, ghost: null } } as unknown as SignalDataSet

		await manager.validateDeletions(data, 'pre-key')

		expect(data['pre-key']).toEqual({ real: null })
	})
})
