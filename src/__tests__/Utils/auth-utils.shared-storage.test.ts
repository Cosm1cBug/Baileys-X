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
})
