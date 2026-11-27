import type { CacheStore } from '../Types/Socket'
import { type KeyedMutex, makeKeyedMutex } from './make-mutex'

/** Raw protocol identifiers; callers must use the same representation for a given identity. */
export type RetryBudgetIdentity = {
	chat: string
	messageId: string
	participant?: string | null
	direction: 'incoming' | 'outgoing'
}

export type RetryBudgetResult = { accepted: true; count: number } | { accepted: false; count: number }

/** Unambiguous, versioned encoding; null participant is distinct from every string. */
export function retryBudgetKey(identity: RetryBudgetIdentity): string {
	const { chat, messageId, participant, direction } = identity
	if (
		typeof chat !== 'string' ||
		!chat ||
		typeof messageId !== 'string' ||
		!messageId ||
		(participant !== null && participant !== undefined && (typeof participant !== 'string' || !participant)) ||
		(direction !== 'incoming' && direction !== 'outgoing')
	) {
		throw new Error('Invalid retry budget identity')
	}

	return `retry:v2:${Buffer.from(JSON.stringify([direction, chat, messageId, participant ?? null]), 'utf8').toString('base64url')}`
}

// CacheStore does not provide transactions or compare-and-swap. Share locks across
// instances using the same store object within this process, but never claim
// atomicity across processes or distinct adapters to the same external store.
const locksByStore = new WeakMap<CacheStore, KeyedMutex>()

/**
 * Core v2 counter. The store is authoritative; outcomes do not modify the budget.
 * Cache expiry/durability are determined by the supplied store, not this class.
 * An optional initializer can seed a missing v2 count; migration policy stays outside this class.
 */
export class RetryBudget {
	private readonly locks: KeyedMutex

	constructor(
		private readonly store: CacheStore,
		private readonly limit: number,
		private readonly initializeMissing?: (identity: RetryBudgetIdentity) => Promise<unknown>
	) {
		if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid retry budget limit')
		let locks = locksByStore.get(store)
		if (!locks) {
			locks = makeKeyedMutex()
			locksByStore.set(store, locks)
		}

		this.locks = locks
	}

	private async readCount(key: string, identity: RetryBudgetIdentity): Promise<number> {
		const stored = await this.store.get<unknown>(key)
		const missing = stored === null || stored === undefined
		const initial = missing && this.initializeMissing ? await this.initializeMissing(identity) : undefined
		const count = missing ? (initial ?? 0) : stored
		if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
			throw new Error('Invalid stored retry budget count')
		}

		if (missing && initial !== null && initial !== undefined) {
			const result = await this.store.set(key, count)
			if (result === false) throw new Error('Failed to persist retry budget count')
		}

		return count
	}

	/** Inspect without consuming; a legacy count may be persisted on first read. */
	async peek(identity: RetryBudgetIdentity): Promise<RetryBudgetResult> {
		const key = retryBudgetKey(identity)
		return this.locks.mutex(key, async () => {
			const count = await this.readCount(key, identity)
			return count >= this.limit ? { accepted: false, count } : { accepted: true, count }
		})
	}

	/** Consumes one accepted attempt or reports exhaustion without changing the counter. */
	async consume(identity: RetryBudgetIdentity): Promise<RetryBudgetResult> {
		const key = retryBudgetKey(identity)
		return this.locks.mutex(key, async () => {
			const count = await this.readCount(key, identity)
			if (count >= this.limit) return { accepted: false, count }
			const next = count + 1
			const result = await this.store.set(key, next)
			if (result === false) throw new Error('Failed to persist retry budget count')
			return { accepted: true, count: next }
		})
	}
}
