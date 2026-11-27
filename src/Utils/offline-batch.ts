import type { BinaryNode } from '../WABinary'
import { isOfflineNode } from './offline-node-processor'

const BATCH_SIZE = 100
const RETRY_INTERVAL_MS = 10_000

/** Request offline batches until the server's offline completion stanza arrives. */
export function makeOfflineBatchRequester(deps: {
	sendBatch: () => Promise<void>
	isPaused: () => boolean
	onError: (error: Error) => void
}) {
	let active = false
	let stopped = false
	let inFlight = false
	let received = 0
	let timer: ReturnType<typeof setTimeout> | undefined

	const schedule = () => {
		if (timer) clearTimeout(timer)
		if (!active || stopped) return
		timer = setTimeout(() => {
			timer = undefined
			if (inFlight || deps.isPaused()) {
				schedule()
			} else {
				void request()
			}
		}, RETRY_INTERVAL_MS)
		timer.unref()
	}

	const request = async () => {
		if (!active || stopped || inFlight || deps.isPaused()) return
		schedule()
		inFlight = true
		received = 0
		let sent = false
		try {
			await deps.sendBatch()
			sent = true
		} catch (error) {
			deps.onError(error instanceof Error ? error : new Error(String(error)))
		} finally {
			inFlight = false
		}

		// Frames can arrive while sendBatch is awaiting its write callback.
		// Do not recurse on failure; the timer provides a bounded retry instead.
		if (sent && active && !stopped && received >= BATCH_SIZE && !deps.isPaused()) {
			void request()
		}
	}

	return {
		start() {
			if (active || stopped) return
			active = true
			schedule()
			void request()
		},
		observe(frame: BinaryNode | Uint8Array) {
			if (!active || stopped || frame instanceof Uint8Array || !isOfflineNode(frame)) return
			received++
			if (received >= BATCH_SIZE) void request()
		},
		stop() {
			stopped = true
			active = false
			if (timer) clearTimeout(timer)
			timer = undefined
		}
	}
}
