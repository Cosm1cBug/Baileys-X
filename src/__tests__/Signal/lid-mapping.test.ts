import { jest } from '@jest/globals'
import P from 'pino'
import { LIDMappingStore } from '../../Signal/lid-mapping'
import type { LIDMapping, SignalDataTypeMap, SignalKeyStoreWithTransaction } from '../../Types'

const HOSTED_DEVICE_ID = 99

const mockKeys: jest.Mocked<SignalKeyStoreWithTransaction> = {
	get: jest.fn<SignalKeyStoreWithTransaction['get']>() as any,
	set: jest.fn<SignalKeyStoreWithTransaction['set']>(),
	transaction: jest.fn<SignalKeyStoreWithTransaction['transaction']>(async (work: () => any) => await work()) as any,
	isInTransaction: jest.fn<SignalKeyStoreWithTransaction['isInTransaction']>(),
	disposeTransactionStorage: jest.fn<SignalKeyStoreWithTransaction['disposeTransactionStorage']>()
}
const logger = P({ level: 'silent' })

describe('LIDMappingStore', () => {
	const mockPnToLIDFunc = jest.fn<(jids: string[]) => Promise<LIDMapping[] | undefined>>()
	let lidMappingStore: LIDMappingStore

	beforeEach(() => {
		jest.clearAllMocks()
		lidMappingStore = new LIDMappingStore(mockKeys, logger, mockPnToLIDFunc)
	})

	describe('getPNForLID', () => {
		it('should correctly map a standard LID with a hosted device ID back to a standard PN with a hosted device', async () => {
			const lidWithHostedDevice = `12345:${HOSTED_DEVICE_ID}@lid`
			const pnUser = '54321'

			// @ts-ignore
			mockKeys.get.mockResolvedValue({ [`12345_reverse`]: pnUser } as SignalDataTypeMap['lid-mapping'])

			const result = await lidMappingStore.getPNForLID(lidWithHostedDevice)
			expect(result).toBe(`${pnUser}:${HOSTED_DEVICE_ID}@s.whatsapp.net`)
		})

		it('should return null if no reverse mapping is found', async () => {
			const lid = 'nonexistent@lid'

			// @ts-ignore
			mockKeys.get.mockResolvedValue({} as SignalDataTypeMap['lid-mapping']) // Simulate not found in DB

			const result = await lidMappingStore.getPNForLID(lid)
			expect(result).toBeNull()
		})
	})

	describe('getLidForJid', () => {
		it('returns a LID JID unchanged (normalized) without hitting the store', async () => {
			const result = await lidMappingStore.getLidForJid('12345:2@lid')
			expect(result).toBe('12345@lid')
			expect(mockKeys.get).not.toHaveBeenCalled()
		})

		it('resolves a phone-number JID to its LID via persisted mappings', async () => {
			// @ts-ignore
			mockKeys.get.mockResolvedValue({ '54321': '99999' } as SignalDataTypeMap['lid-mapping'])

			const result = await lidMappingStore.getLidForJid('54321@s.whatsapp.net')
			expect(result).toBe('99999@lid')
		})

		it('returns null when no LID mapping exists', async () => {
			// @ts-ignore
			mockKeys.get.mockResolvedValue({} as SignalDataTypeMap['lid-mapping'])
			mockPnToLIDFunc.mockResolvedValue(undefined)

			const result = await lidMappingStore.getLidForJid('10000@s.whatsapp.net')
			expect(result).toBeNull()
		})

		it('returns null for non-user JIDs and invalid input', async () => {
			expect(await lidMappingStore.getLidForJid('12345-6789@g.us')).toBeNull()
			expect(await lidMappingStore.getLidForJid('status@broadcast')).toBeNull()
			expect(await lidMappingStore.getLidForJid('12345@newsletter')).toBeNull()
			expect(await lidMappingStore.getLidForJid('')).toBeNull()
		})
	})

	describe('getRealJid', () => {
		it('returns a phone-number JID unchanged (normalized) without hitting the store', async () => {
			const result = await lidMappingStore.getRealJid('54321:4@s.whatsapp.net')
			expect(result).toBe('54321@s.whatsapp.net')
			expect(mockKeys.get).not.toHaveBeenCalled()
		})

		it('resolves a LID JID to its phone-number JID via persisted mappings', async () => {
			// @ts-ignore
			mockKeys.get.mockResolvedValue({ '99999_reverse': '54321' } as SignalDataTypeMap['lid-mapping'])

			const result = await lidMappingStore.getRealJid('99999@lid')
			expect(result).toBe('54321@s.whatsapp.net')
		})

		it('returns null when no PN mapping exists', async () => {
			// @ts-ignore
			mockKeys.get.mockResolvedValue({} as SignalDataTypeMap['lid-mapping'])

			const result = await lidMappingStore.getRealJid('424242@lid')
			expect(result).toBeNull()
		})

		it('returns null for non-user JIDs and invalid input', async () => {
			expect(await lidMappingStore.getRealJid('12345-6789@g.us')).toBeNull()
			expect(await lidMappingStore.getRealJid('status@broadcast')).toBeNull()
			expect(await lidMappingStore.getRealJid('12345@newsletter')).toBeNull()
			expect(await lidMappingStore.getRealJid('')).toBeNull()
		})

		it('round-trips: getRealJid(getLidForJid(pn)) returns the PN', async () => {
			// @ts-ignore
			mockKeys.get.mockResolvedValue({
				'54321': '99999',
				'99999_reverse': '54321'
			} as SignalDataTypeMap['lid-mapping'])

			const lid = await lidMappingStore.getLidForJid('54321@s.whatsapp.net')
			expect(lid).toBe('99999@lid')
			expect(await lidMappingStore.getRealJid(lid!)).toBe('54321@s.whatsapp.net')
		})
	})
})
