import { Boom } from '@hapi/boom'
// wrapped - single line exceeds prettier's 120-char printWidth
import type {
	AuthenticationCreds,
	Contact,
	SignalDataSet,
	SignalKeyStore,
	SignalKeyStoreWithTransaction
} from '../../Types'
import {
	addTransactionCapability,
	assertMeId,
	ClosedTransactionContextError,
	CrossStoreTransactionConflictError,
	initAuthCreds
} from '../../Utils/auth-utils'
import type { ILogger } from '../../Utils/logger'

const credsWithMe = (me?: Partial<Contact>): AuthenticationCreds => ({
	...initAuthCreds(),
	me: me as Contact | undefined
})

const makeTestLogger = (): ILogger =>
	({
		level: 'silent',
		child: () => makeTestLogger(),
		trace: () => {},
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		fatal: () => {}
	}) as unknown as ILogger

const makeInMemoryStore = (): SignalKeyStore => {
	const db: { [type: string]: { [id: string]: unknown } } = {}
	return {
		get: async (type, ids) => {
			const table = db[type] || {}
			const result: { [id: string]: unknown } = {}
			for (const id of ids) {
				if (table[id] !== undefined) {
					result[id] = table[id]
				}
			}

			return result as never
		},
		set: async (data: SignalDataSet) => {
			for (const type of Object.keys(data)) {
				const entries = data[type as keyof SignalDataSet] as { [id: string]: unknown }
				const table = (db[type] = db[type] || {})
				for (const id of Object.keys(entries)) {
					if (entries[id] === null) {
						delete table[id]
					} else {
						table[id] = entries[id]
					}
				}
			}
		}
	}
}

const deferred = <T = void>() => {
	let resolve!: (value: T) => void
	const promise = new Promise<T>(r => (resolve = r))
	return { promise, resolve }
}

const flushMicrotasks = async (times = 50) => {
	for (let i = 0; i < times; i++) {
		await Promise.resolve()
	}
}

describe('assertMeId', () => {
	it('returns me.id when authenticated', () => {
		const creds = credsWithMe({ id: '5511999999999@s.whatsapp.net' })
		expect(assertMeId(creds)).toBe('5511999999999@s.whatsapp.net')
	})

	it('throws Boom 401 when creds.me is undefined', () => {
		const creds = credsWithMe(undefined)
		try {
			assertMeId(creds)
			throw new Error('expected throw')
		} catch (err) {
			expect(err).toBeInstanceOf(Boom)
			expect((err as Boom).output.statusCode).toBe(401)
			expect((err as Error).message).toMatch(/not authenticated/)
		}
	})

	it('throws Boom 401 when me has no id', () => {
		const creds = credsWithMe({})
		expect(() => assertMeId(creds)).toThrow(/not authenticated/)
	})

	it('throws Boom 401 when me.id is empty string', () => {
		const creds = credsWithMe({ id: '' })
		expect(() => assertMeId(creds)).toThrow(/not authenticated/)
	})
})

const runInterleavingScenario = async (
	raw: SignalKeyStore,
	stateA: SignalKeyStoreWithTransaction,
	stateB: SignalKeyStoreWithTransaction
) => {
	const aHasRead = deferred()
	const aMayWrite = deferred()
	let bSettled = false

	const txA = stateA.transaction(async () => {
		const existing = await stateA.get('sender-key-memory', ['group1'])
		aHasRead.resolve()
		await aMayWrite.promise
		await stateA.set({ 'sender-key-memory': { group1: { ...existing.group1, deviceB: true } } })
	}, 'relayMessage-meId')

	await aHasRead.promise

	const txB = stateB
		.transaction(async () => {
			const existing = await stateB.get('sender-key-memory', ['group1'])
			await stateB.set({ 'sender-key-memory': { group1: { ...existing.group1, deviceC: true } } })
		}, 'migrate-1-sessions-lidUser')
		.then(() => {
			bSettled = true
		})

	await flushMicrotasks()
	expect(bSettled).toBe(false)

	aMayWrite.resolve()
	await Promise.all([txA, txB])

	return raw.get('sender-key-memory', ['group1'])
}

describe('addTransactionCapability', () => {
	it('serializes transactions that use different keys against the same store', async () => {
		const raw = makeInMemoryStore()
		await raw.set({ 'sender-key-memory': { group1: { deviceA: true } } })

		const state = addTransactionCapability(raw, makeTestLogger(), { maxCommitRetries: 1, delayBetweenTriesMs: 5 })

		const final = await runInterleavingScenario(raw, state, state)
		expect(final.group1).toEqual({ deviceA: true, deviceB: true, deviceC: true })
	})

	it('shares the transaction context across nested wrappers over the same store', async () => {
		const raw = makeInMemoryStore()
		const opts = { maxCommitRetries: 1, delayBetweenTriesMs: 5 }
		const a = addTransactionCapability(raw, makeTestLogger(), opts)
		const b = addTransactionCapability(raw, makeTestLogger(), opts)

		await a.transaction(async () => {
			await a.set({ 'sender-key-memory': { a: { first: true } } })
			expect(b.isInTransaction()).toBe(true)
			await b.transaction(async () => {
				expect(await b.get('sender-key-memory', ['a'])).toEqual({ a: { first: true } })
				await b.set({ 'sender-key-memory': { b: { second: true } } })
			}, 'inner')
			expect(await raw.get('sender-key-memory', ['a', 'b'])).toEqual({})
			expect(await a.get('sender-key-memory', ['b'])).toEqual({ b: { second: true } })
		}, 'outer')

		expect(await raw.get('sender-key-memory', ['a', 'b'])).toEqual({ a: { first: true }, b: { second: true } })
	})

	it('rolls back writes from both wrappers when a nested shared transaction fails', async () => {
		const raw = makeInMemoryStore()
		const opts = { maxCommitRetries: 1, delayBetweenTriesMs: 5 }
		const a = addTransactionCapability(raw, makeTestLogger(), opts)
		const b = addTransactionCapability(raw, makeTestLogger(), opts)

		await expect(
			a.transaction(async () => {
				await a.set({ 'sender-key-memory': { a: { first: true } } })
				await b.transaction(async () => {
					await b.set({ 'sender-key-memory': { b: { second: true } } })
					throw new Error('nested failure')
				}, 'inner')
			}, 'outer')
		).rejects.toThrow('nested failure')
		expect(await raw.get('sender-key-memory', ['a', 'b'])).toEqual({})
	})

	it('rolls back a completed nested wrapper when the outer transaction fails', async () => {
		const raw = makeInMemoryStore()
		const opts = { maxCommitRetries: 1, delayBetweenTriesMs: 5 }
		const a = addTransactionCapability(raw, makeTestLogger(), opts)
		const b = addTransactionCapability(raw, makeTestLogger(), opts)

		await expect(
			a.transaction(async () => {
				await a.set({ 'sender-key-memory': { a: { first: true } } })
				await b.transaction(async () => {
					await b.set({ 'sender-key-memory': { b: { second: true } } })
				}, 'inner')
				throw new Error('outer failure')
			}, 'outer')
		).rejects.toThrow('outer failure')
		expect(await raw.get('sender-key-memory', ['a', 'b'])).toEqual({})
	})

	it('serializes transactions from two separate wrappers over the same store', async () => {
		const raw = makeInMemoryStore()
		await raw.set({ 'sender-key-memory': { group1: { deviceA: true } } })

		const logger = makeTestLogger()
		const opts = { maxCommitRetries: 1, delayBetweenTriesMs: 5 }
		const stateA = addTransactionCapability(raw, logger, opts)
		const stateB = addTransactionCapability(raw, logger, opts)

		const final = await runInterleavingScenario(raw, stateA, stateB)
		expect(final.group1).toEqual({ deviceA: true, deviceB: true, deviceC: true })
	})
})

describe('closed transaction contexts', () => {
	it('rejects detached reads, writes, and nested transactions after commit', async () => {
		const raw = makeInMemoryStore()
		const opts = { maxCommitRetries: 1, delayBetweenTriesMs: 5 }
		const a = addTransactionCapability(raw, makeTestLogger(), opts)
		const b = addTransactionCapability(raw, makeTestLogger(), opts)
		const trigger = deferred()
		let detached!: Promise<PromiseSettledResult<unknown>[]>
		await a.transaction(async () => {
			await a.set({ 'sender-key-memory': { saved: { ok: true } } })
			detached = (async () => {
				await trigger.promise
				return Promise.allSettled([
					b.set({ 'sender-key-memory': { lost: { wrong: true } } }),
					b.get('sender-key-memory', ['saved']),
					b.transaction(async () => {}, 'nested')
				])
			})()
		}, 'outer')
		trigger.resolve()
		const results = await detached
		for (const result of results) {
			expect(result.status).toBe('rejected')
			if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(ClosedTransactionContextError)
		}

		expect(await raw.get('sender-key-memory', ['saved', 'lost'])).toEqual({ saved: { ok: true } })
	})

	it('rejects detached writes during the asynchronous commit', async () => {
		const raw = makeInMemoryStore()
		const originalSet = raw.set.bind(raw)
		const commitStarted = deferred()
		const finishCommit = deferred()
		raw.set = async data => {
			commitStarted.resolve()
			await finishCommit.promise
			await originalSet(data)
		}

		const state = addTransactionCapability(raw, makeTestLogger(), { maxCommitRetries: 1, delayBetweenTriesMs: 1 })
		const trigger = deferred()
		let detached!: Promise<PromiseSettledResult<void>[]>
		const outer = state.transaction(async () => {
			await state.set({ 'sender-key-memory': { saved: { ok: true } } })
			detached = (async () => {
				await trigger.promise
				return Promise.allSettled([state.set({ 'sender-key-memory': { lost: { wrong: true } } })])
			})()
		}, 'outer')
		await commitStarted.promise
		try {
			trigger.resolve()
			const [result] = await detached
			expect(result?.status).toBe('rejected')
			if (result?.status === 'rejected') expect(result.reason).toBeInstanceOf(ClosedTransactionContextError)
		} finally {
			finishCommit.resolve()
			await outer
		}

		expect(await raw.get('sender-key-memory', ['saved', 'lost'])).toEqual({ saved: { ok: true } })
	})
})

describe('transaction context isolation between stores', () => {
	it('fails explicitly rather than deadlocking when stores are nested in opposing order', async () => {
		const opts = { maxCommitRetries: 1, delayBetweenTriesMs: 5 }
		const a = addTransactionCapability(makeInMemoryStore(), makeTestLogger(), opts)
		const b = addTransactionCapability(makeInMemoryStore(), makeTestLogger(), opts)
		const aStarted = deferred()
		const bStarted = deferred()
		const left = a.transaction(async () => {
			aStarted.resolve()
			await bStarted.promise
			await b.transaction(async () => {}, 'inner-b')
		}, 'outer-a')
		const right = b.transaction(async () => {
			bStarted.resolve()
			await aStarted.promise
			await a.transaction(async () => {}, 'inner-a')
		}, 'outer-b')
		const results = await Promise.allSettled([left, right])
		const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
		expect(rejected.length).toBeGreaterThanOrEqual(1)
		for (const result of rejected) expect(result.reason).toBeInstanceOf(CrossStoreTransactionConflictError)
	})

	it('rolls back the outer store if a different busy store cannot be entered', async () => {
		const rawA = makeInMemoryStore()
		const rawB = makeInMemoryStore()
		const opts = { maxCommitRetries: 1, delayBetweenTriesMs: 5 }
		const a = addTransactionCapability(rawA, makeTestLogger(), opts)
		const b = addTransactionCapability(rawB, makeTestLogger(), opts)
		const started = deferred()
		const release = deferred()
		const busy = b.transaction(async () => {
			started.resolve()
			await release.promise
		}, 'busy')
		await started.promise
		try {
			await expect(
				a.transaction(async () => {
					await a.set({ 'sender-key-memory': { a: { changed: true } } })
					await b.transaction(async () => {
						throw new Error('must not run')
					}, 'nested')
				}, 'outer')
			).rejects.toBeInstanceOf(CrossStoreTransactionConflictError)
			expect(await rawA.get('sender-key-memory', ['a'])).toEqual({})
		} finally {
			release.resolve()
			await busy
		}
	})

	it('lets detached work with an expired context wait like an independent transaction', async () => {
		const opts = { maxCommitRetries: 1, delayBetweenTriesMs: 5 }
		const a = addTransactionCapability(makeInMemoryStore(), makeTestLogger(), opts)
		const b = addTransactionCapability(makeInMemoryStore(), makeTestLogger(), opts)
		const trigger = deferred()
		let detached!: Promise<string>
		await a.transaction(async () => {
			detached = (async () => {
				await trigger.promise
				return b.transaction(async () => 'completed', 'detached')
			})()
		}, 'a')
		const started = deferred()
		const release = deferred()
		const busy = b.transaction(async () => {
			started.resolve()
			await release.promise
		}, 'busy')
		await started.promise
		trigger.resolve()
		await flushMicrotasks()
		release.resolve()
		await busy
		expect(await detached).toBe('completed')
	})

	it('preserves each store context through nested transactions and disposal', async () => {
		const rawA = makeInMemoryStore()
		const rawB = makeInMemoryStore()
		const opts = { maxCommitRetries: 1, delayBetweenTriesMs: 5 }
		const a = addTransactionCapability(rawA, makeTestLogger(), opts)
		const b = addTransactionCapability(rawB, makeTestLogger(), opts)

		await a.transaction(async () => {
			await a.set({ 'sender-key-memory': { a: { first: true } } })
			expect(b.isInTransaction()).toBe(false)
			await b.transaction(async () => {
				expect(a.isInTransaction()).toBe(true)
				expect(b.isInTransaction()).toBe(true)
				b.disposeTransactionStorage()
				expect(a.isInTransaction()).toBe(true)
				expect(b.isInTransaction()).toBe(true)
				await a.set({ 'sender-key-memory': { a: { second: true } } })
				await b.set({ 'sender-key-memory': { b: { only: true } } })
			}, 'b')
			expect(b.isInTransaction()).toBe(false)
			expect(await rawA.get('sender-key-memory', ['a'])).toEqual({})
		}, 'a')

		expect(await rawA.get('sender-key-memory', ['a', 'b'])).toEqual({ a: { second: true } })
		expect(await rawB.get('sender-key-memory', ['a', 'b'])).toEqual({ b: { only: true } })
	})

	it('does not commit another store’s writes when an outer transaction rolls back', async () => {
		const rawA = makeInMemoryStore()
		const rawB = makeInMemoryStore()
		const opts = { maxCommitRetries: 1, delayBetweenTriesMs: 5 }
		const a = addTransactionCapability(rawA, makeTestLogger(), opts)
		const b = addTransactionCapability(rawB, makeTestLogger(), opts)

		await expect(
			a.transaction(async () => {
				await a.set({ 'sender-key-memory': { a: { value: true } } })
				await b.transaction(async () => {
					await b.set({ 'sender-key-memory': { b: { value: true } } })
				}, 'b')
				throw new Error('rollback')
			}, 'a')
		).rejects.toThrow('rollback')
		expect(await rawA.get('sender-key-memory', ['a', 'b'])).toEqual({})
		expect(await rawB.get('sender-key-memory', ['a', 'b'])).toEqual({ b: { value: true } })
	})
})
