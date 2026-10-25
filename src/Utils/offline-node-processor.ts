import type { BinaryNode } from '../WABinary'

export type MessageType = 'message' | 'call' | 'receipt' | 'notification'

export const isOfflineNode = (node: BinaryNode) => node.attrs.offline === '1'

type OfflineNode = {
	type: MessageType
	node: BinaryNode
}

export type OfflineNodeProcessorDeps = {
	isWsOpen: () => boolean
	onUnexpectedError: (error: Error, msg: string) => void
	yieldToEventLoop: () => Promise<void>
	/**
	 * Called on backpressure transitions only: `true` when the queue reaches
	 * the high-water mark, `false` once it has drained to the low-water mark.
	 * The consumer is expected to stop/resume stanza intake (e.g. pause the
	 * WebSocket) so an offline backlog cannot grow memory without bound.
	 * Unacked stanzas are never dropped — the server re-delivers them.
	 */
	onBackpressureChange?: (backpressured: boolean) => void
	/** Queue depth at which backpressure engages. */
	highWaterMark?: number
	/** Queue depth at which backpressure releases. */
	lowWaterMark?: number
}

/** Default queue depth at which offline backpressure engages. */
export const DEFAULT_OFFLINE_QUEUE_HIGH_WATER_MARK = 10_000
/** Default queue depth at which offline backpressure releases. */
export const DEFAULT_OFFLINE_QUEUE_LOW_WATER_MARK = 1_000

/**
 * Creates a processor for offline stanza nodes that:
 * - Queues nodes for sequential processing (nothing is ever dropped)
 * - Yields to the event loop periodically to avoid blocking
 * - Catches handler errors to prevent the processing loop from crashing
 * - Signals backpressure past a high-water mark so intake can be paused
 *   instead of growing the in-memory queue without bound
 */
export function makeOfflineNodeProcessor(
	nodeProcessorMap: Map<MessageType, (node: BinaryNode) => Promise<void>>,
	deps: OfflineNodeProcessorDeps,
	batchSize = 10
) {
	const highWaterMark = deps.highWaterMark ?? DEFAULT_OFFLINE_QUEUE_HIGH_WATER_MARK
	const lowWaterMark = deps.lowWaterMark ?? DEFAULT_OFFLINE_QUEUE_LOW_WATER_MARK

	const nodes: OfflineNode[] = []
	// Index of the next node to process. Advancing an index avoids the O(n)
	// `Array.shift()` re-indexing on every dequeue; the processed prefix is
	// compacted away whenever the drain loop pauses or finishes.
	let head = 0
	let isProcessing = false
	let backpressured = false

	const size = () => nodes.length - head

	const updateBackpressure = () => {
		if (!backpressured && size() >= highWaterMark) {
			backpressured = true
			deps.onBackpressureChange?.(true)
		} else if (backpressured && size() <= lowWaterMark) {
			backpressured = false
			deps.onBackpressureChange?.(false)
		}
	}

	const enqueue = (type: MessageType, node: BinaryNode) => {
		nodes.push({ type, node })
		updateBackpressure()

		if (isProcessing) {
			return
		}

		isProcessing = true

		const promise = async () => {
			let processedInBatch = 0

			while (head < nodes.length && deps.isWsOpen()) {
				const { type, node } = nodes[head++]!

				const nodeProcessor = nodeProcessorMap.get(type)

				if (!nodeProcessor) {
					deps.onUnexpectedError(new Error(`unknown offline node type: ${type}`), 'processing offline node')
					continue
				}

				await nodeProcessor(node).catch(err => deps.onUnexpectedError(err, `processing offline ${type}`))
				processedInBatch++

				// Yield to event loop after processing a batch
				// This prevents blocking the event loop for too long when there are many offline nodes
				if (processedInBatch >= batchSize) {
					processedInBatch = 0
					// Releasing here (not just at drain end) lets intake resume as
					// soon as the backlog falls to the low-water mark
					updateBackpressure()
					await deps.yieldToEventLoop()
				}
			}

			// Drop the processed prefix; anything left stays queued (never lost)
			if (head > 0) {
				nodes.splice(0, head)
				head = 0
			}

			isProcessing = false
			updateBackpressure()
		}

		promise().catch(error => deps.onUnexpectedError(error, 'processing offline nodes'))
	}

	return {
		enqueue,
		/** Number of nodes currently waiting to be processed. */
		size,
		/** Whether backpressure is currently engaged. */
		isBackpressured: () => backpressured
	}
}
