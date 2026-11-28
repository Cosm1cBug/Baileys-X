import type { RetryBudgetAtomicStore } from './retry-budget'

/** Minimal synchronous SQLite API compatible with better-sqlite3 and node:sqlite. */
export type RetryBudgetSQLiteDatabase = {
	exec(sql: string): unknown
	prepare(sql: string): {
		get(...params: (string | number)[]): unknown
		run(...params: (string | number)[]): unknown
	}
}

/**
 * Create an atomic persistent counter store using an application-owned SQLite connection.
 * Do not close the connection while sockets use it. Counters are intentionally not expired.
 * Configure WAL and a busy timeout on the connection before constructing this adapter.
 */
export function makeSQLiteRetryBudgetStore(db: RetryBudgetSQLiteDatabase): RetryBudgetAtomicStore {
	db.exec(`CREATE TABLE IF NOT EXISTS retry_budget (
		budget_key TEXT PRIMARY KEY,
		attempts INTEGER NOT NULL CHECK (typeof(attempts) = 'integer' AND attempts >= 0)
	);
	CREATE TABLE IF NOT EXISTS retry_budget_meta (
		name TEXT PRIMARY KEY,
		value INTEGER NOT NULL CHECK (typeof(value) = 'integer' AND value >= 0)
	)`)
	const select = db.prepare('SELECT attempts FROM retry_budget WHERE budget_key = ?')
	const insert = db.prepare('INSERT INTO retry_budget (budget_key, attempts) VALUES (?, ?)')
	const update = db.prepare('UPDATE retry_budget SET attempts = ? WHERE budget_key = ?')
	const initDeadline = db.prepare('INSERT OR IGNORE INTO retry_budget_meta (name, value) VALUES (?, ?)')
	const readDeadline = db.prepare('SELECT value FROM retry_budget_meta WHERE name = ?')

	const read = (key: string): number | undefined => {
		const row = select.get(key) as { attempts?: unknown } | undefined
		if (row === undefined) return undefined
		const value = row.attempts
		if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
			throw new Error('Invalid stored retry budget count')
		}

		return value
	}

	return {
		get: read,
		legacyDeadline(windowMs) {
			if (!Number.isSafeInteger(windowMs) || windowMs < 0) throw new Error('Invalid legacy retry migration window')
			const deadline = Date.now() + windowMs
			if (!Number.isSafeInteger(deadline) || deadline < 0) throw new Error('Invalid legacy retry migration deadline')
			initDeadline.run('legacy-deadline', deadline)
			const row = readDeadline.get('legacy-deadline') as { value?: unknown } | undefined
			if (typeof row?.value !== 'number' || !Number.isSafeInteger(row.value) || row.value < 0) {
				throw new Error('Invalid stored legacy retry migration deadline')
			}

			return row.value
		},
		apply(key, limit, initial, consume) {
			db.exec('BEGIN IMMEDIATE')
			try {
				let count = read(key)
				if (count === undefined) {
					count = initial
					insert.run(key, count)
				}

				const accepted = count < limit
				if (consume && accepted) {
					count++
					update.run(count, key)
				}

				db.exec('COMMIT')
				return { accepted, count }
			} catch (error) {
				try {
					db.exec('ROLLBACK')
				} catch {
					// Preserve the original failure; the connection may need to be reopened.
				}

				throw error
			}
		}
	}
}
