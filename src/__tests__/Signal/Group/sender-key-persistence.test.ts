import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SenderKeyRecord } from '../../../Signal/Group/sender-key-record'
import { makeLibSignalRepository } from '../../../Signal/libsignal'
import { addTransactionCapability, makeCacheableSignalKeyStore } from '../../../Utils/auth-utils'
import { BufferJSON } from '../../../Utils/generics'
import logger from '../../../Utils/logger'
import { useMultiFileAuthState } from '../../../Utils/use-multi-file-auth-state'
import { useSQLiteAuthState } from '../../../Utils/use-sqlite-auth-state'

const hasSqlite = (() => {
	try {
		createRequire(import.meta.url)('node:sqlite')
		return true
	} catch {
		return false
	}
})()
const record = () =>
	new SenderKeyRecord([
		{
			senderKeyId: 1,
			senderChainKey: { iteration: 7, seed: Buffer.from([1, 2, 3, 4]) },
			senderSigningKey: { public: Buffer.from([9]), private: Buffer.from([8]) },
			senderMessageKeys: [{ iteration: 6, seed: Buffer.from([5, 6, 7]) }]
		}
	])
const silent = logger.child({})
silent.level = 'silent'

it('revives legacy numeric arrays as well as new base64 buffers', () => {
	for (const json of [
		JSON.stringify(record().serialize()),
		JSON.stringify(record().serialize(), BufferJSON.replacer)
	]) {
		const state = SenderKeyRecord.deserialize(Buffer.from(json)).getSenderKeyState()!
		expect(Buffer.isBuffer(state.getSenderChainKey().getSeed())).toBe(true)
		expect(state.removeSenderMessageKey(6)?.getSeed()).toEqual(Buffer.from([5, 6, 7]))
	}

	expect(JSON.parse('{"type":"Buffer","data":[999]}', BufferJSON.reviver)).toEqual({ type: 'Buffer', data: [999] })
})

it('the signal repository writes sender keys in the base64 format', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'sender-key-write-'))
	const { state } = await useMultiFileAuthState(dir)
	const keys = addTransactionCapability(state.keys, silent, { maxCommitRetries: 1, delayBetweenTriesMs: 1 })
	const repo = makeLibSignalRepository({ creds: state.creds, keys }, silent)
	try {
		await repo.getSenderKeyDistributionMessage({ group: '120363000000000001@g.us', meId: '12025550101@s.whatsapp.net' })
		const files = await (await import('node:fs/promises')).readdir(dir)
		const file = files.find(name => name.startsWith('sender-key-'))!
		const raw = await (await import('node:fs/promises')).readFile(join(dir, file), 'utf8')
		const inner = JSON.parse(raw, BufferJSON.reviver) as Buffer
		const serialized = JSON.parse(inner.toString())
		expect(typeof serialized[0].senderChainKey.seed.data).toBe('string')
	} finally {
		repo.close?.()
		await rm(dir, { recursive: true, force: true })
	}
})
;(hasSqlite ? it : it.skip)(
	'reads and rewrites an old sender key from an existing SQLite database through the cache',
	async () => {
		const dir = await mkdtemp(join(tmpdir(), 'sender-key-sqlite-'))
		const path = join(dir, 'auth.db')
		try {
			const first = await useSQLiteAuthState(path)
			await first.state.keys.set({ 'sender-key': { old: Buffer.from(JSON.stringify(record().serialize())) } })
			first.close()
			const second = await useSQLiteAuthState(path)
			try {
				const keys = makeCacheableSignalKeyStore(second.state.keys, silent)
				for (let i = 0; i < 2; i++) {
					const bytes = (await keys.get('sender-key', ['old'])).old!
					const restored = SenderKeyRecord.deserialize(bytes)
					expect(restored.getSenderKeyState()!.removeSenderMessageKey(6)?.getSeed()).toEqual(Buffer.from([5, 6, 7]))
					await keys.set({
						'sender-key': { old: Buffer.from(JSON.stringify(record().serialize(), BufferJSON.replacer)) }
					})
				}
			} finally {
				second.close()
			}

			const third = await useSQLiteAuthState(path)
			try {
				const bytes = (await third.state.keys.get('sender-key', ['old'])).old!
				const restored = SenderKeyRecord.deserialize(bytes)
				expect(restored.getSenderKeyState()!.removeSenderMessageKey(6)?.getSeed()).toEqual(Buffer.from([5, 6, 7]))
			} finally {
				third.close()
			}
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	}
)

it('decrypts a buffered out-of-order group message across persisted sender-key writes', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'sender-key-e2e-'))
	const sender = await useMultiFileAuthState(join(dir, 'sender'))
	const receiver = await useMultiFileAuthState(join(dir, 'receiver'))
	const wrap = (store: typeof sender.state.keys) =>
		addTransactionCapability(makeCacheableSignalKeyStore(store, silent), silent, {
			maxCommitRetries: 1,
			delayBetweenTriesMs: 1
		})
	const a = makeLibSignalRepository({ creds: sender.state.creds, keys: wrap(sender.state.keys) }, silent)
	const b = makeLibSignalRepository({ creds: receiver.state.creds, keys: wrap(receiver.state.keys) }, silent)
	const group = '120363000000000001@g.us'
	const authorJid = '12025550101@s.whatsapp.net'
	try {
		const one = await a.encryptGroupMessage({ group, meId: authorJid, data: Buffer.from('first') })
		const two = await a.encryptGroupMessage({ group, meId: authorJid, data: Buffer.from('second') })
		await b.processSenderKeyDistributionMessage({
			item: { groupId: group, axolotlSenderKeyDistributionMessage: one.senderKeyDistributionMessage },
			authorJid
		})
		expect(Buffer.from(await b.decryptGroupMessage({ group, authorJid, msg: two.ciphertext })).toString()).toBe(
			'second'
		)
		expect(Buffer.from(await b.decryptGroupMessage({ group, authorJid, msg: one.ciphertext })).toString()).toBe('first')
	} finally {
		a.close?.()
		b.close?.()
		await rm(dir, { recursive: true, force: true })
	}
})
