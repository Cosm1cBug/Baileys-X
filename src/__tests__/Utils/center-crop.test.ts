import { centerCropOffsets } from '../../Utils/messages-media'

describe('centerCropOffsets', () => {
	it('returns the top-left corner for a square image', () => {
		expect(centerCropOffsets(500, 500)).toEqual({ x: 0, y: 0 })
	})

	it('crops a landscape image from the horizontal centre', () => {
		expect(centerCropOffsets(800, 400)).toEqual({ x: 200, y: 0 })
	})

	it('crops a portrait image from the vertical centre', () => {
		expect(centerCropOffsets(400, 800)).toEqual({ x: 0, y: 200 })
	})

	it('rounds odd deltas', () => {
		expect(centerCropOffsets(801, 400)).toEqual({ x: 200, y: 0 })
		expect(centerCropOffsets(400, 801)).toEqual({ x: 0, y: 200 })
	})

	it('clamps out-of-range crop sides to a zero offset', () => {
		expect(centerCropOffsets(400, 800, 1000)).toEqual({ x: 0, y: 0 })
	})
})
