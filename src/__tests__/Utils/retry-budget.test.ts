import type { CacheStore } from '../../Types/Socket'
import { RetryBudget, type RetryBudgetIdentity, retryBudgetKey } from '../../Utils/retry-budget'

const identity: RetryBudgetIdentity = {
	chat: 'first@g.us',
	messageId: 'custom:id',
	participant: '111:2@s.whatsapp.net',
	direction: 'incoming'
}

function memoryStore() {
	const values = new Map<string, unknown>()
	const store: CacheStore = {
		get: <T>(key: string) => values.get(key) as T | undefined,
		set: (key, value) => {
			values.set(key, value)
		},
		del: key => {
			values.delete(key)
		},
		flushAll: () => {
			values.clear()
		}
	}
	return { values, store }
}

describe('retry budget v2 core', () => {
	it('encodes every identity dimension without delimiter collisions', () => {
		const keys = [
			identity,
			{ ...identity, chat: 'second@g.us' },
			{ ...identity, messageId: 'different' },
			{ ...identity, participant: '111:3@s.whatsapp.net' },
			{ ...identity, participant: null },
			{ ...identity, participant: 'null' },
			{ ...identity, direction: 'outgoing' as const },
			{ ...identity, chat: 'first@g.us:custom', messageId: 'id' }
		].map(retryBudgetKey)
		expect(new Set(keys).size).toBe(keys.length)
		expect(keys.every(key => key.startsWith('retry:v2:'))).toBe(true)
		expect(retryBudgetKey({ ...identity, participant: undefined })).toBe(
			retryBudgetKey({ ...identity, participant: null })
		)
	})

	it('rejects malformed identity and limits', () => {
		expect(() => retryBudgetKey({ ...identity, chat: '' })).toThrow()
		expect(() => retryBudgetKey({ ...identity, messageId: '' })).toThrow()
		expect(() => retryBudgetKey({ ...identity, participant: '' })).toThrow()
		const { store } = memoryStore()
		for (const limit of [-1, NaN, Infinity, 1.5]) expect(() => new RetryBudget(store, limit)).toThrow()
	})

	it('persists accepted counts and retains an exhausted count across instances', async () => {
		const { store, values } = memoryStore()
		const budget = new RetryBudget(store, 2)
		expect(await budget.consume(identity)).toEqual({ accepted: true, count: 1 })
		expect(await new RetryBudget(store, 2).consume(identity)).toEqual({ accepted: true, count: 2 })
		expect(await budget.consume(identity)).toEqual({ accepted: false, count: 2 })
		expect(await new RetryBudget(store, 2).consume(identity)).toEqual({ accepted: false, count: 2 })
		expect(values.get(retryBudgetKey(identity))).toBe(2)
	})

	it('keeps budgets separate across chats, participants and direction', async () => {
		const { store } = memoryStore()
		const budget = new RetryBudget(store, 1)
		expect((await budget.consume(identity)).accepted).toBe(true)
		expect((await budget.consume(identity)).accepted).toBe(false)
		for (const other of [
			{ ...identity, chat: 'other@g.us' },
			{ ...identity, participant: '222@s.whatsapp.net' },
			{ ...identity, direction: 'outgoing' as const }
		])
			expect((await budget.consume(other)).accepted).toBe(true)
	})

	it('serializes concurrent attempts across budget instances sharing a store', async () => {
		const values = new Map<string, unknown>()
		const store: CacheStore = {
			get: async <T>(key: string) => {
				await Promise.resolve()
				return values.get(key) as T
			},
			set: async (key, value) => {
				await Promise.resolve()
				values.set(key, value)
			},
			del: key => {
				values.delete(key)
			},
			flushAll: () => {
				values.clear()
			}
		}
		const first = new RetryBudget(store, 3)
		const second = new RetryBudget(store, 3)
		const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? first : second).consume(identity)))
		expect(results.filter(result => result.accepted).map(result => result.count)).toEqual([1, 2, 3])
		expect(results.filter(result => !result.accepted)).toHaveLength(17)
		expect(values.get(retryBudgetKey(identity))).toBe(3)
	})

	it.each([NaN, Infinity, -1, 1.5, '2', {}, true])(
		'rejects invalid persisted count %s without resetting it',
		async value => {
			const { store, values } = memoryStore()
			values.set(retryBudgetKey(identity), value)
			await expect(new RetryBudget(store, 5).consume(identity)).rejects.toThrow('Invalid stored')
			expect(values.get(retryBudgetKey(identity))).toEqual(value)
		}
	)

	it('surfaces failed reads and writes instead of accepting an unpersisted attempt', async () => {
		const { store } = memoryStore()
		store.get = async () => {
			throw new Error('read failed')
		}

		await expect(new RetryBudget(store, 5).consume(identity)).rejects.toThrow('read failed')
		store.get = () => 0 as never
		store.set = async () => {
			throw new Error('write failed')
		}

		await expect(new RetryBudget(store, 5).consume(identity)).rejects.toThrow('write failed')
		store.set = () => false
		await expect(new RetryBudget(store, 5).consume(identity)).rejects.toThrow('Failed to persist')
	})
})
