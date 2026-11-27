import type { CacheStore } from '../../Types/Socket'
import { RetryBudget, type RetryBudgetIdentity, retryBudgetKey } from '../../Utils/retry-budget'
import {
	makeCachedLegacyRetryBudgetInitializer,
	makeLegacyRetryBudgetInitializer
} from '../../Utils/retry-budget-migration'

const identity: RetryBudgetIdentity = { chat: 'chat@g.us', messageId: 'id', participant: null, direction: 'incoming' }

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
	return { store, values }
}

describe('bounded legacy retry migration', () => {
	it('adopts the greatest ambiguous missing-participant count and persists an exhausted budget', async () => {
		const { store, values } = memoryStore()
		values.set('id:undefined', 2)
		values.set('id:null', 5)
		let now = 999
		const budget = new RetryBudget(
			store,
			5,
			makeLegacyRetryBudgetInitializer(store, 1000, () => now)
		)
		expect(await budget.consume(identity)).toEqual({ accepted: false, count: 5 })
		expect(values.get(retryBudgetKey(identity))).toBe(5)
		expect(values.get('id:null')).toBe(5)
		now = 1000
		expect(
			await new RetryBudget(
				store,
				5,
				makeLegacyRetryBudgetInitializer(store, 1000, () => now)
			).consume(identity)
		).toEqual({ accepted: false, count: 5 })
	})

	it('conservatively applies an ambiguous legacy count to a different chat and direction', async () => {
		const { store, values } = memoryStore()
		values.set('id:peer@s.whatsapp.net', 2)
		const budget = new RetryBudget(
			store,
			5,
			makeLegacyRetryBudgetInitializer(store, 100, () => 10)
		)
		for (const context of [
			{ ...identity, chat: 'one@g.us', participant: 'peer@s.whatsapp.net' },
			{ ...identity, chat: 'two@g.us', participant: 'peer@s.whatsapp.net', direction: 'outgoing' as const }
		])
			expect(await budget.consume(context)).toEqual({ accepted: true, count: 3 })
	})

	it('serializes migration and consumption across concurrent budget instances', async () => {
		const { store, values } = memoryStore()
		values.set('id:undefined', 3)
		const seed = makeLegacyRetryBudgetInitializer(store, 100, () => 10)
		const a = new RetryBudget(store, 5, seed)
		const b = new RetryBudget(store, 5, seed)
		const results = await Promise.all([a.consume(identity), b.consume(identity), a.consume(identity)])
		expect(results).toEqual([
			{ accepted: true, count: 4 },
			{ accepted: true, count: 5 },
			{ accepted: false, count: 5 }
		])
		expect(values.get(retryBudgetKey(identity))).toBe(5)
	})

	it('never overwrites an existing v2 value with a legacy count', async () => {
		const { store, values } = memoryStore()
		values.set('id:undefined', 5)
		values.set(retryBudgetKey(identity), 1)
		const budget = new RetryBudget(
			store,
			5,
			makeLegacyRetryBudgetInitializer(store, 100, () => 10)
		)
		expect(await budget.consume(identity)).toEqual({ accepted: true, count: 2 })
	})

	it('does not read legacy values after the fixed deadline', async () => {
		const { store, values } = memoryStore()
		values.set('id:undefined', 5)
		const budget = new RetryBudget(
			store,
			5,
			makeLegacyRetryBudgetInitializer(store, 100, () => 100)
		)
		expect(await budget.consume(identity)).toEqual({ accepted: true, count: 1 })
	})

	it('does not reset corrupt legacy values or accept when persistence fails', async () => {
		const { store, values } = memoryStore()
		values.set('id:undefined', NaN)
		const budget = new RetryBudget(
			store,
			5,
			makeLegacyRetryBudgetInitializer(store, 100, () => 10)
		)
		await expect(budget.consume(identity)).rejects.toThrow('Invalid legacy')
		expect(values.has(retryBudgetKey(identity))).toBe(false)
		values.set('id:undefined', 5)
		store.set = () => false
		await expect(budget.consume(identity)).rejects.toThrow('Failed to persist')
		expect(values.has(retryBudgetKey(identity))).toBe(false)
	})

	it('persists a fixed migration deadline across new initializer instances', async () => {
		const { store, values } = memoryStore()
		values.set('id:undefined', 4)
		let now = 10
		const first = makeCachedLegacyRetryBudgetInitializer(store, 100, () => now)
		expect(await first(identity)).toBe(4)
		expect(values.get('retry:v2:legacy-deadline')).toBe(110)
		now = 109
		const second = makeCachedLegacyRetryBudgetInitializer(store, 100, () => now)
		expect(await second(identity)).toBe(4)
		now = 110
		expect(await second(identity)).toBeUndefined()
		expect(values.get('retry:v2:legacy-deadline')).toBe(110)
	})

	it('fails closed on corrupt migration deadline and write failures', async () => {
		const { store, values } = memoryStore()
		values.set('retry:v2:legacy-deadline', 'invalid')
		const initialize = makeCachedLegacyRetryBudgetInitializer(store, 100, () => 10)
		await expect(initialize(identity)).rejects.toThrow('Invalid stored legacy retry migration deadline')
		values.delete('retry:v2:legacy-deadline')
		store.set = () => false
		await expect(initialize(identity)).rejects.toThrow('Failed to persist legacy retry migration deadline')
	})

	it('validates the configured absolute deadline', () => {
		const { store } = memoryStore()
		for (const invalid of [-1, NaN, Infinity, 1.5])
			expect(() => makeLegacyRetryBudgetInitializer(store, invalid)).toThrow()
	})
})
