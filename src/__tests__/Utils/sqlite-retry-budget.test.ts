import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { CacheStore } from '../../Types/Socket'
import { RetryBudget, retryBudgetKey } from '../../Utils/retry-budget'
import { makeLegacyRetryBudgetInitializer } from '../../Utils/retry-budget-migration'
import { makeSQLiteRetryBudgetStore, type RetryBudgetSQLiteDatabase } from '../../Utils/sqlite-retry-budget'

type Database = RetryBudgetSQLiteDatabase & { close(): void }
const DatabaseSync = (() => {
	try {
		return (createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => Database })
			.DatabaseSync
	} catch {
		return undefined
	}
})()
const describeSQLite = DatabaseSync ? describe : describe.skip
const identity = { chat: 'chat@g.us', messageId: 'id', participant: 'peer', direction: 'outgoing' as const }

function cache(values = new Map<string, unknown>()): CacheStore {
	return {
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
}

describeSQLite('SQLite retry budgets', () => {
	let dir: string
	let first: Database
	let second: Database
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'retry-budget-'))
		first = new DatabaseSync!(join(dir, 'retry.db'))
		second = new DatabaseSync!(join(dir, 'retry.db'))
		first.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000')
		second.exec('PRAGMA busy_timeout=5000')
	})
	afterEach(() => {
		first.close()
		second.close()
		rmSync(dir, { recursive: true, force: true })
	})

	it('retains exhaustion across independent connections and cache replacements', async () => {
		const a = new RetryBudget(cache(), 2, undefined, makeSQLiteRetryBudgetStore(first))
		const b = new RetryBudget(cache(), 2, undefined, makeSQLiteRetryBudgetStore(second))
		const results = await Promise.all([
			a.consume(identity),
			b.consume(identity),
			a.consume(identity),
			b.consume(identity)
		])
		expect(results.filter(result => result.accepted)).toHaveLength(2)
		expect(await new RetryBudget(cache(), 2, undefined, makeSQLiteRetryBudgetStore(second)).consume(identity)).toEqual({
			accepted: false,
			count: 2
		})
	})

	it('enforces one limit across separate worker processes', async () => {
		const worker = join(process.cwd(), 'test/fixtures/sqlite-budget-worker.mjs')
		const execute = promisify(execFile)
		const results = await Promise.all(
			Array.from({ length: 4 }, () => execute(process.execPath, ['--import', 'tsx', worker, join(dir, 'retry.db')]))
		)
		expect(results.map(result => Number(result.stdout.trim())).reduce((total, n) => total + n, 0)).toBe(20)
	}, 30000)

	it('imports an existing v2 count and conservatively migrates a legacy count', async () => {
		const values = new Map<string, unknown>([
			[retryBudgetKey(identity), 2],
			['other:peer', 2]
		])
		const old = cache(values)
		const budget = new RetryBudget(
			old,
			2,
			makeLegacyRetryBudgetInitializer(old, 100, () => 1),
			makeSQLiteRetryBudgetStore(first)
		)
		expect(await budget.consume(identity)).toEqual({ accepted: false, count: 2 })
		expect(await budget.consume({ ...identity, messageId: 'other' })).toEqual({ accepted: false, count: 2 })
		values.clear()
		expect(await new RetryBudget(cache(), 2, undefined, makeSQLiteRetryBudgetStore(second)).consume(identity)).toEqual({
			accepted: false,
			count: 2
		})
	})

	it('stores one migration deadline across independent connections', () => {
		const a = makeSQLiteRetryBudgetStore(first)
		const b = makeSQLiteRetryBudgetStore(second)
		const deadline = a.legacyDeadline!(1000)
		expect(typeof deadline).toBe('number')
		expect(b.legacyDeadline!(100000)).toBe(deadline)
	})

	it('does not fall back to cache if the database fails', async () => {
		const store = makeSQLiteRetryBudgetStore(first)
		first.exec('DROP TABLE retry_budget')
		const budget = new RetryBudget(cache(), 2, undefined, store)
		await expect(budget.consume(identity)).rejects.toThrow()
	})
})
