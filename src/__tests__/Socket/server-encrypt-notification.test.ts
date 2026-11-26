import { jest } from '@jest/globals'
import P from 'pino'
import { MIN_PREKEY_COUNT } from '../../Defaults'
import { handleServerEncryptNotification } from '../../Utils/server-encrypt-notification'
import { assertNodeErrorFree, type BinaryNode, S_WHATSAPP_NET } from '../../WABinary'

const node = (child?: BinaryNode): BinaryNode => ({
	tag: 'notification',
	attrs: { from: S_WHATSAPP_NET, type: 'encrypt', id: 'notification-1' },
	content: child ? [child] : []
})

const child = (tag: string, attrs: Record<string, string> = {}): BinaryNode => ({ tag, attrs })

describe('server encrypt notifications', () => {
	const logger = P({ level: 'silent' })
	let query: jest.Mock<(node: BinaryNode) => Promise<unknown>>
	let uploadPreKeys: jest.Mock<() => Promise<void>>
	let inFlightPreKeyLow: Set<string>
	const context = () => ({ query, uploadPreKeys, inFlightPreKeyLow, logger })

	beforeEach(() => {
		query = jest.fn<(node: BinaryNode) => Promise<unknown>>().mockResolvedValue({ tag: 'iq', attrs: {} })
		uploadPreKeys = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
		inFlightPreKeyLow = new Set()
	})

	it('uploads on a low count and clears the in-flight guard', async () => {
		await handleServerEncryptNotification(node(child('count', { value: '0' })), context())
		expect(uploadPreKeys).toHaveBeenCalledTimes(1)
		expect(inFlightPreKeyLow.size).toBe(0)
	})

	it('does not upload at the threshold', async () => {
		await handleServerEncryptNotification(node(child('count', { value: String(MIN_PREKEY_COUNT) })), context())
		expect(uploadPreKeys).not.toHaveBeenCalled()
	})

	it('deduplicates in-flight count notifications and clears the guard after failure', async () => {
		inFlightPreKeyLow.add('notification-1')
		await handleServerEncryptNotification(node(child('count', { value: '0' })), context())
		expect(uploadPreKeys).not.toHaveBeenCalled()
		inFlightPreKeyLow.clear()
		uploadPreKeys.mockRejectedValue(new Error('upload failed'))
		await expect(handleServerEncryptNotification(node(child('count', { value: '0' })), context())).rejects.toThrow(
			'upload failed'
		)
		expect(inFlightPreKeyLow.size).toBe(0)
	})

	it('queries the digest without claiming local validation or uploading on a response', async () => {
		await handleServerEncryptNotification(node(child('digest')), context())
		expect(query).toHaveBeenCalledWith({
			tag: 'iq',
			attrs: { xmlns: 'encrypt', type: 'get', to: S_WHATSAPP_NET },
			content: [child('digest')]
		})
		expect(uploadPreKeys).not.toHaveBeenCalled()
	})

	it.each(['404', '406', '503'])('uploads only on server error %s', async code => {
		query.mockImplementation(async () => {
			assertNodeErrorFree({ tag: 'iq', attrs: {}, content: [child('error', { code })] })
		})
		const promise = handleServerEncryptNotification(node(child('digest')), context())
		if (code === '404') {
			await expect(promise).resolves.toBeUndefined()
			expect(uploadPreKeys).toHaveBeenCalledTimes(1)
		} else {
			await expect(promise).rejects.toThrow()
			expect(uploadPreKeys).not.toHaveBeenCalled()
		}
	})

	it('surfaces a missing query response and does not upload', async () => {
		query.mockResolvedValue(undefined)
		await expect(handleServerEncryptNotification(node(child('digest')), context())).rejects.toThrow('no response')
		expect(uploadPreKeys).not.toHaveBeenCalled()
	})

	it.each([node(child('pq_count')), node(child('other')), node()])(
		'does not crash or query for other notification shapes',
		async notification => {
			await handleServerEncryptNotification(notification, context())
			expect(query).not.toHaveBeenCalled()
			expect(uploadPreKeys).not.toHaveBeenCalled()
		}
	)
})
