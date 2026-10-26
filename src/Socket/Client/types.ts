import { EventEmitter } from 'events'
import { URL } from 'url'
import type { SocketConfig } from '../../Types'

export abstract class AbstractSocketClient extends EventEmitter {
	abstract get isOpen(): boolean
	abstract get isClosed(): boolean
	abstract get isClosing(): boolean
	abstract get isConnecting(): boolean
	/** Whether incoming frames are currently paused via `pause()`. */
	abstract get isPaused(): boolean

	constructor(
		public url: URL,
		public config: SocketConfig
	) {
		super()
		this.setMaxListeners(0)
	}

	abstract connect(): void
	abstract close(): void
	/** Pause delivery of incoming frames (outgoing frames are unaffected). */
	abstract pause(): void
	/** Resume delivery of incoming frames after `pause()`. */
	abstract resume(): void
	abstract send(str: Uint8Array | string, cb?: (err?: Error) => void): boolean
}
