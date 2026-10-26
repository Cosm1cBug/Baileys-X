import { proto } from '../../../WAProto/index.js'
import { processHistoryMessage, processHistoryMessageBatched } from '../../Utils/history'

const makePayload = (conversationCount: number): proto.IHistorySync => ({
	syncType: proto.HistorySync.HistorySyncType.RECENT,
	progress: 100,
	phoneNumberToLidMappings: [{ lidJid: '11111111111111@lid', pnJid: '1234567890123@s.whatsapp.net' }],
	conversations: Array.from({ length: conversationCount }, (_, i) => {
		const chatId = `2547000000${i}@s.whatsapp.net`
		return {
			id: chatId,
			messages: [0, 1].map(j => ({
				message: {
					key: { remoteJid: chatId, fromMe: false, id: `MSG-${i}-${j}` },
					messageTimestamp: 1_700_000_000 + i
				}
			}))
		}
	})
})

describe('processHistoryMessageBatched', () => {
	it('produces output identical to the synchronous processor', async () => {
		const expected = processHistoryMessage(makePayload(7))
		const actual = await processHistoryMessageBatched(makePayload(7), undefined, { batchSize: 3 })

		expect(actual).toEqual(expected)
	})

	it('never loses chats, contacts or messages across batches', async () => {
		const result = await processHistoryMessageBatched(makePayload(7), undefined, { batchSize: 3 })

		expect(result.chats).toHaveLength(7)
		expect(result.contacts).toHaveLength(7)
		expect(result.messages).toHaveLength(14)
		// top-level mapping emitted exactly once, not once per slice
		expect(result.lidPnMappings).toEqual([{ lid: '11111111111111@lid', pn: '1234567890123@s.whatsapp.net' }])
	})

	it('yields to the event loop between batches, but not after the last one', async () => {
		let yields = 0
		await processHistoryMessageBatched(makePayload(7), undefined, {
			batchSize: 3,
			yieldToEventLoop: async () => {
				yields++
			}
		})
		// 7 conversations in slices of 3 -> slices [3, 3, 1] -> 2 yields
		expect(yields).toBe(2)
	})

	it('bounds slices by the default batch size', async () => {
		let yields = 0
		const result = await processHistoryMessageBatched(makePayload(150), undefined, {
			yieldToEventLoop: async () => {
				yields++
			}
		})

		expect(result.messages).toHaveLength(300)
		expect(yields).toBe(1)
	})

	it('does not yield for payloads below the batch size', async () => {
		let yields = 0
		const result = await processHistoryMessageBatched(makePayload(2), undefined, {
			yieldToEventLoop: async () => {
				yields++
			}
		})

		expect(result.messages).toHaveLength(4)
		expect(yields).toBe(0)
	})

	it('delegates conversation-less sync types untouched', async () => {
		const payload: proto.IHistorySync = {
			syncType: proto.HistorySync.HistorySyncType.PUSH_NAME,
			pushnames: [{ id: '1234567890123@s.whatsapp.net', pushname: 'Alice' }]
		}
		const result = await processHistoryMessageBatched(payload)
		expect(result.contacts).toEqual([{ id: '1234567890123@s.whatsapp.net', notify: 'Alice' }])
	})
})
