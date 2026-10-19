import { newsletterId } from '../../WABinary'

describe('newsletterId', () => {
	it('extracts the id from a newsletter jid', () => {
		expect(newsletterId('12345678901234567@newsletter')).toBe('12345678901234567')
	})

	it('extracts the id from a jid with a device suffix', () => {
		expect(newsletterId('12345678901234567:12@newsletter')).toBe('12345678901234567')
	})

	it('accepts a bare id', () => {
		expect(newsletterId('12345678901234567')).toBe('12345678901234567')
	})

	it('ignores agent suffixes', () => {
		expect(newsletterId('12345678901234567_3@newsletter')).toBe('12345678901234567')
	})

	it('returns null for empty input', () => {
		expect(newsletterId(undefined)).toBeNull()
		expect(newsletterId(null)).toBeNull()
		expect(newsletterId('')).toBeNull()
	})
})
