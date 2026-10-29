import type { BinaryNode } from '../WABinary'

export type WACallUpdateType =
	| 'offer'
	| 'ringing'
	| 'preaccept'
	| 'transport'
	| 'relaylatency'
	| 'timeout'
	| 'reject'
	| 'accept'
	| 'terminate'

export type WACallEvent = {
	chatId: string
	from: string
	callerPn?: string
	isGroup?: boolean
	groupJid?: string
	id: string
	date: Date
	isVideo?: boolean
	status: WACallUpdateType
	offline: boolean
	latencyMs?: number
	/**
	 * The raw signaling child node (offer/accept/terminate/…), including
	 * children the parsed fields above drop (`enc`, `relay`, `destination`, …).
	 * Feed it to a media engine (e.g. `attachCalling` in `VoIP`) or inspect
	 * protocol fields Baileys-X does not model.
	 */
	rawNode?: BinaryNode
}
