import type { SignalKeyStore } from '../../Types'
import { makeCacheableSignalKeyStore } from '../../Utils/auth-utils'

it('caches backing-store reads, never uncommitted or unnormalized writes', async () => {
	let value = Buffer.from('old')
	let fail = false
	let reads = 0
	const store: SignalKeyStore = {
		get: async (_type, ids) => {
			reads++
			return Object.fromEntries(ids.map(id => [id, Buffer.from(value)])) as never
		},
		set: async data => {
			if (fail) throw new Error('write failed')
			const incoming = data['sender-key']?.id
			value = Buffer.from(incoming ? Buffer.from(incoming).toString().toUpperCase() : '')
		}
	}
	const cached = makeCacheableSignalKeyStore(store)
	await cached.set({ 'sender-key': { id: Buffer.from('new') } })
	expect((await cached.get('sender-key', ['id'])).id).toEqual(Buffer.from('NEW'))
	expect((await cached.get('sender-key', ['id'])).id).toEqual(Buffer.from('NEW'))
	expect(reads).toBe(1)
	fail = true
	await expect(cached.set({ 'sender-key': { id: Buffer.from('not-written') } })).rejects.toThrow('write failed')
	expect((await cached.get('sender-key', ['id'])).id).toEqual(Buffer.from('NEW'))
	expect(reads).toBe(2)
})

it('serializes clear against a concurrent read so stale keys cannot return after clear', async () => {
	let release!: () => void
	let readStarted!: () => void
	const gate = new Promise<void>(resolve => {
		release = resolve
	})
	const started = new Promise<void>(resolve => {
		readStarted = resolve
	})
	let present = true
	const store: SignalKeyStore = {
		get: async () => {
			readStarted()
			await gate
			return (present ? { id: Buffer.from('old') } : {}) as never
		},
		set: async () => {},
		clear: async () => {
			present = false
		}
	}
	const cached = makeCacheableSignalKeyStore(store)
	const reading = cached.get('sender-key', ['id'])
	await started
	const clearing = cached.clear!()
	release()
	await reading
	await clearing
	expect(await cached.get('sender-key', ['id'])).toEqual({})
})
