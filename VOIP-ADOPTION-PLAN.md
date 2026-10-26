# Adopting WhatsApp Calling into Baileys-X — Comprehensive Plan

**Subject:** [SheIITear/baileys-voip](https://github.com/SheIITear/baileys-voip) (`baileys-voip@0.1.0`)
**Companion reading:** [CALLING.md](./CALLING.md) (evaluation of the same author's earlier `baileys-caller`)
**Status:** Plan only — no code adopted yet. One hard gate (licence) must be resolved before any code moves.

---

## 1. Executive summary

`baileys-voip` is a genuine, protocol-level reimplementation of WhatsApp's VoIP
engine in pure TypeScript (~9,700 LOC): Signal-encrypted call signalling, STUN
relay allocation, SRTP media crypto (1:1 E2E AES-CTR + group HBH, SFrame),
WhatsApp's proprietary WARP packet framing, and the MLow audio codec running
through a vendored WASM libopus build. It is architected as a **companion to
Baileys**, not a fork of it: Baileys carries the `<call>` stanzas, the engine
carries the media.

Baileys-X is unusually well positioned for it — the fork already exposes nearly
every socket primitive the engine's glue needs (`signalRepository`, `sendNode`,
`query`, `waitForMessage`, `getUSyncDevices`, `sock.ws.on('CB:call')`…), plus
the identity machinery (LID↔PN) the current call protocol is built on.

**Recommendation (short version):**

1. **Do not copy any code yet.** The repo is `UNLICENSED` with no `LICENSE`
   file. That is a hard legal gate, not a detail (Phase 0).
2. **Phase 1 (do regardless):** small native Baileys-X signalling upgrades so
   *any* call engine — this one, `baileys-caller`, or a future clean-room
   implementation — can integrate cleanly instead of scraping raw socket
   internals.
3. **Phase 2:** ship a maintained, first-class *integration example* in
   Baileys-X (`examples/calling/`) that drives `baileys-voip` as an external
   dependency against Baileys-X — validated by hand, never by automated
   real-account calls.
4. **Phase 3 (only if Phase 0 clears):** evaluate a vendored port of the engine
   as an optional, separately-importable subpath of Baileys-X
   (`baileys/voip`), behind optional peer dependencies.

---

## 2. What `baileys-voip` actually is

### 2.1 Architecture (from `stack.md` + source)

| Layer | Module(s) | Role |
|---|---|---|
| Call signalling | `lib/protocol/xmpp.ts`, `lib/engine/node.ts` | Parse/build `<call>` stanzas (offer/preaccept/accept/ack/terminate/reject), relay-transport extraction |
| Media orchestration | `lib/media/mediaPipeline.ts` | Encode → pace (60 ms) → SRTP-protect → relay send, and the reverse path |
| Audio codec | `lib/media/mlowWasmRtp.ts` + `src/vendor/libopus-wasm/` | WhatsApp's MLow codec (libopus SMPL extension) compiled to WASM; ffmpeg pre-decodes sources to 16 kHz mono PCM |
| RTP framing | `lib/media/rtpEngine.ts`, `lib/crypto/warp.ts` | RTP + WARP extension (`0xDEBE`), piggyback frames, HMAC message-integrity tags, proprietary RTCP types (PT 206/208/209) |
| Media crypto | `lib/crypto/srtp.ts`, `srtp1to1.ts`, `sframe.ts` | Group HBH (AES-128-CTR + HMAC-SHA1) and 1:1 E2E (HKDF → AES-CM PRF → AES-CTR); SFrame AES-GCM for group E2E |
| Relay control | `lib/protocol/relay.ts`, `lib/relay/relayController.ts` | STUN: private allocate (`0x0003`), bind, keepalive (~1.1 s), CONNECTION-ID, stream-subscription protobuf |
| Relay transport | `lib/relay/RelayRtcTransport.mts`, raw `dgram` | WebRTC DataChannel to WhatsApp relays via `@roamhq/wrtc` (production), raw UDP (testing) |
| Baileys bridge | `lib/app/whatsapp-signaling.ts` | Offer-stanza construction, per-device Signal encryption of the 32-byte call key, session pre-warming, ack tracking |

Public surface (`WhatsAppVoipNode`): `initialize()`, `initVoipStack(pn, pnBare, lid)`,
`setRelaySendCallback()`, `setE2ECallKey()`, `startCall()`, `endCall()`,
`handleSignalingMessage({payload})`, `feedRelayDatagram()`, `getCallInfo()`,
`getMediaStats()`, callbacks `onSignalingXmpp` / `onCallEvent(type, data)` /
`onAudioPlaybackData(samples)` / `onLog`.

### 2.2 Maturity assessment (evidence-based)

| Signal | Observation |
|---|---|
| Version / age | `0.1.0`; public history is days old (first commits 2026-10-14) |
| Tests | **None.** Verification is manual via `npm run test:call` against a real account; `stack.md` doubles as the protocol spec |
| Dependencies | `@roamhq/wrtc` (native, optional), `ffmpeg` on `PATH`; runtime dep on `@whiskeysockets/baileys@^7.0.0-rc13` (we are rc14 + fork changes) |
| Robustness traits | Extensive env-gated diagnostics/tracing (`diag.ts`, `trace.ts`), a live TUI, careful byte-level documentation in every file |
| Scope | 1:1 audio (E2E), group (HBH + SFrame) machinery present, video flags exist (`isVideo`, SSRC plan includes video streams) but audio is the exercised path |
| Claims not independently verified | "Places real calls" is the author's claim (with a demo video). Nothing in this plan treats it as proven until Phase 2's manual validation |

### 2.3 Relationship to the previously evaluated `baileys-caller`

Different strategy, same author: `baileys-caller` ran WhatsApp Web's actual
`wa_voip_wasm` in a 20-thread worker pool (verdict in CALLING.md: companion-only,
partly because of the 11 MB WASM blob and worker pool). `baileys-voip` removes
both objections — pure TS, ~1.7 MB total, no worker pool, inbound + outbound,
group scaffolding — but introduces a new one the caller didn't have: it is a
from-scratch reimplementation, so **protocol drift risk sits entirely with us**.

---

## 3. What Baileys-X already has (gap analysis)

The engine needs exactly five things from the socket. All five exist:

| Engine need (their glue) | Baileys-X today | Status |
|---|---|---|
| Inbound `<call>` stanzas | `sock.ws.on('CB:call')` reachable; internal `handleCall` also consumes them into the `call` event | ⚠️ Works, but see §4.1 |
| Outbound stanza send + ack wait | `sock.sendNode()`, `sock.query()`, `sock.waitForMessage()`, `sock.generateMessageTag()` | ✅ |
| Signal session ops for call-key encryption | `sock.signalRepository` (`encryptMessage`, `validateSession`, `jidToSignalProtocolAddress`), `parseAndInjectE2ESessions` export | ✅ |
| Device enumeration / session pre-warm | `sock.getUSyncDevices()` + `ensureSessions` pattern (fork has session assertion) | ✅ |
| LID↔PN identity | `sock.signalRepository.lidMapping`, fork's own `getLidForJid`/`getRealJid`, `identity-change` event | ✅ (fork is ahead of rc13 here) |
| Call lifecycle events | `call` event (`WACallEvent`, statuses offer/ringing/accept/terminate/…) + `rejectCall` / `acceptCall` / `terminateCall` (signalling-only) | ⚠️ Partially — see §4 |

Also already decided (CALLING.md): Baileys-X documents calling as
"signalling in-tree, media engine out-of-tree". This plan either preserves that
boundary (Phases 1–2) or deliberately crosses it (Phase 3).

---

## 4. The real gaps (native Baileys-X work, Phase 1)

These are worth doing **no matter which engine** is adopted, because today the
only integration path is scraping `sock.ws` internals:

### 4.1 Raw call-stanza access
`handleCall` parses stanzas into `WACallEvent` and **discards** the children a
media engine needs (`<relay><transport>` endpoints/tokens, `<enc>` call-key
payloads, `<destination>` lists). The engine's own glue re-reads the raw node
via `sock.ws.on('CB:call')` — which works, but couples integrators to socket
internals and stanza re-rendering (`binaryNodeToString`).

**Fix (pick one, in order of preference):**
- (a) Add the parsed-but-dropped data to `WACallEvent` as optional fields
  (`rawNode?: BinaryNode` is the minimal, lossless option), or
- (b) expose a documented `sock.ws`-level contract for call-stanza taps.

(a) is one small, backwards-compatible change in `messages-recv.ts` +
`Types/Call.ts`.

### 4.2 Engine-grade accept
`acceptCall(callId, callFrom)` sends a bare `<accept>`. Real media requires an
accept carrying relay/transport info and the `raw_e2e` key material the engine
produces. Add either `acceptCallWithStanza(...)` or document that engines send
their own accept via `sendNode` and use `acceptCall` only for signalling-only
declines-after-answer. (Reject/terminate bare stanzas are already sufficient.)

### 4.3 Offer-stanza helper (optional, small)
`buildOfferStanza` in their glue (privacy → audio caps → net → capability →
destination → per-device `<enc>`) is the fiddliest part of outbound calling.
A Baileys-X-native `buildCallOfferStanza()` in `Utils/` (using the fork's own
signal repository, with fixtures) would make every engine's outbound path
trivial. Only build after Phase 2 proves the stanza shape against the real
service.

### 4.4 Event completion for call state
Map engine `onCallEvent(type, data)` numeric codes onto typed socket events
only if Phase 3 happens; for a companion engine the existing `call` event plus
the engine's own callbacks are enough.

---

## 5. Hard gates (before any code adoption)

### 5.1 Licence — **blocking**
`baileys-voip` is `UNLICENSED` and ships no `LICENSE` file. Copying or vendoring
its code into Baileys-X is not permitted by default copyright. Options:

1. **Ask the author** for an MIT/ISC re-licence or written permission to vendor
   (they already publish a MIT companion, `baileys-caller`, so this is a
   realistic ask). Written answer required; a verbal/chat "sure" should be
   captured in the repo (e.g. `VOIP-LICENSE-NOTE.md`).
2. If declined/silent: **no code copies** — Phase 2 (external dependency) still
   has licence exposure for *users* though: consuming an UNLICENSED package as
   a dependency is legally grey. The example must say so plainly, and
   Baileys-X itself must not redistribute the engine.
3. Clean-room reimplementation from observed wire behaviour (their `stack.md`
   documents the formats, but it is *their* documentation — a true clean room
   needs independent protocol capture). Treat as Phase 3-alt, not a shortcut.

### 5.2 Vendored WASM provenance
`src/vendor/libopus-wasm/` derives from `@discordjs/opus` WASM builds (libopus
itself is BSD-3-Clause). Before any vendoring: confirm the exact provenance and
 licence chain of the MLow/SMPL extension build. If unclear, Phase 3 must build
the codec from source with a recorded toolchain, or stay on ffmpeg/Opus paths
the engine supports.

### 5.3 Safety rules (project-standing, non-negotiable)
- **No automated real-account calling in CI or scripts** — mocks, recorded
  stanza fixtures, and STUN/SRTP test vectors only. Live validation is a
  manual, opt-in checklist run by the maintainer with their own account.
- Do not weaken Signal/session validation to make key exchange "just work".
- Calling must stay **opt-in**: no new runtime/native dependency for users who
  only chat (optional peer deps + lazy imports, mirroring the `sharp`/`jimp`
  pattern already in this codebase).

---

## 6. Options considered

| Option | What it means | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. Vendor/port the engine into Baileys-X** | Copy ~9.7k LOC (+WASM) into e.g. `src/VoIP/`, export `baileys/voip` subpath | Single install, fork-controlled, typed socket integration | **Blocked by licence**; takes on protocol-drift maintenance, ffmpeg/wrtc peer surface, biggest review surface | Phase 3, only post-licence |
| **B. Companion + first-class example** | Engine stays external; Baileys-X ships native signalling upgrades (Phase 1) + `examples/calling/` wired to the engine | Works today; zero licence contamination of the library; keeps install lean; matches CALLING.md precedent | Users juggle two packages; engine pinned to rc13 upstream API drift must be watched | **Recommended now (Phases 1–2)** |
| **C. Clean-room engine** | Implement from protocol captures + RFCs (SRTP/SFrame), MLow from scratch | Full control, clean licence | Months of effort; MLow codec alone is a research project | Not recommended |
| **D. Signalling only** | Keep today's stance; document engine options | Zero risk | Calling remains DIY; the raw-stanza wart (§4.1) persists | Fallback if Phase 0 fails |

---

## 7. Phased plan

### Phase 0 — Licence & provenance decision (no code)
1. Contact SheIITear: ask for MIT/ISC re-licence of `baileys-voip` (or written
   vendoring permission) + provenance of the MLow WASM build.
2. Record the outcome in this file. **Gate:** no Phase 3 without a yes.
   *Effort: days of waiting, ~1 h of work.*

### Phase 1 — Native signalling upgrades in Baileys-X (independent of engine)
Backwards-compatible, fully unit-testable with fixtures; benefits every engine.

1. `WACallEvent`: add optional `rawNode` (and parsed `relayLatencyMs` already
   exists) — `src/Types/Call.ts`, `src/Socket/messages-recv.ts` (`handleCall`).
   Tests: fixture stanza in → event carries node out; existing call tests green.
2. Document engine-accept path; add `acceptCall` overload or a
   `sendCallStanza`-style public helper if the example (Phase 2) shows friction.
3. README: the `call` event entry already points here; add an
   `examples/calling/README` stub describing the boundary.
   *Effort: 1–2 days including tests. Risk: low.*

### Phase 2 — Maintained integration example (`examples/calling/`)
1. Port their `bot-integration.mts` shape to Baileys-X imports: socket from
   Baileys-X, `attachCalling(sock)` with `placeCall(number)` / `endCall()`,
   PCM-out callback; UDP transport default in the example, wrtc behind a flag.
2. Alignment pass vs rc14+fork: replace rc13-only assumptions, use the fork's
   `lidMapping`/USync helpers; confirm every `sock.*` the glue touches exists
   with matching behaviour (table in §3).
3. **Manual validation checklist** (maintainer-run, own account, documented in
   the example README): outbound 1:1 audio (callee hears source audio),
   inbound answer via engine accept, hangup both directions, group call smoke
   test if claimed, `CALL_VERBOSE=1` traces archived as fixtures.
4. Capture sanitized stanza fixtures from that run → unit tests for
   parse/build round-trips (offline, CI-safe).
   *Effort: 3–5 days. Risk: medium (depends on unverified "it works" claim).*

### Phase 3 — Vendored engine (only if Phase 0 = yes)
1. Import engine as `src/VoIP/` behind subpath export `baileys/voip`;
   `ffmpeg` + `@roamhq/wrtc` as **optional peer dependencies**, lazy-loaded.
2. Replace `(sock as any)` glue with Phase-1 typed APIs; map engine callbacks
   onto the `call` event (typed union instead of numeric codes at the seam).
3. Port the protocol layer to fixture tests: XMPP stanza parse/build,
   STUN allocate/bind byte vectors, SRTP 1:1 & HBH known-answer tests
   (HKDF/AES-CM vectors from `stack.md` §SRTP — independently recomputed),
   WARP MI tag, relay state machine with a fake transport.
4. CI: typecheck + offline tests only; media paths excluded from coverage
   gates but never from typecheck.
   *Effort: 2–4 weeks part-time including hardening. Risk: high (drift).*

### Phase 4 — Hardening & docs (after any of 2/3)
- README calling section (outbound/inbound/group), config reference,
  troubleshooting (relay allocation failure, one-way audio, LID-missing).
- Security review pass: call-key handling (never log keys — check `diag.ts`
  env dumps), stanza injection surface, resource cleanup on `endCall`
  (timers, sockets, ffmpeg processes).
- Versioning: pin tested engine/Baileys combos; changelog note that VoIP
  internals change without WhatsApp notice.

---

## 8. API sketch (target state, Phase 2/3)

```ts
import makeWASocket from 'baileys'                      // Baileys-X
import { attachCalling } from 'baileys/voip'            // Phase 3 subpath
// (Phase 2: same shape, imported from the example folder / companion package)

const sock = makeWASocket({ auth })
const calling = await attachCalling(sock, {
    audioSource: 'song.mp3',                 // or a PCM stream factory
    transport: 'webrtc',                     // 'webrtc' | 'udp'
    onPeerAudio: (pcm) => { /* Float32Array @16kHz mono */ },
    onCallState: (e) => console.log(e),      // typed: ringing/accepted/ended…
})

await calling.placeCall('15551234567')
await calling.endCall()
```

Socket-side invariants this API depends on (all Phase 1): typed `call` event
with raw stanza access, public `sendNode`/`waitForMessage`, stable
`signalRepository` surface.

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Licence refusal/silence | Medium | Blocks vendoring | Phase 2 companion route remains viable; example carries a licence caveat |
| WhatsApp changes VoIP internals (MLow/relay) without notice | High over time | Calls break silently | Fixture tests catch build-time breaks only; manual smoke checklist per release; keep media engine isolated so chat features never regress |
| Account flags/bans for unofficial-client calling | Medium | Maintainer/user accounts | Manual-only live testing; docs carry an explicit at-your-own-risk warning (mirroring upstream repo's) |
| `@roamhq/wrtc` native build failures (Node version/platform) | Medium | Production transport unavailable | UDP fallback documented as testing-grade; wrtc stays optional peer |
| `ffmpeg` missing/misbehaving | Medium | No audio decode | Preflight check in `attachCalling` with a clear error (pattern exists for image libs) |
| E2EE overclaiming | — | False user confidence | Docs say "Signal-encrypted call keys + SRTP as implemented; not formally verified" — same standard as the rest of this fork |
| Maintenance drag on a personal fork | Medium | Stale call code | Phase gates: Phase 3 only with licence **and** after Phase 2 proves real usage |

---

## 10. Decision points for the maintainer

1. **Licence outreach:** approve contacting SheIITear about re-licensing
   `baileys-voip` (MIT/ISC) for vendoring? (Without this, plan caps at Phase 2.)
2. **Scope appetite:** companion example (Phase 2) as the end-state, or is a
   vendored `baileys/voip` subpath (Phase 3) actually wanted on this fork?
3. **Video:** engine has video flags/SSRC planning but audio is the proven
   path — declare video out-of-scope until audio is validated? (Recommended:
   yes.)
4. **Group calls:** HBH + SFrame machinery exists; validate in Phase 2 or
   defer? (Recommended: defer; 1:1 first.)

---

## Appendix A — Engine file inventory (for Phase 3 scoping)

Pure protocol/crypto (~4.6k LOC): `protocol/{protocol,relay,xmpp}.ts`,
`crypto/{srtp,srtp1to1,sframe,warp}.ts`, `core/{crypto,bytes,types}.ts`.
Engine/media (~2.9k LOC): `engine/{node,helpers,relay-setup,e2e}.ts`,
`media/{mediaPipeline,mlowWasmRtp,ffmpegRtp,rtpEngine}.ts`,
`relay/{relayController,relayTransport,relayMedia}.ts`, `RelayRtcTransport.mts`.
Glue/UX (~1.5k LOC): `app/{whatsapp-signaling,diag,trace,callTui}.ts`,
`examples/*.mts`. Vendored: `src/vendor/libopus-wasm/` (provenance gate §5.2).

## Appendix B — Verification log for this plan

- Engine surface, layer map, crypto derivations: `stack.md` + source read
  (2026-10-26, commit `9e29b10`).
- Glue requirements: `src/examples/bot-integration.mts`,
  `src/lib/app/whatsapp-signaling.ts` — every `sock.*` it touches checked
  against Baileys-X sources (`src/Socket/socket.ts`, `src/Signal/libsignal.ts`,
  `CALLING.md` table).
- Baileys-X call surface: `handleCall`/`rejectCall`/`acceptCall`/
  `terminateCall` (`src/Socket/messages-recv.ts:591-670, 2020-2080`),
  `WACallEvent` (`src/Types/Call.ts`), `call` event (`src/Types/Events.ts:113`).
- Licence state: `package.json` (`UNLICENSED`), no `LICENSE` file in tree.
