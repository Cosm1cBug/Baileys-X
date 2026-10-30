import { promises as fs } from 'fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'os'
import { join } from 'path'
import { useSQLiteAuthState } from '../../Utils/use-sqlite-auth-state'

// node:sqlite exists on Node >= 22.5; on older runtimes (incl. the Node 20
// CI leg) the whole suite skips and useSQLiteAuthState throws a clear error
const sqliteAvailable = (() => {
	try {
		createRequire(import.meta.url)('node:sqlite')
		return true
	} catch {
		return false
	}
})()

const describeSqlite = sqliteAvailable ? describe : describe.skip

describeSqlite('useSQLiteAuthState', () => {
	it('round-trips creds and keys, persisting across reopen', async () => {
		const dir = await fs.mkdtemp(join(tmpdir(), 'baileys-sqlite-auth-'))
		const dbPath = join(dir, 'auth.db')
		try {
			const first = await useSQLiteAuthState(dbPath)
			first.state.creds.me = { id: '1234567890@s.whatsapp.net' }
			first.saveCreds()
			await first.state.keys.set({
				session: { '123.1': { registrationId: 42 } },
				'pre-key': { '7': { keyId: 7 } }
			} as never)
			first.close()

			const second = await useSQLiteAuthState(dbPath)
			expect(second.state.creds.me?.id).toBe('1234567890@s.whatsapp.net')
			const sessions = await second.state.keys.get('session', ['123.1'])
			expect(sessions['123.1']).toEqual({ registrationId: 42 })
			const preKeys = await second.state.keys.get('pre-key', ['7'])
			expect(preKeys['7']).toEqual({ keyId: 7 })
			second.close()
		} finally {
			await fs.rm(dir, { recursive: true, force: true })
		}
	})

	it('returns only existing keys and deletes nulled keys', async () => {
		const { state, close } = await useSQLiteAuthState(':memory:')
		try {
			await state.keys.set({ session: { a: { v: 1 }, b: { v: 2 } } } as never)
			expect(await state.keys.get('session', ['a', 'b', 'missing'])).toEqual({
				a: { v: 1 },
				b: { v: 2 }
			})

			await state.keys.set({ session: { a: null } } as never)
			expect(await state.keys.get('session', ['a', 'b'])).toEqual({ b: { v: 2 } })
		} finally {
			close()
		}
	})

	it('preserves Buffer values through BufferJSON encoding', async () => {
		const { state, close } = await useSQLiteAuthState(':memory:')
		try {
			const keyPair = { public: Buffer.from('pub'), private: Buffer.from('priv') }
			await state.keys.set({ session: { '1': keyPair } } as never)
			const got = (await state.keys.get('session', ['1']))['1'] as unknown as {
				public: Buffer
				private: Buffer
			}
			expect(Buffer.isBuffer(got.public)).toBe(true)
			expect(got.public).toEqual(Buffer.from('pub'))
			expect(got.private).toEqual(Buffer.from('priv'))
		} finally {
			close()
		}
	})

	it('rolls back a failed multi-key write (no partial state)', async () => {
		const { state, close } = await useSQLiteAuthState(':memory:')
		try {
			await state.keys.set({ session: { keep: { v: 1 } } } as never)

			// a value whose serialization explodes mid-transaction
			const circular: Record<string, unknown> = {}
			circular.self = circular
			expect(() => state.keys.set({ session: { fresh: { v: 2 }, boom: circular } } as never)).toThrow(
				/circular/i
			)

			// neither key from the failed batch landed; prior state intact
			expect(await state.keys.get('session', ['keep', 'fresh'])).toEqual({ keep: { v: 1 } })
		} finally {
			close()
		}
	})

	it('clear() empties the key store but keeps creds', async () => {
		const { state, saveCreds, close } = await useSQLiteAuthState(':memory:')
		try {
			state.creds.me = { id: '999@s.whatsapp.net' }
			saveCreds()
			await state.keys.set({ session: { a: { v: 1 } } } as never)
			await state.keys.clear!()
			expect(await state.keys.get('session', ['a'])).toEqual({})
			expect(state.creds.me?.id).toBe('999@s.whatsapp.net')
		} finally {
			close()
		}
	})

	it('saveCreds is idempotent when nothing changed', async () => {
		const { state, saveCreds, close } = await useSQLiteAuthState(':memory:')
		try {
			state.creds.me = { id: '111@s.whatsapp.net' }
			saveCreds()
			const savedAt = JSON.stringify(state.creds)
			saveCreds()
			saveCreds()
			expect(JSON.stringify(state.creds)).toBe(savedAt)
		} finally {
			close()
		}
	})
})
