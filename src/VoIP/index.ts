/**
 * WhatsApp voice calling for Baileys-X — vendored VoIP engine + native glue.
 *
 * Import from the deep path (keeps the engine and its WASM codec out of the
 * core socket bundle):
 *
 * ```ts
 * import { attachCalling } from 'baileys/lib/VoIP/index.js'
 * ```
 *
 * Provenance: `lib/` and `vendor/` are vendored from baileys-voip
 * (SheIITear/baileys-voip @ 9e29b10) and adopted by the Baileys-X maintainer
 * for personal use. Vendored files are kept verbatim except for import
 * rewiring onto Baileys-X internals and `noUncheckedIndexedAccess`
 * non-null assertions; they are typechecked but exempt from fork lint style.
 * `attachCalling.ts` (this directory) is native Baileys-X code.
 *
 * Runtime requirements: a system `ffmpeg` binary for audio decode, and —
 * only for the default WebRTC relay transport — the optional peer
 * dependency `@roamhq/wrtc`.
 */
export { attachCalling, type AttachCallingOptions, type CallingHandle, type CallingTransport } from './attachCalling'
export * from './lib/app/whatsapp-signaling'
export * from './lib/core/bytes'
export * from './lib/core/crypto'
export type {
	AudioConfig,
	CallInfo,
	SignalingMessage,
	StartCallOptions,
	VideoConfig,
	VideoFrame,
	VoipCallbacks,
	VoipConfig,
	VoipOptions
} from './lib/core/types'
export {
	cryptSrtpPayload as cryptSrtpPayload1to1,
	deriveE2EKeys as deriveE2ESrtpKeys,
	deriveE2EKeysFromRawE2E as deriveE2ESrtpKeysFromRawE2E,
	protectRtp1to1,
	unprotectRtp1to1,
	type E2ESrtpKeys
} from './lib/crypto/srtp1to1'
export * from './lib/crypto/sframe'
export * from './lib/crypto/srtp'
export * from './lib/crypto/warp'
export { WhatsAppVoipNode, WhatsAppVoipNode as WhatsAppVoipWasm } from './lib/engine/node'
export * from './lib/media/mediaPipeline'
export * from './lib/media/mlowWasmRtp'
export * from './lib/media/rtpEngine'
export * from './lib/protocol/protocol'
export * from './lib/protocol/relay'
export * from './lib/protocol/xmpp'
export * from './lib/relay/relayController'
export * from './lib/relay/relayMedia'
export * from './lib/relay/relayTransport'
export { RelayRtcTransport } from './lib/relay/RelayRtcTransport'
