import { jest } from '@jest/globals'

type ExecFileCallback = (error: Error | null) => void

const execFileMock = jest.fn((file: string, args: string[], callback: ExecFileCallback) => {
	callback(null)
	return undefined as unknown as ReturnType<typeof import('child_process').execFile>
})

jest.unstable_mockModule('child_process', () => ({
	execFile: execFileMock
}))

const { generateThumbnail } = await import('../../Utils/messages-media')

describe('extractVideoThumb (via generateThumbnail)', () => {
	beforeEach(() => {
		execFileMock.mockClear()
	})

	it('invokes ffmpeg via execFile with an argv array, never a shell string', async () => {
		await generateThumbnail('/tmp/some video.mp4', 'video', {})

		expect(execFileMock).toHaveBeenCalledTimes(1)
		const [file, args] = execFileMock.mock.calls[0] as unknown as [string, string[]]
		expect(file).toBe('ffmpeg')
		expect(Array.isArray(args)).toBe(true)
		expect(args[args.indexOf('-i') + 1]).toBe('/tmp/some video.mp4')
		expect(args).toContain('00:00:00')
		expect(args[args.length - 1]).toMatch(/\.jpg$/)
	})

	it('keeps shell metacharacters in the path as a single inert argv entry', async () => {
		const hostile = '/tmp/x.mp4; rm -rf ~ #.mp4'
		await generateThumbnail(hostile, 'video', {})

		expect(execFileMock).toHaveBeenCalledTimes(1)
		const [, args] = execFileMock.mock.calls[0] as unknown as [string, string[]]
		// with exec() this string would be interpreted by a shell; as argv it is one literal path
		expect(args[args.indexOf('-i') + 1]).toBe(hostile)
		expect(args.some(arg => arg.includes('rm -rf') && arg !== hostile)).toBe(false)
	})
})
