import type { CacheStore } from '../Types/Socket'
import type { RetryBudgetIdentity } from './retry-budget'

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
