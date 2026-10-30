// CommonJS smoke check: Baileys-X ships ESM ("type": "module"), but on
// Node >= 20.19 / >= 22.12 CommonJS consumers can require() the ESM build
// directly (no top-level await anywhere in the public graph). This script
// runs in CI after `yarn build` so a regression — e.g. a new top-level
// await or a CJS-hostile dependency — fails the build instead of
// surprising downstream CommonJS users (see Lynovratech checklist item).
'use strict'

const assert = require('node:assert')

const baileys = require('../lib/index.js')
assert.strictEqual(typeof baileys.default, 'function', 'default export (makeWASocket) must be a function')
assert.strictEqual(typeof baileys.makeWASocket, 'function', 'makeWASocket must be a function')
assert.strictEqual(typeof baileys.proto, 'object', 'proto namespace must be present')
assert.strictEqual(typeof baileys.useMultiFileAuthState, 'function', 'useMultiFileAuthState must be a function')

const voip = require('../lib/VoIP/index.js')
assert.strictEqual(typeof voip.attachCalling, 'function', 'VoIP attachCalling must be a function')
assert.strictEqual(typeof voip.WhatsAppVoipNode, 'function', 'VoIP WhatsAppVoipNode must be a constructor')

console.log('CommonJS require() smoke check passed (core + VoIP)')
