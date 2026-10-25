/**
 * Memory/throughput benchmark for the offline stanza pipeline (S1) and
 * library load cost. Not part of the test suite — run manually:
 *
 *   npm run build
 *   node --expose-gc scripts/bench-memory.mjs [backlogSize]
 *
 * Measures:
 *  1. RSS after importing the built library
 *  2. RSS of a retained offline backlog (connection closed, nothing dropped)
 *  3. Backpressure transitions while the backlog grows past the high-water mark
 *  4. Time to drain the backlog once the connection opens (FIFO, no loss)
 */
import { performance } from 'node:perf_hooks'

const BACKLOG = Number(process.argv[2] ?? 50_000)

const mb = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const rss = label => {
	globalThis.gc?.()
	const m = process.memoryUsage()
	console.log(`${label.padEnd(44)} RSS ${mb(m.rss).padStart(9)}  heapUsed ${mb(m.heapUsed).padStart(9)}`)
}

rss('baseline (nothing imported)')

const { makeOfflineNodeProcessor } = await import('../lib/Utils/offline-node-processor.js')
const { processHistoryMessageBatched } = await import('../lib/Utils/history.js')
const { proto } = await import('../WAProto/index.js')
rss('after importing library modules')

const makeNode = i => ({ tag: 'message', attrs: { id: `BENCH-${i}`, offline: '1' }, content: undefined })

// --- Backlog retention + backpressure -------------------------------------
let wsOpen = false
const transitions = []
let processed = 0
const processor = makeOfflineNodeProcessor(
	new Map([
		[
			'message',
			async () => {
				processed++
			}
		]
	]),
	{
		isWsOpen: () => wsOpen,
		onUnexpectedError: err => console.error('unexpected error', err),
		yieldToEventLoop: () => new Promise(r => setImmediate(r)),
		onBackpressureChange: paused => transitions.push(paused)
	},
	1000
)

for (let i = 0; i < BACKLOG; i++) {
	processor.enqueue('message', makeNode(i))
}

rss(`backlog of ${BACKLOG} unacked stanzas retained`)
console.log(
	`${'backpressure transitions while enqueueing'.padEnd(44)} ${JSON.stringify(transitions)} (queue size: ${processor.size()})`
)

// --- Drain -----------------------------------------------------------------
wsOpen = true
const drainStart = performance.now()
// the enqueue that re-opens processing; queued nodes drain behind it
processor.enqueue('message', makeNode(BACKLOG))
const deadline = Date.now() + 120_000
while (processed < BACKLOG + 1) {
	if (Date.now() > deadline) {
		console.error(`FAIL: drain stalled at ${processed}/${BACKLOG + 1} processed nodes`)
		process.exit(1)
	}

	await new Promise(r => setImmediate(r))
}

const drainMs = performance.now() - drainStart
rss('after draining backlog')
console.log(
	`${'drained (incl. 1 live node)'.padEnd(44)} ${processed} nodes in ${drainMs.toFixed(0)} ms ` +
		`(${(processed / (drainMs / 1000)).toFixed(0)} nodes/s), transitions: ${JSON.stringify(transitions)}`
)
if (processed !== BACKLOG + 1) {
	console.error(`FAIL: expected ${BACKLOG + 1} processed nodes, got ${processed} — nodes were lost!`)
	process.exit(1)
}

// --- History sync slicing ----------------------------------------------------
const conversations = Array.from({ length: 500 }, (_, i) => {
	const chatId = `2547000000${i}@s.whatsapp.net`
	return {
		id: chatId,
		messages: Array.from({ length: 20 }, (_, j) => ({
			message: { key: { remoteJid: chatId, fromMe: false, id: `HIST-${i}-${j}` }, messageTimestamp: 1_700_000_000 }
		}))
	}
})
let yields = 0
const histStart = performance.now()
const history = await processHistoryMessageBatched(
	{ syncType: proto.HistorySync.HistorySyncType.RECENT, progress: 100, conversations },
	undefined,
	{
		yieldToEventLoop: async () => {
			yields++
		}
	}
)
console.log(
	`${'history sync (500 chats x 20 msgs)'.padEnd(44)} ${history.messages.length} messages in ` +
		`${(performance.now() - histStart).toFixed(0)} ms, ${yields} event-loop yields between batches`
)
rss('final')
console.log('\nOK: no nodes or messages lost')
