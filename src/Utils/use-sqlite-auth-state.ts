import { chmodSync } from 'fs'
import { createRequire } from 'node:module'
import { proto } from '../../WAProto/index.js'
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '../Types'
import { initAuthCreds } from './auth-utils'
import { BufferJSON } from './generics'

/**
 * Minimal structural typing for `node:sqlite`. The lockfile's @types/node
 * (20.x) does not declare the module yet; on newer type sets this local
 * shape simply shadows nothing. Only the synchronous API is used.
 */
interface SQLiteStatementSync {
	get: (...params: unknown[]) => unknown
	run: (...params: unknown[]) => unknown
}

interface SQLiteDatabaseSync {
	exec: (sql: string) => void
	prepare: (sql: string) => SQLiteStatementSync
	close: () => void
}

type SQLiteDatabaseSyncCtor = new (path: string) => SQLiteDatabaseSync

const loadDatabaseSync = (): SQLiteDatabaseSyncCtor => {
	try {
		// createRequire: @types/node 20 has no declarations for node:sqlite,
		// and this works identically in built ESM and under jest's loader
		const require = createRequire(import.meta.url)
		const mod = require('node:sqlite') as { DatabaseSync: SQLiteDatabaseSyncCtor }
		return mod.DatabaseSync
	} catch (cause) {
		const error = new Error(
			'useSQLiteAuthState requires the built-in node:sqlite module (Node >= 22.5). ' +
				'On older Node versions use useMultiFileAuthState instead.'
		) as Error & { cause?: unknown }
		error.cause = cause
		throw error
	}
}

const CREDS_KEY = '__creds__'

const SCHEMA = `
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE IF NOT EXISTS creds (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS signal_keys (
	type TEXT NOT NULL,
	id TEXT NOT NULL,
	value TEXT NOT NULL,
	PRIMARY KEY (type, id)
) WITHOUT ROWID;
`

/**
 * Stores the full authentication state in a single SQLite database file,
 * using only the Node.js built-in `node:sqlite` driver (Node >= 22.5) —
 * no native dependencies to compile.
 *
 * Compared to the multi-file store: one file to back up/move, atomic
 * multi-key writes (every `keys.set` runs in a transaction), and WAL mode
 * so a crashed process cannot leave a half-written key set behind. The
 * file holds your credentials and Signal keys — it is chmod'ed 0600 on
 * creation; keep it as secret as the multi-file folder.
 *
 * One database handle per process: `node:sqlite` is synchronous, so calls
 * cannot interleave inside a process; `busy_timeout` covers brief cross-
 * process contention, but running two live sockets on one file is not
 * supported (same rule as the multi-file store).
 */
export const useSQLiteAuthState = async (
	dbPath: string
): Promise<{ state: AuthenticationState; saveCreds: () => void; close: () => void }> => {
	const DatabaseSync = await loadDatabaseSync()
	const db = new DatabaseSync(dbPath)
	db.exec(SCHEMA)

	if (dbPath !== ':memory:') {
		// credentials live in this file; tighten permissions best-effort
		try {
			chmodSync(dbPath, 0o600)
		} catch {}
	}

	const credsGet = db.prepare('SELECT value FROM creds WHERE key = ?')
	const credsSet = db.prepare('INSERT OR REPLACE INTO creds (key, value) VALUES (?, ?)')
	const keyGet = db.prepare('SELECT value FROM signal_keys WHERE type = ? AND id = ?')
	const keySet = db.prepare('INSERT OR REPLACE INTO signal_keys (type, id, value) VALUES (?, ?, ?)')
	const keyDel = db.prepare('DELETE FROM signal_keys WHERE type = ? AND id = ?')
	const keyClear = db.prepare('DELETE FROM signal_keys')
	const begin = db.prepare('BEGIN IMMEDIATE')
	const commit = db.prepare('COMMIT')
	const rollback = db.prepare('ROLLBACK')

	const credsRow = credsGet.get(CREDS_KEY) as { value: string } | undefined
	const creds: AuthenticationCreds = credsRow ? JSON.parse(credsRow.value, BufferJSON.reviver) : initAuthCreds()
	let lastSavedCreds = credsRow?.value

	return {
		state: {
			creds,
			keys: {
				get: (type, ids) => {
					const data: { [id: string]: SignalDataTypeMap[typeof type] } = {}
					for (const id of ids) {
						const row = keyGet.get(type, id) as { value: string } | undefined
						if (!row) {
							continue
						}

						let value = JSON.parse(row.value, BufferJSON.reviver)
						if (type === 'app-state-sync-key') {
							value = proto.Message.AppStateSyncKeyData.fromObject(value)
						}

						data[id] = value
					}

					return data
				},
				set: data => {
					begin.run()
					try {
						for (const category in data) {
							const items = data[category as keyof SignalDataTypeMap]!
							for (const id in items) {
								const value = items[id]
								if (value) {
									keySet.run(category, id, JSON.stringify(value, BufferJSON.replacer))
								} else {
									keyDel.run(category, id)
								}
							}
						}

						commit.run()
					} catch (error) {
						try {
							rollback.run()
						} catch {}

						throw error
					}
				},
				clear: () => {
					keyClear.run()
				}
			}
		},
		saveCreds: () => {
			const json = JSON.stringify(creds, BufferJSON.replacer)
			if (json === lastSavedCreds) {
				return
			}

			credsSet.run(CREDS_KEY, json)
			lastSavedCreds = json
		},
		close: () => {
			db.close()
		}
	}
}
