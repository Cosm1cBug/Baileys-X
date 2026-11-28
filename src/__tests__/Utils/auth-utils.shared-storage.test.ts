import { jest } from '@jest/globals'
import * as asyncHooks from 'async_hooks'
import type { SignalKeyStore } from '../../Types'
import type { ILogger } from '../../Utils/logger'

let constructed = 0
class CountingStorage<T> extends asyncHooks.AsyncLocalStorage<T> {
	constructor() {
		super()
		constructed++
	}
}

jest.unstable_mockModule('async_hooks', () => ({ ...asyncHooks, AsyncLocalStorage: CountingStorage }))
const { addTransactionCapability } = await import('../../Utils/auth-utils')

describe('shared transaction storage', () => {
	it('does not allocate an async-local instance for every wrapped store', () => {
		const before = constructed
		const logger = { trace: () => {}, warn: () => {}, error: () => {} } as unknown as ILogger
		const store: SignalKeyStore = { get: async () => ({}), set: async () => {} }
		for (let i = 0; i < 10; i++) {
			addTransactionCapability(store, logger, { maxCommitRetries: 1, delayBetweenTriesMs: 1 })
		}

		expect(constructed).toBe(before)
	})

	it('does not allocate more async-local instances as wrapped stores transact and dispose', async () => {
		const before = constructed
		const logger = { trace: () => {}, warn: () => {}, error: () => {} } as unknown as ILogger
		let commits = 0
		for (let i = 0; i < 100; i++) {
			const store: SignalKeyStore = {
				get: async () => ({}),
				set: async () => {
					commits++
				}
			}
			const wrapped = addTransactionCapability(store, logger, { maxCommitRetries: 1, delayBetweenTriesMs: 1 })
			await wrapped.transaction(async () => {
				await wrapped.set({ 'sender-key-memory': { group: { device: true } } })
			}, 'synthetic')
			wrapped.disposeTransactionStorage()
		}

		expect(commits).toBe(100)
		expect(constructed).toBe(before)
	})
})
