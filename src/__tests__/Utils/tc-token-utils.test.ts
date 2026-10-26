import { jest } from '@jest/globals'
import { resolveIssuanceJid, resolveTcTokenJid } from '../../Utils/tc-token-utils'

const PN = '12345@s.whatsapp.net'
const LID = '98765@lid'
const GROUP = '120363000000000000@g.us'

type GetLIDForPN = (pn: string) => Promise<string | null>
type GetPNForLID = (lid: string) => Promise<string | null>

describe('resolveTcTokenJid', () => {
	it('resolves a PN to its LID', async () => {
		const getLIDForPN = jest.fn<GetLIDForPN>().mockResolvedValue(LID)
		await expect(resolveTcTokenJid(PN, getLIDForPN)).resolves.toBe(LID)
		expect(getLIDForPN).toHaveBeenCalledWith(PN)
	})

	it('keeps the PN when no mapping exists', async () => {
		const getLIDForPN = jest.fn<GetLIDForPN>().mockResolvedValue(null)
		await expect(resolveTcTokenJid(PN, getLIDForPN)).resolves.toBe(PN)
	})

	it('passes a LID through without a lookup', async () => {
		const getLIDForPN = jest.fn<GetLIDForPN>()
		await expect(resolveTcTokenJid(LID, getLIDForPN)).resolves.toBe(LID)
		expect(getLIDForPN).not.toHaveBeenCalled()
	})

	it('does not look up non-user JIDs (e.g. groups)', async () => {
		const getLIDForPN = jest.fn<GetLIDForPN>().mockResolvedValue(LID)
		await expect(resolveTcTokenJid(GROUP, getLIDForPN)).resolves.toBe(GROUP)
		expect(getLIDForPN).not.toHaveBeenCalled()
	})

	it('falls back to the PN when the mapping lookup throws', async () => {
		const getLIDForPN = jest.fn<GetLIDForPN>().mockRejectedValue(new Error('usync unavailable'))
		await expect(resolveTcTokenJid(PN, getLIDForPN)).resolves.toBe(PN)
	})
})

describe('resolveIssuanceJid', () => {
	it('resolves a PN to its LID when issuing to LID', async () => {
		const getLIDForPN = jest.fn<GetLIDForPN>().mockResolvedValue(LID)
		await expect(resolveIssuanceJid(PN, true, getLIDForPN)).resolves.toBe(LID)
	})

	it('falls back to the PN when the LID lookup throws', async () => {
		const getLIDForPN = jest.fn<GetLIDForPN>().mockRejectedValue(new Error('usync unavailable'))
		await expect(resolveIssuanceJid(PN, true, getLIDForPN)).resolves.toBe(PN)
	})

	it('does not look up non-user JIDs when issuing to LID', async () => {
		const getLIDForPN = jest.fn<GetLIDForPN>().mockResolvedValue(LID)
		await expect(resolveIssuanceJid(GROUP, true, getLIDForPN)).resolves.toBe(GROUP)
		expect(getLIDForPN).not.toHaveBeenCalled()
	})

	it('resolves a LID to its PN when not issuing to LID', async () => {
		const getLIDForPN = jest.fn<GetLIDForPN>()
		const getPNForLID = jest.fn<GetPNForLID>().mockResolvedValue(PN)
		await expect(resolveIssuanceJid(LID, false, getLIDForPN, getPNForLID)).resolves.toBe(PN)
	})

	it('falls back to the LID when the PN lookup throws', async () => {
		const getLIDForPN = jest.fn<GetLIDForPN>()
		const getPNForLID = jest.fn<GetPNForLID>().mockRejectedValue(new Error('usync unavailable'))
		await expect(resolveIssuanceJid(LID, false, getLIDForPN, getPNForLID)).resolves.toBe(LID)
	})
})
