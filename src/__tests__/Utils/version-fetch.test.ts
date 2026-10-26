import { jest } from '@jest/globals'
import { fetchLatestBaileysVersion, fetchLatestWaWebVersion } from '../../Utils/generics'

const originalFetch = globalThis.fetch

/** A fetch that never responds, but honours abort like the real one. */
const stallingFetch = (async (_url: RequestInfo | URL, init?: RequestInit) =>
	new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new Error('aborted')))
	})) as typeof fetch

const okFetch = (text: string) =>
	(async () =>
		({ ok: true, status: 200, statusText: 'OK', text: async () => text }) as unknown as Response) as typeof fetch

afterEach(() => {
	globalThis.fetch = originalFetch
})

describe('fetchLatestBaileysVersion', () => {
	it('parses the version from Defaults/index.ts', async () => {
		const text = ['// 1', '// 2', '// 3', '// 4', '// 5', '// 6', 'const version = [2, 3000, 1234567]'].join('\n')
		globalThis.fetch = jest.fn(okFetch(text))

		await expect(fetchLatestBaileysVersion()).resolves.toMatchObject({ version: [2, 3000, 1234567], isLatest: true })
	})

	it('times out instead of hanging on a stalled connection', async () => {
		globalThis.fetch = jest.fn(stallingFetch)

		const result = await fetchLatestBaileysVersion({ timeoutMs: 25 })

		expect(result.isLatest).toBe(false)
		expect(result.error).toBeDefined()
		expect(String((result.error as Error)?.message ?? result.error)).toContain('timed out')
	})

	it('honours a caller-provided abort signal', async () => {
		globalThis.fetch = jest.fn(stallingFetch)
		const caller = new AbortController()
		setTimeout(() => caller.abort(new Error('caller gave up')), 10)

		const result = await fetchLatestBaileysVersion({ timeoutMs: 60_000, signal: caller.signal })

		expect(result.isLatest).toBe(false)
		expect(result.error).toBeDefined()
	})
})

describe('fetchLatestWaWebVersion', () => {
	it('parses the client revision from sw.js', async () => {
		globalThis.fetch = jest.fn(okFetch('assets "client_revision": 7654321 done'))

		await expect(fetchLatestWaWebVersion()).resolves.toMatchObject({ version: [2, 3000, 7654321], isLatest: true })
	})

	it('times out instead of hanging on a stalled connection', async () => {
		globalThis.fetch = jest.fn(stallingFetch)

		const result = await fetchLatestWaWebVersion({ timeoutMs: 25 })

		expect(result.isLatest).toBe(false)
		expect(result.error).toBeDefined()
		expect(String((result.error as Error)?.message ?? result.error)).toContain('timed out')
	})
})
