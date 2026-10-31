import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { proto } from '../../../WAProto/index.js'
import type { SignalDataTypeMap, SignalKeyStore } from '../../Types'
import { addTransactionCapability, makeCacheableSignalKeyStore } from '../../Utils/auth-utils'
import logger from '../../Utils/logger'
import { useMultiFileAuthState } from '../../Utils/use-multi-file-auth-state'
import { useSQLiteAuthState } from '../../Utils/use-sqlite-auth-state'

const silent = logger.child({})
silent.level = 'silent'
const data: SignalDataTypeMap = {
	'pre-key': { public: Buffer.from([1, 2]), private: Buffer.from([3, 4]) },
	session: Buffer.from([5, 6]),
	'sender-key': Buffer.from('{"example":"sender-key-bytes"}'),
	'sender-key-memory': { 'a@s.whatsapp.net': true },
	'app-state-sync-key': proto.Message.AppStateSyncKeyData.fromObject({ keyData: Buffer.from([7, 8]) }),
	'app-state-sync-version': { version: 2, hash: Buffer.from([9]), indexValueMap: {} },
	'lid-mapping': '123@lid',
	'device-list': ['1', '2'],
	tctoken: { token: Buffer.from([10, 11]), timestamp: '123' },
	'identity-key': Buffer.from([12, 13])
}
const sqliteAvailable = (() => {
	try {
		createRequire(import.meta.url)('node:sqlite')
		return true
	} catch {
		return false
	}
})()

describe.each(['multifile', ...(sqliteAvailable ? ['sqlite'] : [])])('%s key store conformance', backend => {
	it.each(['bare', 'cache', 'transaction'])('round-trips all key categories with %s', async mode => {
		const dir = await mkdtemp(join(tmpdir(), 'key-conformance-'))
		const sqlite = backend === 'sqlite' ? await useSQLiteAuthState(join(dir, 'auth.db')) : undefined
		try {
			let keys: SignalKeyStore = sqlite ? sqlite.state.keys : (await useMultiFileAuthState(dir)).state.keys
			if (mode === 'cache') keys = makeCacheableSignalKeyStore(keys, silent)
			const transactional =
				mode === 'transaction'
					? addTransactionCapability(keys, silent, { maxCommitRetries: 1, delayBetweenTriesMs: 1 })
					: undefined
			if (transactional) keys = transactional
			const run = async (work: () => Promise<void>) =>
				transactional ? transactional.transaction(work, 'conformance') : work()
			for (const type of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
				await run(async () => {
					await keys.set({ [type]: { id: data[type] } })
				})
				await run(async () => {
					for (let i = 0; i < 2; i++) expect((await keys.get(type, ['id'])).id).toEqual(data[type])
				})
				await run(async () => {
					// Pre-key deletion is valid after reading it in the same transaction.
					await keys.get(type, ['id'])
					await keys.set({ [type]: { id: null } })
				})
				expect([undefined, null]).toContain((await keys.get(type, ['id'])).id)
			}
		} finally {
			sqlite?.close()
			await rm(dir, { recursive: true, force: true })
		}
	})
})
