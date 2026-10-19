import { USyncPictureProtocol } from '../../WAUSync/Protocols/USyncPictureProtocol'
import { USyncUser } from '../../WAUSync/USyncUser'
import type { BinaryNode } from '../../WABinary'

describe('USyncPictureProtocol', () => {
	it('exposes a picture query element with the requested type', () => {
		expect(new USyncPictureProtocol().getQueryElement()).toEqual({ tag: 'picture', attrs: { type: 'image' } })
		expect(new USyncPictureProtocol('preview').getQueryElement()).toEqual({
			tag: 'picture',
			attrs: { type: 'preview' }
		})
	})

	it('adds a picture id filter on the user element when set', () => {
		const user = new USyncUser().withId('123@s.whatsapp.net').withPictureId('42')
		expect(new USyncPictureProtocol().getUserElement(user)).toEqual({ tag: 'picture', attrs: { id: '42' } })
	})

	it('omits the user element when no picture id is set', () => {
		const user = new USyncUser().withId('123@s.whatsapp.net')
		expect(new USyncPictureProtocol().getUserElement(user)).toBeNull()
	})

	it('parses the picture id, direct path and hash', () => {
		const node: BinaryNode = {
			tag: 'picture',
			attrs: { id: '123', direct_path: '/v/t', hash: 'abc' }
		}
		expect(new USyncPictureProtocol().parser(node)).toEqual({ id: '123', directPath: '/v/t', hash: 'abc' })
	})

	it('returns null when the user has no picture', () => {
		const node: BinaryNode = { tag: 'picture', attrs: {} }
		expect(new USyncPictureProtocol().parser(node)).toBeNull()
	})

	it('returns null for foreign nodes', () => {
		const node: BinaryNode = { tag: 'status', attrs: {} }
		expect(new USyncPictureProtocol().parser(node)).toBeNull()
	})
})
