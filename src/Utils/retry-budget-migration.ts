import type { CacheStore } from '../Types/Socket'
import { type KeyedMutex, makeKeyedMutex } from './make-mutex'
import type { RetryBudgetIdentity } from './retry-budget'

const MIGRATION_DEADLINE_KEY = 'retry:v2:legacy-deadline'
const migrationLocks = new WeakMap<CacheStore, KeyedMutex>()

/** Persist an absolute deadline rather than extending the window at every socket restart. */
export function makeCachedLegacyRetryBudgetInitializer(
	store: CacheStore,
	windowMs: number,
	now: () => number = Date.now
): (identity: RetryBudgetIdentity) => Promise<number | undefined> {
	if (!Number.isSafeInteger(windowMs) || windowMs < 0) throw new Error('Invalid legacy retry migration window')
	let locks = migrationLocks.get(store)
	if (!locks) {
		locks = makeKeyedMutex()
		migrationLocks.set(store, locks)
	}

	const mutex = locks
	return async identity => {
		const deadline = await mutex.mutex(MIGRATION_DEADLINE_KEY, async () => {
			const stored = await store.get<unknown>(MIGRATION_DEADLINE_KEY)
			if (stored !== undefined && stored !== null) {
				if (typeof stored !== 'number' || !Number.isSafeInteger(stored) || stored < 0) {
					throw new Error('Invalid stored legacy retry migration deadline')
				}

				return stored
			}

			const calculated = now() + windowMs
			if (!Number.isSafeInteger(calculated) || calculated < 0)
				throw new Error('Invalid legacy retry migration deadline')
			if ((await store.set(MIGRATION_DEADLINE_KEY, calculated)) === false) {
				throw new Error('Failed to persist legacy retry migration deadline')
			}

			return calculated
		})
		return makeLegacyRetryBudgetInitializer(store, deadline, now)(identity)
	}
}

/**
 * Builds a bounded legacy reader for use as RetryBudget's missing-value initializer.
 * The caller owns and persists the absolute deadline across restarts: deriving it
 * afresh on each restart would make a temporary migration window unbounded.
 * Legacy keys omit chat and direction; conservatively apply the largest matching
 * count to either direction without deleting the ambiguous legacy value.
 */
export function makeLegacyRetryBudgetInitializer(
	store: CacheStore,
	deadlineMs: number,
	now: () => number = Date.now
): (identity: RetryBudgetIdentity) => Promise<number | undefined> {
	if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 0) throw new Error('Invalid legacy retry migration deadline')

	return async identity => {
		if (now() >= deadlineMs) return undefined
		const participants =
			identity.participant === null || identity.participant === undefined
				? ['undefined', 'null']
				: [identity.participant]
		let highest: number | undefined
		for (const participant of participants) {
			const value = await store.get<unknown>(`${identity.messageId}:${participant}`)
			if (value === null || value === undefined) continue
			if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
				throw new Error('Invalid legacy retry count')
			}

			highest = Math.max(highest ?? 0, value)
		}

		return highest
	}
}
