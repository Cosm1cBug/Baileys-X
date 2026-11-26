import { Boom } from '@hapi/boom'
import { MIN_PREKEY_COUNT } from '../Defaults'
import { type BinaryNode, getBinaryNodeChild, S_WHATSAPP_NET } from '../WABinary'
import type { ILogger } from './logger'

/** Handle server pre-key notifications without interpreting peer identity notifications. */
export async function handleServerEncryptNotification(
	node: BinaryNode,
	{
		query,
		uploadPreKeys,
		inFlightPreKeyLow,
		logger
	}: {
		query: (node: BinaryNode) => Promise<unknown>
		uploadPreKeys: () => Promise<void>
		inFlightPreKeyLow: Set<string>
		logger: ILogger
	}
): Promise<void> {
	const stanzaId = node.attrs.id
	if (stanzaId && inFlightPreKeyLow.has(stanzaId)) return

	const countChild = getBinaryNodeChild(node, 'count')
	if (countChild) {
		const count = +countChild.attrs.value!
		const shouldUploadMorePreKeys = count < MIN_PREKEY_COUNT
		logger.debug({ count, shouldUploadMorePreKeys }, 'recv pre-key count')
		if (shouldUploadMorePreKeys) {
			if (stanzaId) inFlightPreKeyLow.add(stanzaId)
			try {
				await uploadPreKeys()
			} finally {
				if (stanzaId) inFlightPreKeyLow.delete(stanzaId)
			}
		}

		return
	}

	if (getBinaryNodeChild(node, 'digest')) {
		try {
			const result = await query({
				tag: 'iq',
				attrs: { xmlns: 'encrypt', type: 'get', to: S_WHATSAPP_NET },
				content: [{ tag: 'digest', attrs: {} }]
			})
			if (!result) throw new Error('Server encrypt digest query returned no response')
			// The response is not locally validated against our key bundle.
			logger.debug('received server key bundle digest response')
		} catch (error) {
			// assertNodeErrorFree stores the server's stanza error code in Boom.data.
			if (error instanceof Boom && error.data === 404) {
				logger.info('server has no key bundle, uploading pre-keys')
				await uploadPreKeys()
			} else {
				throw error
			}
		}

		return
	}

	if (getBinaryNodeChild(node, 'pq_count')) {
		logger.debug('received post-quantum pre-key count; upload not supported')
	} else {
		logger.warn({ tag: node.tag, id: stanzaId }, 'unknown server encrypt notification')
	}
}
