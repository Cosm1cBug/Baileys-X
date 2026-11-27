import { jest } from '@jest/globals'
import { makeOfflineBatchRequester } from '../../Utils/offline-batch'
import type { BinaryNode } from '../../WABinary'

const offline = (value = '1'): BinaryNode => ({ tag: 'message', attrs: { offline: value } })
const flush = async () => {
	await Promise.resolve()
	await Promise.resolve()
	await Promise.resolve()
}

describe('offline batch requester', () => {
	let sendBatch: jest.Mock<() => Promise<void>>
	let onError: jest.Mock<(error: Error) => void>
	let paused: boolean
	let requester: ReturnType<typeof makeOfflineBatchRequester>

	beforeEach(() => {
		jest.useFakeTimers()
		sendBatch = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
		onError = jest.fn()
		paused = false
		requester = makeOfflineBatchRequester({ sendBatch, onError, isPaused: () => paused })
	})
	afterEach(() => {
		requester.stop()
		jest.useRealTimers()
	})

	it('starts once and requests every 100 offline frames, ignoring other frames', async () => {
		requester.observe(offline())
		requester.start()
		requester.start()
		await flush()
		expect(sendBatch).toHaveBeenCalledTimes(1)
		for (let i = 0; i < 99; i++) requester.observe(offline())
		requester.observe(offline('0'))
		requester.observe({ tag: 'message', attrs: {} })
		requester.observe(new Uint8Array([1]))
		expect(sendBatch).toHaveBeenCalledTimes(1)
		requester.observe(offline())
		await flush()
		expect(sendBatch).toHaveBeenCalledTimes(2)
		for (let i = 0; i < 100; i++) requester.observe(offline())
		await flush()
		expect(sendBatch).toHaveBeenCalledTimes(3)
	})

	it('retries after a timer even for a short or miscounted batch', async () => {
		requester.start()
		await flush()
		for (let i = 0; i < 20; i++) requester.observe(offline())
		await jest.advanceTimersByTimeAsync(10_000)
		expect(sendBatch).toHaveBeenCalledTimes(2)
	})

	it('waits a full retry interval after a count-triggered request', async () => {
		requester.start()
		await flush()
		await jest.advanceTimersByTimeAsync(9_000)
		for (let i = 0; i < 100; i++) requester.observe(offline())
		await flush()
		expect(sendBatch).toHaveBeenCalledTimes(2)
		await jest.advanceTimersByTimeAsync(9_999)
		expect(sendBatch).toHaveBeenCalledTimes(2)
		await jest.advanceTimersByTimeAsync(1)
		expect(sendBatch).toHaveBeenCalledTimes(3)
	})

	it('does not request while intake is paused; retries after it resumes', async () => {
		requester.start()
		await flush()
		paused = true
		for (let i = 0; i < 100; i++) requester.observe(offline())
		await jest.advanceTimersByTimeAsync(30_000)
		expect(sendBatch).toHaveBeenCalledTimes(1)
		paused = false
		await jest.advanceTimersByTimeAsync(10_000)
		expect(sendBatch).toHaveBeenCalledTimes(2)
	})

	it('does not overlap writes and handles a complete batch received during the write', async () => {
		let resolve!: () => void
		sendBatch.mockImplementationOnce(
			() =>
				new Promise<void>(r => {
					resolve = r
				})
		)
		requester.start()
		for (let i = 0; i < 100; i++) requester.observe(offline())
		await jest.advanceTimersByTimeAsync(20_000)
		expect(sendBatch).toHaveBeenCalledTimes(1)
		resolve()
		await flush()
		expect(sendBatch).toHaveBeenCalledTimes(2)
	})

	it('surfaces write errors and retries on the timer', async () => {
		sendBatch.mockRejectedValueOnce(new Error('write failed'))
		requester.start()
		await flush()
		expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'write failed' }))
		await jest.advanceTimersByTimeAsync(10_000)
		expect(sendBatch).toHaveBeenCalledTimes(2)
	})

	it('stops timers and suppresses follow-up sends even when a write completes later', async () => {
		let resolve!: () => void
		sendBatch.mockImplementationOnce(
			() =>
				new Promise<void>(r => {
					resolve = r
				})
		)
		requester.start()
		for (let i = 0; i < 100; i++) requester.observe(offline())
		requester.stop()
		resolve()
		await flush()
		await jest.advanceTimersByTimeAsync(30_000)
		requester.start()
		expect(sendBatch).toHaveBeenCalledTimes(1)
		expect(jest.getTimerCount()).toBe(0)
	})
})
