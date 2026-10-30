import { jest } from '@jest/globals'
import type { ILogger } from '../../Utils/logger'
import { MessageRetryManager, RetryReason } from '../../Utils/message-retry-manager'

const makeLogger = (): ILogger =>
	({
		level: 'silent',
		child: () => makeLogger(),
		trace: () => {},
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		fatal: () => {}
	}) as unknown as ILogger

const JID = '1234567890@s.whatsapp.net'

describe('MessageRetryManager.parseRetryErrorCode', () => {
	const manager = new MessageRetryManager(makeLogger(), 5)

	it('returns undefined for missing or unparseable attributes', () => {
		expect(manager.parseRetryErrorCode(undefined)).toBeUndefined()
		expect(manager.parseRetryErrorCode('')).toBeUndefined()
		expect(manager.parseRetryErrorCode('not-a-number')).toBeUndefined()
	})

	it('passes through known codes', () => {
		expect(manager.parseRetryErrorCode('4')).toBe(RetryReason.SignalErrorInvalidMessage)
		expect(manager.parseRetryErrorCode('7')).toBe(RetryReason.SignalErrorBadMac)
		expect(manager.parseRetryErrorCode('13')).toBe(RetryReason.StatusRevokeDelay)
	})

	it('maps out-of-range codes to UnknownError', () => {
		expect(manager.parseRetryErrorCode('14')).toBe(RetryReason.UnknownError)
		expect(manager.parseRetryErrorCode('99')).toBe(RetryReason.UnknownError)
		expect(manager.parseRetryErrorCode('-1')).toBe(RetryReason.UnknownError)
	})
})

describe('MessageRetryManager.isMacError', () => {
	const manager = new MessageRetryManager(makeLogger(), 5)

	it('flags only the two MAC codes', () => {
		expect(manager.isMacError(RetryReason.SignalErrorInvalidMessage)).toBe(true)
		expect(manager.isMacError(RetryReason.SignalErrorBadMac)).toBe(true)
	})

	it('does not flag other codes or undefined', () => {
		expect(manager.isMacError(RetryReason.SignalErrorNoSession)).toBe(false)
		expect(manager.isMacError(RetryReason.SignalErrorInvalidSignature)).toBe(false)
		expect(manager.isMacError(RetryReason.UnknownError)).toBe(false)
		expect(manager.isMacError(undefined)).toBe(false)
	})
})

describe('MessageRetryManager.shouldRecreateSession', () => {
	beforeEach(() => {
		jest.useFakeTimers()
		jest.setSystemTime(new Date('2026-01-01T00:00:00Z'))
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('always recreates when there is no session', () => {
		const manager = new MessageRetryManager(makeLogger(), 5)
		const result = manager.shouldRecreateSession(JID, false)
		expect(result.recreate).toBe(true)
		expect(result.reason).toContain("don't have a Signal session")
	})

	it('recreates immediately on Bad MAC, even with a live session', () => {
		const manager = new MessageRetryManager(makeLogger(), 5)
		const result = manager.shouldRecreateSession(JID, true, RetryReason.SignalErrorBadMac)
		expect(result.recreate).toBe(true)
		expect(result.reason).toContain('MAC error')
	})

	it('recreates immediately on Invalid Message (MAC failure)', () => {
		const manager = new MessageRetryManager(makeLogger(), 5)
		const result = manager.shouldRecreateSession(JID, true, RetryReason.SignalErrorInvalidMessage)
		expect(result.recreate).toBe(true)
	})

	it('rate-limits non-MAC recreations to one per hour per JID', () => {
		const manager = new MessageRetryManager(makeLogger(), 5)

		// first non-MAC failure with no history recreates…
		expect(manager.shouldRecreateSession(JID, true, RetryReason.SignalErrorFutureMessage).recreate).toBe(true)
		// …an immediate repeat is rate-limited…
		expect(manager.shouldRecreateSession(JID, true, RetryReason.SignalErrorFutureMessage).recreate).toBe(false)
		// …still limited 59 minutes later…
		jest.setSystemTime(Date.now() + 59 * 60 * 1000)
		expect(manager.shouldRecreateSession(JID, true, RetryReason.SignalErrorFutureMessage).recreate).toBe(false)
		// …and allowed again after the hour window
		jest.setSystemTime(Date.now() + 2 * 60 * 1000)
		expect(manager.shouldRecreateSession(JID, true, RetryReason.SignalErrorFutureMessage).recreate).toBe(true)
	})

	it('a MAC-triggered recreation also opens the rate-limit window', () => {
		const manager = new MessageRetryManager(makeLogger(), 5)
		expect(manager.shouldRecreateSession(JID, true, RetryReason.SignalErrorBadMac).recreate).toBe(true)
		jest.setSystemTime(Date.now() + 5 * 60 * 1000)
		expect(manager.shouldRecreateSession(JID, true, RetryReason.SignalErrorFutureMessage).recreate).toBe(false)
	})

	it('rate limiting is per-JID', () => {
		const manager = new MessageRetryManager(makeLogger(), 5)
		expect(manager.shouldRecreateSession(JID, true, RetryReason.SignalErrorFutureMessage).recreate).toBe(true)
		expect(manager.shouldRecreateSession(JID, true, RetryReason.SignalErrorFutureMessage).recreate).toBe(false)
		// a different JID has its own window
		expect(
			manager.shouldRecreateSession('other@s.whatsapp.net', true, RetryReason.SignalErrorFutureMessage).recreate
		).toBe(true)
	})
})

describe('MessageRetryManager retry counting', () => {
	it('enforces the configured max retry count per message+destination', () => {
		const manager = new MessageRetryManager(makeLogger(), 3)
		expect(manager.hasExceededMaxRetries('m1', JID)).toBe(false)
		manager.incrementRetryCount('m1', JID)
		manager.incrementRetryCount('m1', JID)
		expect(manager.getRetryCount('m1', JID)).toBe(2)
		expect(manager.hasExceededMaxRetries('m1', JID)).toBe(false)
		manager.incrementRetryCount('m1', JID)
		expect(manager.hasExceededMaxRetries('m1', JID)).toBe(true)
		// same id, different destination is independent
		expect(manager.hasExceededMaxRetries('m1', 'other@s.whatsapp.net')).toBe(false)
	})
})
