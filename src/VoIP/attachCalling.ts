import { randomBytes } from 'node:crypto'
import { createSocket } from 'node:dgram'
import type { WASocket } from '../index'
import { type BinaryNode, getAllBinaryNodeChildren } from '../WABinary'
import {
	appendDeviceIdentity,
	binaryNodeToString,
	buildOfferStanza,
	encryptCallKeyForJid,
	ensureSessions,
	sendCallStanza,
	toBareJid
} from './lib/app/whatsapp-signaling'
import { WhatsAppVoipNode } from './lib/engine/node'
import { RelayRtcTransport } from './lib/relay/RelayRtcTransport'

const S_WHATSAPP_NET = '@s.whatsapp.net'

/**
 * Stanza tags the engine consumes for an in-progress call. Anything else
 * (offers for answering, relay latency, …) is still reported via
 * `onCallNode`, but only these are fed to the engine automatically.
 */
const ENGINE_INBOUND_TAGS = new Set([
	'offer',
	'preaccept',
	'accept',
	'ack',
	'lobby_ack',
	'link_join_ack',
	'terminate',
	'reject'
])

export type CallingTransport = 'rtc' | 'udp'

export interface AttachCallingOptions {
	/**
	 * ffmpeg-decodable audio source streamed to the peer: a file path, an
	 * `lavfi:...` spec, or a device URI. Defaults to a 440 Hz test tone.
	 * A system `ffmpeg` binary is required at runtime.
	 */
	audioSource?: string
	/**
	 * Media transport to WhatsApp's relays.
	 * - `rtc` (default): WebRTC DataChannel via the **optional** peer
	 *   dependency `@roamhq/wrtc`. Production-grade.
	 * - `udp`: raw UDP socket. Works for testing, not relay-production-grade.
	 */
	transport?: CallingTransport
	/** Decoded peer audio: Float32 PCM, 16 kHz mono. Pipe to playback/ASR/TTS. */
	onAudio?: (samples: Float32Array) => void
	/** Engine/transport log sink. Defaults to silent. */
	onLog?: (level: 'log' | 'warn' | 'error', message: string) => void
	/**
	 * Every inbound `<call>` child node (offer, accept, terminate, …) as it
	 * arrives, before engine ingest. This is where you see incoming offers —
	 * see the README “Answering an incoming call” section.
	 */
	onCallNode?: (child: BinaryNode, callNode: BinaryNode) => void
}

export interface CallingHandle {
	/**
	 * Place a 1:1 audio call. Accepts a phone number (digits, any format)
	 * or a full `@s.whatsapp.net` JID. Resolves with the call id.
	 */
	placeCall: (phoneOrJid: string) => Promise<string>
	/** Hang up: sends `<terminate>` and tears down the engine call state. */
	endCall: (callId?: string) => Promise<void>
	/** Manually feed a raw `<call>` stanza (e.g. an offer you are answering). */
	feedCallNode: (callNode: BinaryNode) => void
	/** Remove the inbound listener and destroy the engine. */
	detach: () => void
	/** The underlying engine, for stats/SSRCs/lower-level control. */
	voip: WhatsAppVoipNode
}

/**
 * Attach WhatsApp voice calling to an existing, connected Baileys-X socket.
 *
 * ```ts
 * import { attachCalling } from 'baileys/lib/VoIP/index.js'
 *
 * const calling = await attachCalling(sock)
 * const callId = await calling.placeCall('15551234567')
 * // ... later
 * await calling.endCall(callId)
 * ```
 *
 * Must be called after `connection.update` reports `open` (the socket's own
 * LID is required). Inbound stanzas for calls you placed are forwarded to the
 * engine automatically; incoming offers are surfaced via `onCallNode`.
 */
export const attachCalling = async (sock: WASocket, options: AttachCallingOptions = {}): Promise<CallingHandle> => {
	const selfPnJid = String(sock.authState.creds.me?.id ?? '')
	const selfLidJid = String(sock.authState.creds.me?.lid ?? '')
	if (!selfPnJid || !selfLidJid) {
		throw new Error('attachCalling: socket has no PN/LID identity yet — call after connection is open')
	}

	const emitLog = options.onLog ?? (() => undefined)
	const onLog = (level: string, message: string) =>
		emitLog(level === 'warn' || level === 'error' ? level : 'log', message)
	const transport = options.transport ?? 'rtc'

	const voip = new WhatsAppVoipNode({
		audioSource: options.audioSource ?? 'lavfi:sine=frequency=440',
		callbacks: {
			onLog: (level, msg) => onLog(level, msg),
			onAudioPlaybackData: samples => options.onAudio?.(samples),
			onCallEvent: (type, data) => {
				// 156 = relay-list update → hand to the WebRTC transport
				if (type === 156 && data && relay) {
					try {
						relay.updateRelayList(JSON.parse(data))
					} catch (err) {
						onLog('warn', `ignoring malformed relay-list update: ${(err as Error).message}`)
					}
				}
			}
		}
	})
	await voip.initialize()
	voip.initVoipStack(selfPnJid, toBareJid(selfPnJid), selfLidJid)

	// --- media transport -------------------------------------------------
	let relay: RelayRtcTransport | null = null
	let udp: ReturnType<typeof createSocket> | null = null
	if (transport === 'rtc') {
		relay = new RelayRtcTransport({
			onTransportMessage: (data, ip, port) => voip.feedRelayDatagram(new Uint8Array(data), ip, port),
			onLog: (level, message) => onLog(level, message)
		})
		const rtc = relay
		voip.setRelaySendCallback((packet, ip, port) => rtc.send(Buffer.from(packet), ip, port))
	} else {
		udp = createSocket('udp4')
		udp.on('message', (msg, rinfo) => voip.feedRelayDatagram(new Uint8Array(msg), rinfo.address, rinfo.port))
		udp.on('error', err => onLog('error', `udp transport error: ${err.message}`))
		const socket = udp
		voip.setRelaySendCallback((packet, ip, port) => {
			socket.send(Buffer.from(packet), port, ip)
		})
	}

	// --- inbound signaling -------------------------------------------------
	const feedCallNode = (callNode: BinaryNode) => {
		const child = getAllBinaryNodeChildren(callNode)[0]
		if (!child) {
			return
		}

		options.onCallNode?.(child, callNode)
		if (!ENGINE_INBOUND_TAGS.has(child.tag)) {
			return
		}

		try {
			voip.handleSignalingMessage({ payload: binaryNodeToString(child) })
		} catch (err) {
			onLog('warn', `voip ingest failed for <${child.tag}>: ${(err as Error).message}`)
		}
	}

	const onRawCallNode = (node: BinaryNode) => feedCallNode(node)
	sock.ws.on('CB:call', onRawCallNode)

	// --- outbound ----------------------------------------------------------
	const ensuredSessions = new Set<string>()
	let activeCallId: string | null = null

	const placeCall = async (phoneOrJid: string): Promise<string> => {
		const peerPn = phoneOrJid.includes('@') ? phoneOrJid : `${phoneOrJid.replace(/\D/g, '')}${S_WHATSAPP_NET}`
		if (peerPn === S_WHATSAPP_NET) {
			throw new Error('placeCall: phone number or JID required')
		}

		const peerLid = await sock.getLidForJid(peerPn)
		if (!peerLid) {
			throw new Error(`placeCall: could not resolve LID for ${peerPn}`)
		}

		// Signal sessions must exist before the call key can be encrypted
		await ensureSessions(sock, [peerLid], ensuredSessions, S_WHATSAPP_NET)
		const devices = (await sock.getUSyncDevices([peerLid], true, false)).map(d => d.jid)
		await ensureSessions(sock, devices, ensuredSessions, S_WHATSAPP_NET)

		const callId = randomBytes(16).toString('hex')
		const callKey = randomBytes(32) // one 32-byte key per call, encrypted per device

		// E2E keying must be set BEFORE the offer is acked
		voip.setE2ECallKey(callKey, selfLidJid, peerLid, devices)
		voip.startCall({ callId, peerJid: peerLid, peerPn, isVideo: false })
		activeCallId = callId

		const { offer, routeTo, includeDeviceIdentity } = await buildOfferStanza(
			(jid, key, count) => encryptCallKeyForJid(sock, jid, key, count),
			callId,
			selfLidJid,
			peerLid,
			devices,
			callKey
		)
		if (includeDeviceIdentity) {
			await appendDeviceIdentity(sock, offer)
		}

		await sendCallStanza(sock, voip, routeTo, offer, 'offer')
		return callId
	}

	const endCall = async (callId?: string): Promise<void> => {
		const id = callId ?? activeCallId
		if (!id) {
			return
		}

		voip.endCall()
		await sendCallStanza(
			sock,
			voip,
			selfLidJid,
			{
				tag: 'terminate',
				attrs: { 'call-id': id, 'call-creator': selfLidJid, reason: 'accepted' },
				content: []
			},
			'terminate'
		)
		if (id === activeCallId) {
			activeCallId = null
		}
	}

	const detach = (): void => {
		sock.ws.removeListener('CB:call', onRawCallNode)
		udp?.close()
		voip.destroy()
	}

	return { placeCall, endCall, feedCallNode, detach, voip }
}
