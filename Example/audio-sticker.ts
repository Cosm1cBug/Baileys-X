import makeWASocket, { useMultiFileAuthState } from '../src'

// First link an account with Example/example.ts, then run:
// yarn tsx Example/audio-sticker.ts <jid> <sticker.webp> <audio.ogg>
const [jid, stickerPath, audioPath] = process.argv.slice(2)
if (!jid || !stickerPath || !audioPath) {
	throw new Error('Usage: audio-sticker.ts <jid> <sticker.webp> <audio.ogg>')
}

const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
if (!state.creds.registered) {
	throw new Error('Link an account using Example/example.ts before running this example')
}

const sock = makeWASocket({ auth: state })
sock.ev.on('creds.update', saveCreds)
let started = false
sock.ev.on('connection.update', async ({ connection }) => {
	if (connection === 'open' && !started) {
		started = true
		try {
			await sock.sendMessage(jid, { audioSticker: { sticker: { url: stickerPath }, audio: { url: audioPath } } })
			console.log('Audio sticker sent')
		} catch (error) {
			console.error('Audio sticker send failed', error)
			process.exitCode = 1
		} finally {
			await sock.end(undefined)
		}
	} else if (connection === 'close' && !started) {
		console.error('Connection closed before the audio sticker was sent')
		process.exitCode = 1
	}
})
