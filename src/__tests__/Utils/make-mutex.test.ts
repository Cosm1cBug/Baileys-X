import { makeKeyedMutex, makeMutex } from '../../Utils/make-mutex'

/** A promise whose resolution is controlled externally — gates tasks open deterministically. */
const deferred = () => {
	let resolve!: () => void
	const promise = new Promise<void>(r => {
		resolve = r
	})
	return { promise, resolve }
}

/** Let queued microtasks/promise continuations settle without wall-clock sleeps. */
const tick = () => new Promise<void>(r => setImmediate(r))

describe('makeMutex', () => {
	it('serializes overlapping tasks', async () => {
		const { mutex } = makeMutex()
		const gate = deferred()
		const order: string[] = []

		const first = mutex(async () => {
			order.push('first:start')
			await gate.promise
			order.push('first:end')
		})
		const second = mutex(async () => {
			order.push('second:start')
			order.push('second:end')
		})

		await tick()
		// second task must not have started while the first holds the lock
		expect(order).toEqual(['first:start'])

		gate.resolve()
		await Promise.all([first, second])
		expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
	})

	it('releases the lock when a task throws', async () => {
		const { mutex } = makeMutex()
		await expect(
			mutex(async () => {
				throw new Error('boom')
			})
		).rejects.toThrow('boom')

		// the lock is free for the next task
		await expect(mutex(async () => 42)).resolves.toBe(42)
	})
})

describe('makeKeyedMutex', () => {
	it('serializes tasks for the same key in submission order', async () => {
		const { mutex } = makeKeyedMutex()
		const gate = deferred()
		const order: string[] = []

		const first = mutex('chat-1', async () => {
			order.push('first:start')
			await gate.promise
			order.push('first:end')
		})
		const second = mutex('chat-1', async () => {
			order.push('second')
		})
		const third = mutex('chat-1', async () => {
			order.push('third')
		})

		await tick()
		expect(order).toEqual(['first:start'])

		gate.resolve()
		await Promise.all([first, second, third])
		expect(order).toEqual(['first:start', 'first:end', 'second', 'third'])
	})

	it('runs tasks for different keys in parallel', async () => {
		const { mutex } = makeKeyedMutex()
		const gate = deferred()
		const order: string[] = []

		const blocked = mutex('chat-1', async () => {
			order.push('chat-1:start')
			await gate.promise
			order.push('chat-1:end')
		})
		const other = mutex('chat-2', async () => {
			order.push('chat-2')
			return 'done'
		})

		await expect(other).resolves.toBe('done')
		expect(order).toEqual(['chat-1:start', 'chat-2'])

		gate.resolve()
		await blocked
		expect(order).toEqual(['chat-1:start', 'chat-2', 'chat-1:end'])
	})

	it('releases the key lock after an exception and stays usable', async () => {
		const { mutex } = makeKeyedMutex()
		await expect(
			mutex('chat-1', async () => {
				throw new Error('boom')
			})
		).rejects.toThrow('boom')

		await expect(mutex('chat-1', async () => 'recovered')).resolves.toBe('recovered')
	})

	it('survives many one-shot keys (entries are cleaned up, later keys unaffected)', async () => {
		const { mutex } = makeKeyedMutex()
		const results = await Promise.all(
			Array.from({ length: 200 }, (_, i) => mutex(`key-${i}`, async () => i * 2))
		)
		expect(results).toEqual(Array.from({ length: 200 }, (_, i) => i * 2))

		// a previously used key still works after its entry was evicted
		await expect(mutex('key-7', async () => 'again')).resolves.toBe('again')
	})

	it('propagates task return values', async () => {
		const { mutex } = makeKeyedMutex()
		await expect(mutex('k', async () => ({ ok: true }))).resolves.toEqual({ ok: true })
	})
})
