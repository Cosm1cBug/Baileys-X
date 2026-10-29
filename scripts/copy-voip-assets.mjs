// Copies the vendored libopus/MLow WASM runtime assets next to the compiled
// VoIP engine. `tsc` does not emit `.js`/`.mjs` files, but the compiled
// `lib/VoIP/lib/media/mlowWasmRtp.js` loads `../../vendor/libopus-wasm`
// at runtime — without this copy, calling would crash on first use while
// chat-only imports never notice.
import { cpSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
cpSync(join(root, 'src', 'VoIP', 'vendor'), join(root, 'lib', 'VoIP', 'vendor'), { recursive: true })
console.log('copied VoIP WASM assets to lib/VoIP/vendor')
