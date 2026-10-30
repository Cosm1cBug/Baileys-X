import { jest } from '@jest/globals'
import { createRequire } from 'module'

/**
 * @napi-rs/image backend (fork-audit item, from itsliaaa/baileys): when the
 * optional peer is installed it should be preferred over jimp (native
 * speed), behind sharp. The native package is not in the lockfile, so —
 * like the sharp mock in messages-media-streaming.test.ts — the module
 * mock is only registered where the package resolves at all; elsewhere
 * (CI) the suite skips and the no-library fallback remains covered by the
 * streaming suite. A minimal in-memory Transformer double keeps the test
 * deterministic; the real binary is verified separately.
 */
jest.unstable_mockModule('jimp', () => ({}))

const resolvable = (name: string) => {
	try {
		createRequire(import.meta.url).resolve(name)
		return true
	} catch {
		return false
	}
}

if (resolvable('sharp')) {
	jest.unstable_mockModule('sharp', () => ({}))
}

const napiResolvable = resolvable('@napi-rs/image')

class FakeTransformer {
	static instances: FakeTransformer[] = []

	resizedWith: unknown[] | undefined

	constructor(readonly bytes: Buffer) {
		FakeTransformer.instances.push(this)
	}

	async metadata() {
		return { width: 100, height: 50 }
	}

	resize(...args: unknown[]) {
		this.resizedWith = args
		return this
	}

	async jpeg(quality?: number) {
		void quality
		return Buffer.from('fake-jpeg-bytes')
	}
}

if (napiResolvable) {
	jest.unstable_mockModule('@napi-rs/image', () => ({ Transformer: FakeTransformer }))
}

const { extractImageThumb, generateProfilePicture } = await import('../../Utils/messages-media')

const describeNapi = napiResolvable ? describe : describe.skip

describeNapi('@napi-rs/image backend', () => {
	beforeEach(() => {
		FakeTransformer.instances = []
	})

	it('extractImageThumb uses the napi transformer when sharp/jimp are unusable', async () => {
		const result = await extractImageThumb(Buffer.from('image-bytes'), 32)

		expect(result.original).toEqual({ width: 100, height: 50 })
		expect(result.buffer).toEqual(Buffer.from('fake-jpeg-bytes'))
		expect(FakeTransformer.instances).toHaveLength(1)
		expect(FakeTransformer.instances[0]!.resizedWith?.[0]).toBe(32)
	})

	it('generateProfilePicture uses the napi transformer', async () => {
		const result = await generateProfilePicture(Buffer.from('image-bytes'), { width: 200, height: 200 })

		expect(result.img).toEqual(Buffer.from('fake-jpeg-bytes'))
		expect(FakeTransformer.instances[0]!.resizedWith).toEqual([200, 200, 0])
	})
})
