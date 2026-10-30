<h1 align='center'><img alt="Baileys logo" src="https://raw.githubusercontent.com/WhiskeySockets/Baileys/refs/heads/master/Media/logo.png" height="75"/></h1>

<div align='center'>Baileys is a WebSockets-based TypeScript library for interacting with the WhatsApp Web API.</div>


> [!CAUTION]
> NOTICE OF BREAKING CHANGE.
>
> As of 7.0.0, multiple breaking changes were introduced into the library.
>
> Please check out https://whiskey.so/migrate-latest for more information.

# Important Note
This is a temporary README.md, the new guide is in development and will this file will be replaced with .github/README.md (already a default on GitHub).

New guide link: https://baileys.wiki

# Get Support

If you'd like business to enterprise-level support from Rajeh, the current maintainer of Baileys, you can book a video chat. Book a 1 hour time slot by contacting him on Discord or pre-ordering [here](https://purpshell.dev/book). The earlier you pre-order the better, as his time slots usually fill up very quickly. He offers immense value per hour and will answer all your questions before the time runs out.

If you are a business, we encourage you to contribute back to the high development costs of the project and to feed the maintainers who dump tens of hours a week on this. You can do so by booking meetings or sponsoring below. All support, even in bona fide / contribution hours, is welcome by businesses of all sizes. This is not condoning or endorsing businesses to use the library. See the Disclaimer below.

# Sponsor
If you'd like to financially support this project, you can do so by supporting the current maintainer [here](https://purpshell.dev/sponsor).

# Disclaimer
This project is not affiliated, associated, authorized, endorsed by, or in any way officially connected with WhatsApp or any of its subsidiaries or its affiliates.
The official WhatsApp website can be found at whatsapp.com. "WhatsApp" as well as related names, marks, emblems and images are registered trademarks of their respective owners.

The maintainers of Baileys do not in any way condone the use of this application in practices that violate the Terms of Service of WhatsApp. The maintainers of this application call upon the personal responsibility of its users to use this application in a fair way, as it is intended to be used.
Use at your own discretion. Do not spam people with this. We discourage any stalkerware, bulk or automated messaging usage.

##

- Baileys does not require Selenium or any other browser to be interface with WhatsApp Web, it does so directly using a **WebSocket**.
- Not running Selenium or Chromium saves you like **half a gig** of ram :/
- Baileys supports interacting with the multi-device & web versions of WhatsApp.
- Thank you to [@pokearaujo](https://github.com/pokearaujo/multidevice) for writing his observations on the workings of WhatsApp Multi-Device. Also, thank you to [@Sigalor](https://github.com/sigalor/whatsapp-web-reveng) for writing his observations on the workings of WhatsApp Web and thanks to [@Rhymen](https://github.com/Rhymen/go-whatsapp/) for the __go__ implementation.

> [!IMPORTANT]
> The original repository had to be removed by the original author - we now continue development in this repository here.
This is the only official repository and is maintained by the community.
> **Join the Discord [here](https://discord.gg/WeJM5FP9GG)**

## Example

Do check out & run [example.ts](Example/example.ts) to see an example usage of the library.
The script covers most common use cases.
To run the example script, download or clone the repo and then type the following in a terminal:
1. ``` cd path/to/Baileys ```
2. ``` yarn ```
3. ``` yarn example ```

## Install

Use the stable version:
```
yarn add @whiskeysockets/baileys
```

Use the edge version (no guarantee of stability, but latest fixes + features)
```
yarn add github:WhiskeySockets/Baileys
```

Then import your code using:
```ts
import makeWASocket from '@whiskeysockets/baileys'
```

> [!NOTE]
> Baileys-X is ESM-first. CommonJS consumers on **Node ≥ 20.19 or ≥ 22.12**
> can still `require()` the built package (including
> `require('baileys/lib/VoIP/index.js')`) thanks to Node's require-ESM
> support — this is smoke-tested in CI on every build.

## Dependencies & Trust

This library holds your WhatsApp credentials and Signal encryption keys,
so its supply chain is deliberately boring:

- **Signal stack:** the official `libsignal` package and upstream
  `whatsapp-rust-bridge` — never renamed third-party signal forks.
- **Optional peers only:** `sharp`, `@napi-rs/image`, `jimp`,
  `link-preview-js`, `audio-decode` and `@roamhq/wrtc` (VoIP) are loaded
  dynamically *only if you install them*; image handling falls back to a
  built-in pure-TypeScript implementation without any of them.
- **CI auditing:** every PR runs a dependency audit (`yarn npm audit`,
  moderate and above) next to the build/lint/test gates.
- **Your auth state is the crown jewels:** whichever store you use
  (multi-file folder, SQLite file, your own database), protect it like a
  password — anyone holding it can impersonate the account.

# Links

- [Discord](https://discord.gg/WeJM5FP9GG)
- [Docs](https://baileys.wiki/docs/intro/)

## 📋 Table of Contents

- [⚠️ Important Note](#important-note)
- [💬 Get Support](#get-support)
- [📖 Example](#example)
- [📥 Install](#install)
- [🔗 Links](#links)
- [🌐 Connecting Account](#connecting-account)
  - [📷 Connect with QR-CODE](#starting-socket-with-qr-code)
  - [🔑 Connect with Pairing Code](#starting-socket-with-pairing-code)
  - [🕘 Receive Full History](#receive-full-history)
- [⚙️ Important Notes About Socket Config](#important-notes-about-socket-config)
  - [🗄️ Caching Group Metadata (Recommended)](#caching-group-metadata-recommended)
  - [🔁 Improve Retry System & Decrypt Poll Votes](#improve-retry-system--decrypt-poll-votes)
  - [🔔 Receive Notifications in Whatsapp App](#receive-notifications-in-whatsapp-app)
- [💾 Saving & Restoring Sessions](#saving--restoring-sessions)
- [📡 Handling Events](#handling-events)
  - [📡 All Events — Complete Reference (37)](#-all-events--complete-reference-37)
  - [▶️ Example to Start](#example-to-start)
  - [📊 Decrypt Poll Votes](#decrypt-poll-votes)
  - [🧭 Summary of Events on First Connection](#summary-of-events-on-first-connection)
- [🗄️ Implementing a Data Store](#implementing-a-data-store)
- [🪪 Whatsapp IDs Explain](#whatsapp-ids-explain)
  - [🔄 Resolving LID ↔ Phone Number (`getRealJid` / `getLidForJid`)](#resolving-lid--phone-number-getrealjid--getlidforjid)
- [🧰 Utility Functions](#utility-functions)
- [✉️ Sending Messages](#sending-messages)
  - [📝 Non-Media Messages](#non-media-messages)
    - [🔠 Text Message](#text-message)
    - [💬 Quote Message](#quote-message-works-with-all-types)
    - [🔔 Mention User](#mention-user-works-with-most-types)
    - [➡️ Forward Messages](#forward-messages)
    - [📍 Location Message](#location-message)
    - [👤 Contact Message](#contact-message)
    - [😀 Reaction Message](#reaction-message)
    - [📌 Pin Message](#pin-message)
    - [📊 Poll Message](#poll-message)
  - [🔗 Sending Messages with Link Previews](#sending-messages-with-link-previews)
  - [📁 Media Messages](#media-messages)
    - [🎞️ Gif Message](#gif-message)
    - [🎥 Video Message](#video-message)
    - [🎵 Audio Message](#audio-message)
    - [🖼️ Image Message](#image-message)
    - [🏷️ Sticker Message](#sticker-message)
    - [📄 Document Message](#document-message)
    - [👁️ View Once Message](#view-once-message)
  - [👉 Interactive Messages](#interactive-messages)
    - [🔘 Reply Buttons](#reply-buttons)
    - [📋 List Message](#list-message)
    - [🌊 Native Flow Buttons](#native-flow-buttons)
    - [🧩 Template Buttons](#template-buttons)
    - [🎠 Carousel](#carousel)
  - [🖼️ Albums](#albums)
  - [🧩 Additional Message Types](#additional-message-types)
    - [🗓️ Event Message](#event-message)
    - [💳 Payment Messages](#payment-messages)
    - [📊 Poll Result & Poll Votes](#poll-result--poll-votes)
    - [🔖 Keep & Flow Reply](#keep--flow-reply)
    - [🎞️ Status Mention & Group Status](#status-mention--group-status)
  - [📣 Newsletter (Channel) Messages](#newsletter-channel-messages)
- [♻️ Modify Messages](#modify-messages)
  - [🗑️ Deleting Messages (for everyone)](#deleting-messages-for-everyone)
  - [✏️ Editing Messages](#editing-messages)
- [🎬 Manipulating Media Messages](#manipulating-media-messages)
  - [🖼️ Thumbnail in Media Messages](#thumbnail-in-media-messages)
  - [⬇️ Downloading Media Messages](#downloading-media-messages)
  - [⬆️ Re-upload Media Message to Whatsapp](#re-upload-media-message-to-whatsapp)
- [📞 Reject Call](#reject-call)
- [🎙️ Voice Calling](#voice-calling)
- [✅ Send States in Chat](#send-states-in-chat)
  - [📖 Reading Messages](#reading-messages)
  - [🟢 Update Presence](#update-presence)
- [💬 Modifying Chats](#modifying-chats)
  - [📥 Archive a Chat](#archive-a-chat)
  - [🔕 Mute/Unmute a Chat](#muteunmute-a-chat)
  - [📖 Mark a Chat Read/Unread](#mark-a-chat-readunread)
  - [🗑️ Delete a Message for Me](#delete-a-message-for-me)
  - [🧹 Delete a Chat](#delete-a-chat)
  - [📌 Pin/Unpin a Chat](#pinunpin-a-chat)
  - [⭐ Star/Unstar a Message](#starunstar-a-message)
  - [⏱️ Disappearing Messages](#disappearing-messages)
- [🔍 User Querys](#user-querys)
  - [✔️ Check If ID Exists in Whatsapp](#check-if-id-exists-in-whatsapp)
  - [🕘 Query Chat History (groups too)](#query-chat-history-groups-too)
  - [💬 Fetch Status](#fetch-status)
  - [🖼️ Fetch Profile Picture (groups too)](#fetch-profile-picture-groups-too)
  - [🏢 Fetch Bussines Profile](#fetch-bussines-profile-such-as-description-or-category)
  - [👀 Fetch Someone's Presence](#fetch-someones-presence-if-theyre-typing-or-online)
- [👤 Change Profile](#change-profile)
  - [💬 Change Profile Status](#change-profile-status)
  - [✏️ Change Profile Name](#change-profile-name)
  - [🖼️ Change Display Picture (groups too)](#change-display-picture-groups-too)
  - [🗑️ Remove display picture (groups too)](#remove-display-picture-groups-too)
- [👥 Groups](#groups)
  - [➕ Create a Group](#create-a-group)
  - [👥 Add/Remove or Demote/Promote](#addremove-or-demotepromote)
  - [✏️ Change Subject (name)](#change-subject-name)
  - [📝 Change Description](#change-description)
  - [⚙️ Change Settings](#change-settings)
  - [🚪 Leave a Group](#leave-a-group)
  - [🔗 Get Invite Code](#get-invite-code)
  - [♻️ Revoke Invite Code](#revoke-invite-code)
  - [🔑 Join Using Invitation Code](#join-using-invitation-code)
  - [ℹ️ Get Group Info by Invite Code](#get-group-info-by-invite-code)
  - [📋 Query Metadata](#query-metadata-participants-name-description)
  - [✉️ Join using `groupInviteMessage`](#join-using-groupinvitemessage)
  - [📥 Get Request Join List](#get-request-join-list)
  - [✅ Approve/Reject Request Join](#approvereject-request-join)
  - [👥 Get All Participating Groups Metadata](#get-all-participating-groups-metadata)
  - [⏱️ Toggle Ephemeral](#toggle-ephemeral)
  - [➕ Change Add Mode](#change-add-mode)
- [🔐 Privacy](#privacy)
  - [🚫 Block/Unblock User](#blockunblock-user)
  - [⚙️ Get Privacy Settings](#get-privacy-settings)
  - [📋 Get BlockList](#get-blocklist)
  - [👀 Update LastSeen Privacy](#update-lastseen-privacy)
  - [🟢 Update Online Privacy](#update-online-privacy)
  - [🖼️ Update Profile Picture Privacy](#update-profile-picture-privacy)
  - [💬 Update Status Privacy](#update-status-privacy)
  - [🧾 Update Read Receipts Privacy](#update-read-receipts-privacy)
  - [👥 Update Groups Add Privacy](#update-groups-add-privacy)
  - [⏱️ Update Default Disappearing Mode](#update-default-disappearing-mode)
- [📢 Broadcast Lists & Stories](#broadcast-lists--stories)
  - [📣 Send Broadcast & Stories](#send-broadcast--stories)
  - [🔔 Mention Chats in a Status](#mention-chats-in-a-status)
  - [📋 Query a Broadcast List's Recipients & Name](#query-a-broadcast-lists-recipients--name)
- [✨ Baileys-X Additions](#baileys-x-additions)
  - [📨 Message Types — Quick Reference](#message-types--quick-reference)
  - [🆔 Username API](#username-api)
  - [🤖 AI Groups](#ai-groups)
  - [🔌 Interop (third-party app interop)](#interop-third-party-app-interop)
  - [✨ Rich Responses — `AIRich`, `Toolkit`, `sendHtml`, `sendInteractive`](#rich-responses--airich-toolkit-sendhtml-sendinteractive)
  - [📞 Call Signalling](#call-signalling)
  - [📣 Newsletter Helpers](#newsletter-helpers)
  - [⚙️ Socket Config — Full Reference](#socket-config--full-reference)
- [🛠️ Writing Custom Functionality](#writing-custom-functionality)
  - [🐛 Enabling Debug Level in Baileys Logs](#enabling-debug-level-in-baileys-logs)
  - [📡 How Whatsapp Communicate With Us](#how-whatsapp-communicate-with-us)
  - [🔌 Register a Callback for Websocket Events](#register-a-callback-for-websocket-events)
- [📄 License](#license)

## Connecting Account

WhatsApp provides a multi-device API that allows Baileys to be authenticated as a second WhatsApp client by scanning a **QR code** or **Pairing Code** with WhatsApp on your phone.

> [!NOTE]
> **[Here](#example-to-start) is a simple example of event handling**

> [!TIP]
> **You can see all supported socket configs in the [SocketConfig type alias](https://baileys.wiki/docs/api/type-aliases/SocketConfig/) (Recommended)**

### Starting socket with **QR-CODE**

> [!TIP]
> You can customize browser name if you connect with **QR-CODE**, with `Browser` constant, we have some browsers config, **see the [BrowsersMap type alias](https://baileys.wiki/docs/api/type-aliases/BrowsersMap/)**

```ts
import makeWASocket from '@whiskeysockets/baileys'

const sock = makeWASocket({
    // can provide additional config here
    browser: Browsers.ubuntu('My App'),
    printQRInTerminal: true
})
```

If the connection is successful, you will see a QR code printed on your terminal screen, scan it with WhatsApp on your phone and you'll be logged in!

### Starting socket with **Pairing Code**


> [!IMPORTANT]
> Pairing Code isn't Mobile API, it's a method to connect Whatsapp Web without QR-CODE, you can connect only with one device, see [here](https://faq.whatsapp.com/1324084875126592/?cms_platform=web)

The phone number can't have `+` or `()` or `-`, only numbers, you must provide country code

```ts
import makeWASocket from '@whiskeysockets/baileys'

const sock = makeWASocket({
    // can provide additional config here
    printQRInTerminal: false //need to be false
})

if (!sock.authState.creds.registered) {
    const number = 'XXXXXXXXXXX'
    const code = await sock.requestPairingCode(number)
    console.log(code)
}
```

You can call `requestPairingCode()` after the first `connection.update` with `qr`, or call it earlier and Baileys will wait until WhatsApp sends the `pair-device` readiness stanza. After a successful first pair, WhatsApp normally closes the socket with `515 restartRequired`; reconnect with the saved creds instead of treating that as a failed pair.

If you use a custom `browser[0]` label, Baileys keeps that label for the linked-device registration, but normalizes the pairing-code `companion_platform_display` to a WhatsApp-accepted browser/OS pair such as `Chrome (Mac OS)` or `Chrome (Ubuntu)`.

### Receive Full History

1. Set `syncFullHistory` as `true`
2. Baileys, by default, use chrome browser config
    - If you'd like to emulate a desktop connection (and receive more message history), this browser setting to your Socket config:

```ts
const sock = makeWASocket({
    ...otherOpts,
    // can use Windows, Ubuntu here too
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: true
})
```

## Important Notes About Socket Config

### Caching Group Metadata (Recommended)
- If you use baileys for groups, we recommend you to set `cachedGroupMetadata` in socket config, you need to implement a cache like this:

    ```ts
    const groupCache = new NodeCache({stdTTL: 5 * 60, useClones: false})

    const sock = makeWASocket({
        cachedGroupMetadata: async (jid) => groupCache.get(jid)
    })

    sock.ev.on('groups.update', async ([event]) => {
        const metadata = await sock.groupMetadata(event.id)
        groupCache.set(event.id, metadata)
    })

    sock.ev.on('group-participants.update', async (event) => {
        const metadata = await sock.groupMetadata(event.id)
        groupCache.set(event.id, metadata)
    })
    ```

### Improve Retry System & Decrypt Poll Votes
- If you want to improve sending message, retrying when error occurs and decrypt poll votes, you need to have a store and set `getMessage` config in socket like this:
    ```ts
    const sock = makeWASocket({
        getMessage: async (key) => await getMessageFromStore(key)
    })
    ```

### Receive Notifications in Whatsapp App
- If you want to receive notifications in whatsapp app, set `markOnlineOnConnect` to `false`
    ```ts
    const sock = makeWASocket({
        markOnlineOnConnect: false
    })
    ```
## Saving & Restoring Sessions

You obviously don't want to keep scanning the QR code every time you want to connect.

So, you can load the credentials to log back in:
```ts
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')

// will use the given state to connect
// so if valid credentials are available -- it'll connect without QR
const sock = makeWASocket({ auth: state })

// this will be called as soon as the credentials are updated
sock.ev.on('creds.update', saveCreds)
```

> [!IMPORTANT]
> `useMultiFileAuthState` is a utility function to help save the auth state in a single folder, this function serves as a good guide to help write auth & key states for SQL/no-SQL databases, which I would recommend in any production grade system.

On Node ≥ 22.5 you can instead keep everything in one SQLite file with
zero extra dependencies (built-in `node:sqlite`, transactional writes):

```ts
import makeWASocket, { useSQLiteAuthState } from '@whiskeysockets/baileys'

const { state, saveCreds } = await useSQLiteAuthState('auth.db')
const sock = makeWASocket({ auth: state })
sock.ev.on('creds.update', saveCreds)
```

> [!NOTE]
> When a message is received/sent, due to signal sessions needing updating, the auth keys (`authState.keys`) will update. Whenever that happens, you must save the updated keys (`authState.keys.set()` is called). Not doing so will prevent your messages from reaching the recipient & cause other unexpected consequences. The `useMultiFileAuthState` function automatically takes care of that, but for any other serious implementation -- you will need to be very careful with the key state management.

## Handling Events

- Baileys uses the EventEmitter syntax for events.
They're all nicely typed up, so you shouldn't have any issues with an Intellisense editor like VS Code.

> [!IMPORTANT]
> **The events are in the [BaileysEventMap type alias](https://baileys.wiki/docs/api/type-aliases/BaileysEventMap/)**, it's important you see all events

You can listen to these events like this:
```ts
const sock = makeWASocket()
sock.ev.on('messages.upsert', ({ messages }) => {
    console.log('got messages', messages)
})
```

Unexpected errors while processing messages, calls, receipts or internal tasks are also emitted (in addition to being logged), so you can count or alert on them instead of only reading logs after the fact:
```ts
sock.ev.on('processing.error', ({ error, context }) => {
    console.error(`failed during ${context}`, error)
})
```

### 📡 All Events — Complete Reference (37)

Every event declared in the `BaileysEventMap` type — nothing omitted. Each one
with a minimal, working listener. Most events are delivered immediately; a few
(`chats.*`, `contacts.*`, `messages.*`, `groups.update`, history) may be
consolidated by the event buffer during stanza bursts and flushed together —
the payloads below are what your handler receives either way.

**Index:**
`connection.update` · `creds.update` · `messaging-history.set` · `messaging-history.status` · `chats.upsert` · `chats.update` · `chats.delete` · `lid-mapping.update` · `contacts.upsert` · `contacts.update` · `presence.update` · `messages.upsert` · `messages.update` · `messages.delete` · `messages.media-update` · `messages.reaction` · `message-receipt.update` · `groups.upsert` · `groups.update` · `group-participants.update` · `group.join-request` · `group.member-tag.update` · `call` · `labels.edit` · `labels.association` · `blocklist.set` · `blocklist.update` · `identity-change` · `newsletter.reaction` · `newsletter.view` · `newsletter-participants.update` · `newsletter-settings.update` · `newsletter-partnership.update` · `message-capping.update` · `chats.lock` · `settings.update` · `processing.error`

#### 🔗 Connection & Credentials

##### `connection.update`
Connection state changed — `connecting`, `open`, `close`, QR codes and the disconnect reason arrive here.

```ts
sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) console.log('scan this QR:', qr)
    if (connection === 'close') console.log('closed:', lastDisconnect?.error)
    if (connection === 'open') console.log('connected')
})
```

##### `creds.update`
Auth credentials changed. Persist them (this is what keeps you logged in between restarts).

```ts
const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
sock.ev.on('creds.update', saveCreds)
```

#### 🕘 History Sync

##### `messaging-history.set`
History sync payload (chats, contacts, messages — newest first) delivered on connect and during syncs.

```ts
sock.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest, progress }) => {
    console.log(`history: ${chats.length} chats, ${messages.length} messages (${progress}%${isLatest ? ', latest' : ''})`)
})
```

##### `messaging-history.status`
A history sync phase completed (`explicit: true`) or stalled and was inferred complete (`explicit: false`).

```ts
sock.ev.on('messaging-history.status', ({ syncType, status, explicit }) => {
    console.log(`history sync ${syncType}: ${status}${explicit ? '' : ' (inferred)'}`)
})
```

#### 💬 Chats & Contacts

##### `chats.upsert`
New chats appeared (first message, group joined, history sync).

```ts
sock.ev.on('chats.upsert', (chats) => {
    for (const chat of chats) console.log('new chat:', chat.id, chat.name)
})
```

##### `chats.update`
Existing chats changed — unread count, archive/pin/mute state, last message, name.

```ts
sock.ev.on('chats.update', (updates) => {
    for (const { id, unreadCount, archive } of updates) {
        console.log(`chat ${id}: unread=${unreadCount} archived=${archive}`)
    }
})
```

##### `chats.delete`
Chats were deleted (array of chat JIDs).

```ts
sock.ev.on('chats.delete', (ids) => console.log('deleted chats:', ids))
```

##### `lid-mapping.update`
A phone-number ↔ LID pairing was learned. Useful to keep your own identity map in sync.

```ts
sock.ev.on('lid-mapping.update', ({ lid, pn }) => {
    console.log(`identity learned: ${pn} ↔ ${lid}`)
})
```

##### `contacts.upsert`
New contacts (from history sync or phone book sync).

```ts
sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts) console.log('contact:', c.id, c.name || c.notify)
})
```

##### `contacts.update`
Contacts changed — name, profile picture URL, phone number.

```ts
sock.ev.on('contacts.update', (updates) => {
    for (const { id, imgUrl } of updates) console.log(`contact ${id} picture: ${imgUrl}`)
})
```

##### `presence.update`
Someone started/stopped typing, or came online / went offline in a chat.

```ts
sock.ev.on('presence.update', ({ id, presences }) => {
    for (const [participant, presence] of Object.entries(presences)) {
        console.log(`${participant} in ${id}: ${presence.lastKnownPresence}`)
    }
})
```

#### ✉️ Messages

##### `messages.upsert`
New messages. `type: 'notify'` = live, `'append'` = history/offline sync or your own messages from another device.

```ts
sock.ev.on('messages.upsert', ({ messages, type }) => {
    for (const msg of messages) {
        if (!msg.message) continue
        console.log(`[${type}] ${msg.key.remoteJid}:`, msg.message.conversation || '<non-text>')
    }
})
```

##### `messages.update`
Message state changed — delivery status, edits, poll results. Encrypted message edits surface here too (`update.editedMessage`).

```ts
sock.ev.on('messages.update', (updates) => {
    for (const { key, update } of updates) {
        if (update.status) console.log(`${key.id} status -> ${update.status}`)
        if (update.editedMessage) console.log(`${key.id} edited`)
    }
})
```

##### `messages.delete`
Messages were deleted — either specific keys, or a whole chat (`{ jid, all: true }`).

```ts
sock.ev.on('messages.delete', (item) => {
    if ('all' in item) console.log('all messages deleted in', item.jid)
    else console.log('deleted:', item.keys.map(k => k.id))
})
```

##### `messages.media-update`
Media re-upload results for messages whose media expired (success carries fresh `media`, failure carries `error`).

```ts
sock.ev.on('messages.media-update', (updates) => {
    for (const { key, media, error } of updates) {
        console.log(`media for ${key.id}:`, error ? `failed (${error.message})` : 're-uploaded')
    }
})
```

##### `messages.reaction`
A reaction was added (`reaction.text` set) or removed (`reaction.text` empty).

```ts
sock.ev.on('messages.reaction', (reactions) => {
    for (const { key, reaction } of reactions) {
        console.log(`reaction ${reaction.text || '<removed>'} on ${key.id}`)
    }
})
```

##### `message-receipt.update`
Delivery/read receipts per user (in groups: per participant).

```ts
sock.ev.on('message-receipt.update', (updates) => {
    for (const { key, receipt } of updates) {
        console.log(`${key.id}: ${receipt.userJid} -> ${receipt.status}`)
    }
})
```

#### 👥 Groups

##### `groups.upsert`
New groups (created, joined, or from history sync) with full metadata.

```ts
sock.ev.on('groups.upsert', (groups) => {
    for (const g of groups) console.log('group:', g.id, g.subject, `(${g.participants.length} members)`)
})
```

##### `groups.update`
Group metadata changed (subject, description, settings, announce/restrict…).

```ts
sock.ev.on('groups.update', (updates) => {
    for (const { id, subject } of updates) {
        if (subject) console.log(`group ${id} renamed to ${subject}`)
    }
})
```

##### `group-participants.update`
Participants added, removed, promoted or demoted (`action: 'add' | 'remove' | 'promote' | 'demote'`).

```ts
sock.ev.on('group-participants.update', ({ id, author, participants, action }) => {
    console.log(`${action} in ${id} by ${author}:`, participants.map(p => p.id))
})
```

##### `group.join-request`
Someone requested to join (or a request was approved/rejected) in a group with join approval on.

```ts
sock.ev.on('group.join-request', ({ id, participant, action }) => {
    console.log(`join request ${action}: ${participant} -> ${id}`)
    // approve with: await sock.groupRequestParticipantsUpdate(id, [participant], 'approve')
})
```

##### `group.member-tag.update`
A participant's member label (tag) in a group changed.

```ts
sock.ev.on('group.member-tag.update', ({ groupId, participant, label }) => {
    console.log(`${participant} in ${groupId} is now tagged: ${label}`)
})
```

#### 📞 Calls

##### `call`
Call signalling updates (`status: 'offer' | 'ringing' | 'preaccept' | 'accept' | 'reject' | 'terminate' | 'timeout' | …`). Signalling only — carrying call audio needs a media engine (see Voice Calling below).

```ts
sock.ev.on('call', async ([call]) => {
    console.log(`call ${call.id} from ${call.from}: ${call.status}${call.isVideo ? ' (video)' : ''}`)
    if (call.status === 'offer') await sock.rejectCall(call.id, call.from) // or acceptCall / terminateCall
})
```

#### 🏷️ Labels

##### `labels.edit`
A label (WhatsApp Business labels) was created, edited or deleted.

```ts
sock.ev.on('labels.edit', (label) => console.log('label:', label.id, label.name, label.color))
```

##### `labels.association`
A label was attached to or removed from a chat/message.

```ts
sock.ev.on('labels.association', ({ association, type }) => {
    console.log(`label ${type}:`, association)
})
```

#### 🚫 Blocklist

##### `blocklist.set`
Full blocklist replaced. Declared in `BaileysEventMap`; note that in Baileys-X today `fetchBlocklist()` returns the list without emitting, so listen to `blocklist.update` for live changes.

```ts
sock.ev.on('blocklist.set', ({ blocklist }) => console.log('blocklist:', blocklist))
```

##### `blocklist.update`
A user was blocked or unblocked.

```ts
sock.ev.on('blocklist.update', ({ blocklist, type }) => {
    console.log(`${type === 'add' ? 'blocked' : 'unblocked'}:`, blocklist)
})
```

#### 👤 Identity

##### `identity-change`
A contact's identity migrated (phone number ↔ LID), or your own identity changed (`me: true`). Re-resolve cached JIDs when you see this.

```ts
sock.ev.on('identity-change', ({ jid, me }) => {
    console.log(`${me ? 'own' : 'contact'} identity changed: ${jid}`)
})
```

#### 📣 Newsletters (Channels)

##### `newsletter.reaction`
Reaction counts changed on a channel post.

```ts
sock.ev.on('newsletter.reaction', ({ id, server_id, reaction }) => {
    console.log(`channel ${id} post ${server_id}: ${reaction.code} x${reaction.count}`)
})
```

##### `newsletter.view`
View count updated on a channel post.

```ts
sock.ev.on('newsletter.view', ({ id, server_id, count }) => {
    console.log(`channel ${id} post ${server_id}: ${count} views`)
})
```

##### `newsletter-participants.update`
A channel follower's role changed (subscriber/admin actions).

```ts
sock.ev.on('newsletter-participants.update', ({ id, user, new_role, action }) => {
    console.log(`channel ${id}: ${user} ${action} -> ${new_role}`)
})
```

##### `newsletter-settings.update`
Channel settings (name, description, picture, reaction mode…) changed.

```ts
sock.ev.on('newsletter-settings.update', ({ id, update }) => {
    console.log(`channel ${id} settings updated:`, update)
})
```

##### `newsletter-partnership.update`
A channel entered or left a paid partnership (server message id of the notice included).

```ts
sock.ev.on('newsletter-partnership.update', ({ id, server_id }) => {
    console.log(`channel ${id} partnership update (server_id ${server_id})`)
})
```

#### ⚙️ Settings & Limits

##### `message-capping.update`
WhatsApp's per-chat message cap info changed (limits that apply before you can message a chat again).

```ts
sock.ev.on('message-capping.update', (info) => console.log('message capping update:', info))
```

##### `chats.lock`
A chat was locked or unlocked (chat lock / fingerprint-protected chats).

```ts
sock.ev.on('chats.lock', ({ id, locked }) => console.log(`chat ${id} ${locked ? 'locked' : 'unlocked'}`))
```

##### `settings.update`
An account setting synced from another device (locale, privacy settings, status privacy, link previews…).

```ts
sock.ev.on('settings.update', ({ setting, value }) => {
    console.log(`setting ${setting} changed:`, value)
})
```

#### 🔥 Errors

##### `processing.error`
An unexpected error was swallowed while processing a stanza or internal task. It is still written to the logs — this event lets you count or alert on failures live.

```ts
sock.ev.on('processing.error', ({ error, context }) => {
    console.error(`processing failed during '${context}':`, error)
})
```

### Example to Start

> [!NOTE]
> This example includes basic auth storage too

> [!NOTE]
> For reliable serialization of the authentication state, especially when storing as JSON, always use the BufferJSON utility.

```ts
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'

async function connectToWhatsApp () {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
    const sock = makeWASocket({
        // can provide additional config here
        auth: state,
        printQRInTerminal: true
    })
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect)
            // reconnect if not logged out
            if(shouldReconnect) {
                connectToWhatsApp()
            }
        } else if(connection === 'open') {
            console.log('opened connection')
        }
    })
    sock.ev.on('messages.upsert', event => {
        for (const m of event.messages) {
            console.log(JSON.stringify(m, undefined, 2))

            console.log('replying to', m.key.remoteJid)
            await sock.sendMessage(m.key.remoteJid!, { text: 'Hello Word' })
        }
    })

    // to storage creds (session info) when it updates
    sock.ev.on('creds.update', saveCreds)
}
// run in main file
connectToWhatsApp()
```

> [!IMPORTANT]
> In `messages.upsert` it's recommended to use a loop like `for (const message of event.messages)` to handle all messages in array

### Decrypt Poll Votes

- By default poll votes are encrypted and handled in `messages.update`
- That's a simple example
```ts
sock.ev.on('messages.update', event => {
    for(const { key, update } of event) {
        if(update.pollUpdates) {
            const pollCreation = await getMessage(key)
            if(pollCreation) {
                console.log(
                    'got poll update, aggregation: ',
                    getAggregateVotesInPollMessage({
                        message: pollCreation,
                        pollUpdates: update.pollUpdates,
                    })
                )
            }
        }
    }
})
```

- `getMessage` is a [store](#implementing-a-data-store) implementation (in your end)

### Summary of Events on First Connection

1. When you connect first time, `connection.update` will be fired requesting you to restart sock
2. Then, history messages will be received in `messaging.history-set`

## Implementing a Data Store

- Baileys does not come with a defacto storage for chats, contacts, or messages. However, a simple in-memory implementation has been provided. The store listens for chat updates, new messages, message updates, etc., to always have an up-to-date version of the data.

> [!IMPORTANT]
> I highly recommend building your own data store, as storing someone's entire chat history in memory is a terrible waste of RAM.

It can be used as follows:

```ts
import makeWASocket, { makeInMemoryStore } from '@whiskeysockets/baileys'
// the store maintains the data of the WA connection in memory
// can be written out to a file & read from it
const store = makeInMemoryStore({ })
// can be read from a file
store.readFromFile('./baileys_store.json')
// saves the state to a file every 10s
setInterval(() => {
    store.writeToFile('./baileys_store.json')
}, 10_000)

const sock = makeWASocket({ })
// will listen from this socket
// the store can listen from a new socket once the current socket outlives its lifetime
store.bind(sock.ev)

sock.ev.on('chats.upsert', () => {
    // can use 'store.chats' however you want, even after the socket dies out
    // 'chats' => a KeyedDB instance
    console.log('got chats', store.chats.all())
})

sock.ev.on('contacts.upsert', () => {
    console.log('got contacts', Object.values(store.contacts))
})

```

The store also provides some simple functions such as `loadMessages` that utilize the store to speed up data retrieval.

## Whatsapp IDs Explain

- `id` is the WhatsApp ID, called `jid` too, of the person or group you're sending the message to.
    - It must be in the format ```[country code][phone number]@s.whatsapp.net```
	    - Example for people: ```+19999999999@s.whatsapp.net```.
	    - For groups, it must be in the format ``` 123456789-123345@g.us ```.
    - For broadcast lists, it's `[timestamp of creation]@broadcast`.
    - For stories, the ID is `status@broadcast`.
    - With LID addressing, a person may also appear as `[lid]@lid` (or `[lid]@hosted.lid`)
      instead of their phone-number JID. Use the helpers below to convert between the two.

### Resolving LID ↔ Phone Number (`getRealJid` / `getLidForJid`)

Baileys-X exposes the LID mapping store as two socket helpers. Both accept any user JID
(with or without a device suffix, e.g. `12345:2@lid`), return a normalized user JID, and
return `null` when no mapping exists or the input is not a user JID (group, newsletter,
broadcast, invalid input). Lookups consult the in-memory cache first, then persisted
mappings, then a USync fetch — so a first lookup for an unknown contact may hit the network.

```ts
// Who is this @lid sender, really?
const real = await sock.getRealJid('123456789012345@lid')
console.log(real) // '19999999999@s.whatsapp.net', or null if unknown

// Already a phone-number JID? Returned normalized, unchanged:
await sock.getRealJid('19999999999:4@s.whatsapp.net') // '19999999999@s.whatsapp.net'

// The reverse direction — get the LID for a phone-number JID:
const lid = await sock.getLidForJid('19999999999@s.whatsapp.net')
console.log(lid) // '123456789012345@lid', or null if unknown

// Typical use in a message handler: normalize any sender to a phone-number JID
sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
        const sender = m.key.participant ?? m.key.remoteJid
        const phoneJid = sender ? await sock.getRealJid(sender) : null
        console.log('sender (PN):', phoneJid ?? sender)
    }
})
```

## Utility Functions

- `getContentType`, returns the content type for any message
- `getDevice`, returns the device from message
- `makeCacheableSignalKeyStore`, make auth store more fast
- `downloadContentFromMessage`, download content from any message
- `sock.getRealJid` / `sock.getLidForJid`, resolve between LID and phone-number JIDs (see above)
- `newsletterId`, extract the numeric id from a newsletter JID

## Sending Messages

- Send all types of messages with a single function
    - **In the [AnyMessageContent type alias](https://baileys.wiki/docs/api/type-aliases/AnyMessageContent/) you can see all message contents supported, like text message**
    - **In the [MiscMessageGenerationOptions type alias](https://baileys.wiki/docs/api/type-aliases/MiscMessageGenerationOptions/) you can see all options supported, like quote message**

    ```ts
    const jid: string
    const content: AnyMessageContent
    const options: MiscMessageGenerationOptions

    sock.sendMessage(jid, content, options)
    ```

### Non-Media Messages

#### Text Message
```ts
await sock.sendMessage(jid, { text: 'hello word' })
```

#### Quote Message (works with all types)
```ts
await sock.sendMessage(jid, { text: 'hello word' }, { quoted: message })
```

#### Mention User (works with most types)
- @number is to mention in text, it's optional
```ts
await sock.sendMessage(
    jid,
    {
        text: '@12345678901',
        mentions: ['12345678901@s.whatsapp.net']
    }
)
```

#### Forward Messages
- You need to have message object, can be retrieved from [store](#implementing-a-data-store) or use a [message](https://baileys.wiki/docs/api/type-aliases/WAMessage/) object
```ts
const msg = getMessageFromStore() // implement this on your end
await sock.sendMessage(jid, { forward: msg }) // WA forward the message!
```

#### Location Message
```ts
await sock.sendMessage(
    jid,
    {
        location: {
            degreesLatitude: 24.121231,
            degreesLongitude: 55.1121221
        }
    }
)
```
#### Contact Message
```ts
const vcard = 'BEGIN:VCARD\n' // metadata of the contact card
            + 'VERSION:3.0\n'
            + 'FN:Jeff Singh\n' // full name
            + 'ORG:Ashoka Uni;\n' // the organization of the contact
            + 'TEL;type=CELL;type=VOICE;waid=911234567890:+91 12345 67890\n' // WhatsApp ID + phone number
            + 'END:VCARD'

await sock.sendMessage(
    id,
    {
        contacts: {
            displayName: 'Jeff',
            contacts: [{ vcard }]
        }
    }
)
```

#### Reaction Message
- You need to pass the key of message, you can retrieve from [store](#implementing-a-data-store) or use a [key](https://baileys.wiki/docs/api/type-aliases/WAMessageKey/) object
```ts
await sock.sendMessage(
    jid,
    {
        react: {
            text: '💖', // use an empty string to remove the reaction
            key: message.key
        }
    }
)
```

#### Pin Message
- You need to pass the key of message, you can retrieve from [store](#implementing-a-data-store) or use a [key](https://baileys.wiki/docs/api/type-aliases/WAMessageKey/) object

- Time can be:

| Time  | Seconds        |
|-------|----------------|
| 24h    | 86.400        |
| 7d     | 604.800       |
| 30d    | 2.592.000     |

```ts
await sock.sendMessage(
    jid,
    {
        pin: {
            type: 1, // 0 to remove
            time: 86400
            key: message.key
        }
    }
)
```

#### Poll Message
```ts
await sock.sendMessage(
    jid,
    {
        poll: {
            name: 'My Poll',
            values: ['Option 1', 'Option 2', ...],
            selectableCount: 1,
            toAnnouncementGroup: false // or true
        }
    }
)
```

### Sending Messages with Link Previews

1. By default, wa does not have link generation when sent from the web
2. Baileys has a function to generate the content for these link previews
3. To enable this function's usage, add `link-preview-js` as a dependency to your project with `yarn add link-preview-js`
4. Send a link:
```ts
await sock.sendMessage(
    jid,
    {
        text: 'Hi, this was sent using https://github.com/whiskeysockets/baileys'
    }
)
```

### Media Messages

Sending media (video, stickers, images) is easier & more efficient than ever.

> [!NOTE]
> In media messages, you can pass `{ stream: Stream }` or `{ url: Url }` or `Buffer` directly, you can see more in the [WAMediaUpload type alias](https://baileys.wiki/docs/api/type-aliases/WAMediaUpload/)

- When specifying a media url, Baileys never loads the entire buffer into memory; it even encrypts the media as a readable stream.

> [!TIP]
> It's recommended to use Stream or Url to save memory

#### Gif Message
- Whatsapp doesn't support `.gif` files, that's why we send gifs as common `.mp4` video with `gifPlayback` flag
```ts
await sock.sendMessage(
    jid,
    {
        video: fs.readFileSync('Media/ma_gif.mp4'),
        caption: 'hello word',
        gifPlayback: true
    }
)
```

#### Video Message
```ts
await sock.sendMessage(
    id,
    {
        video: {
            url: './Media/ma_gif.mp4'
        },
        caption: 'hello word',
	    ptv: false // if set to true, will send as a `video note`
    }
)
```

#### Audio Message
- To audio message work in all devices you need to convert with some tool like `ffmpeg` with this flags:
    ```bash
        codec: libopus //ogg file
        ac: 1 //one channel
        avoid_negative_ts
        make_zero
    ```
    - Example:
    ```bash
    ffmpeg -i input.mp4 -avoid_negative_ts make_zero -ac 1 output.ogg
    ```
```ts
await sock.sendMessage(
    jid,
    {
        audio: {
            url: './Media/audio.mp3'
        },
        mimetype: 'audio/mp4'
    }
)
```

#### Image Message
```ts
await sock.sendMessage(
    id,
    {
        image: {
            url: './Media/ma_img.png'
        },
        caption: 'hello word'
    }
)
```

#### Sticker Message
```ts
await sock.sendMessage(
    jid,
    {
        sticker: {
            url: './Media/sticker.webp'
        }
    }
)
// animated / lottie stickers:
await sock.sendMessage(jid, { sticker: { url: './sticker.json' }, isLottie: true })
```

#### Document Message
```ts
await sock.sendMessage(
    jid,
    {
        document: {
            url: './Media/report.pdf'
        },
        fileName: 'report.pdf',
        mimetype: 'application/pdf',
        caption: 'quarterly report'
    }
)
```

#### View Once Message

- You can send all messages above as `viewOnce`, you only need to pass `viewOnce: true` in content object

```ts
await sock.sendMessage(
    id,
    {
        image: {
            url: './Media/ma_img.png'
        },
        viewOnce: true, //works with video, audio too
        caption: 'hello word'
    }
)
```

### Interactive Messages

Baileys supports WhatsApp's interactive message families: reply buttons, lists, native flow
buttons, template buttons and carousels. All of them are passed directly as the message content.

#### Reply Buttons
```ts
await sock.sendMessage(jid, {
    text: 'Pick one',
    footer: 'Powered by Baileys',
    buttons: [
        { buttonId: 'yes', buttonText: 'Yes', type: 1 },
        { buttonId: 'no', buttonText: 'No', type: 1 }
    ]
})
```

#### List Message
```ts
await sock.sendMessage(jid, {
    text: 'Choose an option',
    title: 'Menu',
    footer: 'Powered by Baileys',
    buttonText: 'Open list',
    sections: [
        {
            title: 'Drinks',
            rows: [
                { title: 'Coffee', rowId: 'coffee' },
                { title: 'Tea', rowId: 'tea', description: 'Green or black' }
            ]
        }
    ]
})
```

#### Native Flow Buttons
```ts
await sock.sendMessage(jid, {
    text: 'Order here',
    footer: 'Powered by Baileys',
    nativeFlow: [
        { id: 'order', text: 'Order', icon: 'DEFAULT' },
        { url: 'https://example.com', text: 'Visit website' },
        { copy: 'SAVE10', text: 'Copy coupon' },
        { call: '+15551234567', text: 'Call us' }
    ]
})
```
Use `name` + `paramsJson` for advanced native flow buttons that are not covered by the helpers.

#### Template Buttons
```ts
await sock.sendMessage(jid, {
    text: 'Confirm your order',
    footer: 'Powered by Baileys',
    templateButtons: [
        { index: 1, url: 'https://example.com', text: 'Open website' },
        { index: 2, call: '+15551234567', text: 'Call us' },
        { index: 3, id: 'confirm', text: 'Confirm' }
    ]
})
```

#### Carousel
```ts
await sock.sendMessage(jid, {
    text: 'Our menu',
    footer: 'Swipe for more',
    cards: [
        { image: { url: './card-1.png' }, caption: 'Card one', nativeFlow: [{ id: 'one', text: 'Pick one' }] },
        { image: { url: './card-2.png' }, caption: 'Card two', nativeFlow: [{ url: 'https://example.com', text: 'Open' }] }
    ]
})
```

- Interactive messages accept an optional media header (`image`, `video`, `document`, `audio`,
  `location` or `product`) alongside `text`.
- Pass `interactiveAsTemplate: true` to wrap an `interactiveMessage` in a
  `templateMessage.interactiveMessageTemplate`, which some clients render instead.
- In private chats, pass `ai: true` to show the Meta AI badge on the outgoing message.

### Albums
Send an album by passing `album` with two or more media items. Baileys posts an `albumMessage`
header and then relays each item with `messageAssociation.associationType = MEDIA_ALBUM`, so
WhatsApp groups them in the chat.
```ts
await sock.sendMessage(jid, {
    album: [
        { image: { url: './one.png' }, caption: 'One' },
        { image: { url: './two.png' }, caption: 'Two' },
        { video: { url: './three.mp4' }, caption: 'Three' }
    ]
}, { delayMs: 1500 })
```
- `delayMs` (default `1500`) is the pause between the album items.
- You can also build the header yourself with
  `{ album: { expectedImageCount: 2, expectedVideoCount: 1 } }`, or attach an existing media
  message to an album using `albumParentKey`.
- Expecting fewer than two media items throws a `Boom` with status code `400`.

### Additional Message Types
The following contents are supported through `sendMessage`:

| Content | Description |
|---|---|
| `keep: WAMessageKey` (+ `type`) | Keep (or `KeepType.UNDO` to unkeep) a message in the chat |
| `flowReply: { ... }` | Response to a WhatsApp Flow (`flowReply` options) |
| `pollResult: { name, votes, pollType }` | Poll result snapshot |
| `pollUpdate: { key, vote }` | Vote on an existing poll |
| `paymentInviteServiceType` | Payment invite message |
| `orderText`, `itemCount`, `thumbnail` | Order message for a business catalog |
| `requestPaymentFrom`, `amount1000`, `currencyCodeIso4217` | Request a payment |
| `invoiceNote` (+ `image` or `document`) | Invoice note attached to a receipt |
| `externalAdReply: { ... }` | External ad reply attached to text or media |
| `raw: WAMessageContent` | Send a hand-built protobuf message, bypassing the builders |
| `secureMetaServiceLabel: true` | Force the `biz` node on the stanza (WA Web's secure Meta service label) |

#### Event Message

```ts
await sock.sendMessage(jid, {
    event: {
        name: 'Baileys-X Meetup',
        description: 'Monthly catch-up',
        startDate: new Date('2026-11-01T18:00:00Z'),
        endDate: new Date('2026-11-01T19:00:00Z'),
        extraGuestsAllowed: true
    }
})
```

#### Payment Messages

```ts
import { proto } from '@whiskeysockets/baileys'

// invite the chat to pay via a payment service
await sock.sendMessage(jid, {
    paymentInviteServiceType: proto.Message.PaymentInviteMessage.ServiceType.UPI
})

// request a payment (amount1000 = amount × 1000)
await sock.sendMessage(jid, {
    requestPaymentFrom: jid,
    amount1000: 5000,
    currencyCodeIso4217: 'USD',
    text: 'Please pay for lunch'
})

// invoice note attached to an image or document receipt
await sock.sendMessage(jid, {
    invoiceNote: 'Invoice #42',
    image: { url: './receipt.png' }
})
```

#### Poll Result & Poll Votes

```ts
// publish a result snapshot for a poll
await sock.sendMessage(jid, {
    pollResult: {
        name: 'Lunch?',
        votes: [
            { name: 'Pizza', voteCount: 3 },
            { name: 'Sushi', voteCount: 1 }
        ]
    }
})

// vote on an existing poll (vote = IPollEncValue from the poll's vote handling)
await sock.sendMessage(jid, { pollUpdate: { key: pollKey, vote } })

// cast a vote by option name — the vote encryption is handled for you.
// pollEncKey is the poll creation message's messageContextInfo.messageSecret;
// both JIDs are device-less, in the chat's addressing mode (LID or phone number).
// An empty selectedOptions list withdraws your vote.
await sock.sendMessage(jid, {
    pollVote: {
        pollCreationMessageKey: pollKey,
        pollEncKey,
        selectedOptions: ['Pizza'],
        pollCreatorJid: creatorJid,
        voterJid: myJid
    }
})
```

#### Keep & Flow Reply

```ts
import { proto } from '@whiskeysockets/baileys'

// keep a message in the chat (KeepType.UNDO to unkeep)
await sock.sendMessage(jid, { keep: msg.key, type: proto.KeepType.KEEP_FOR_ALL })

// reply to a WhatsApp Flow
await sock.sendMessage(jid, {
    flowReply: { text: 'Done', name: 'booking_flow', paramsJson: '{}' }
})
```

#### Status Mention & Group Status

```ts
// an ARRAY of JIDs publishes a status and mentions each chat in a follow-up message
await sock.sendMessage(['19999999999@s.whatsapp.net', groupJid], {
    image: { url: './status.png' },
    caption: 'mentioning you'
})

// post a group status inside a group chat
await sock.sendMessage(groupJid, { text: 'group announcement', groupStatus: true })
```

Message wrappers can be requested for any supported content:

```ts
await sock.sendMessage(jid, { image: { url: './image.png' }, viewOnce: true })
await sock.sendMessage(jid, { image: { url: './image.png' }, viewOnceV2: true })
await sock.sendMessage(jid, { image: { url: './image.png' }, viewOnceV2Extension: true })
await sock.sendMessage(jid, { text: 'bye', ephemeral: true })
await sock.sendMessage(jid, { sticker: { url: './sticker.webp' }, isLottie: true })
await sock.sendMessage(jid, { text: 'group update', groupStatus: true }) // in a group
```

### Newsletter (Channel) Messages
- Newsletters accept the same media and interactive contents; media is uploaded as a channel
  upload and the message carries the returned media handle.
- Editing a channel message uses the channel edit tag automatically:
  `await sock.sendMessage(channelJid, { text: 'fixed typo', edit: key })`.
- Quoting works inside a channel. The quote points at the channel and deliberately omits
  `remoteJid`, which channel messages do not expect:
  `await sock.sendMessage(channelJid, { text: 'replying', quoted: channelMessage })`.
- Quiz polls (`poll.pollType`) are allowed for newsletters only.

## Modify Messages

### Deleting Messages (for everyone)

```ts
const msg = await sock.sendMessage(jid, { text: 'hello word' })
await sock.sendMessage(jid, { delete: msg.key })
```

**Note:** deleting for oneself is supported via `chatModify`, see in [this section](#modifying-chats)

### Editing Messages

- You can pass all editable contents here
```ts
await sock.sendMessage(jid, {
      text: 'updated text goes here',
      edit: response.key,
    });
```

## Manipulating Media Messages

### Thumbnail in Media Messages
- For media messages, the thumbnail can be generated automatically for images & stickers provided you add `jimp` or `sharp` as a dependency in your project using `yarn add jimp` or `yarn add sharp`.
- Thumbnails for videos can also be generated automatically, though, you need to have `ffmpeg` installed on your system.

### Downloading Media Messages

If you want to save the media you received
```ts
import { createWriteStream } from 'fs'
import { downloadMediaMessage, getContentType } from '@whiskeysockets/baileys'

sock.ev.on('messages.upsert', async ({ [m] }) => {
    if (!m.message) return // if there is no text or media message
    const messageType = getContentType(m) // get what type of message it is (text, image, video...)

    // if the message is an image
    if (messageType === 'imageMessage') {
        // download the message
        const stream = await downloadMediaMessage(
            m,
            'stream', // can be 'buffer' too
            { },
            {
                logger,
                // pass this so that baileys can request a reupload of media
                // that has been deleted
                reuploadRequest: sock.updateMediaMessage
            }
        )
        // save to file
        const writeStream = createWriteStream('./my-download.jpeg')
        stream.pipe(writeStream)
    }
}
```

### Re-upload Media Message to Whatsapp

- WhatsApp automatically removes old media from their servers. For the device to access said media -- a re-upload is required by another device that has it. This can be accomplished using:
```ts
await sock.updateMediaMessage(msg)
```

## Reject Call

- You can obtain `callId` and `callFrom` from `call` event

```ts
await sock.rejectCall(callId, callFrom)
```

## Voice Calling

Baileys-X ships a complete WhatsApp voice-calling engine in-tree
(`src/VoIP`), adopted from
[baileys-voip](https://github.com/SheIITear/baileys-voip) and rewired onto
Baileys-X's own LID/session machinery. The core socket stays exactly as
light as before — calling is a deep import, and chat-only users install
nothing extra.

**What you get**

- Place real 1:1 voice calls with end-to-end encrypted call keys
  (Signal per-device `<enc>`), SRTP media, and WhatsApp relay transport
- In-call signaling (accept / preaccept / terminate / reject) fed to the
  engine automatically
- Peer audio decoded to Float32 PCM (16 kHz mono) for playback, recording,
  or piping into speech pipelines
- The vendored MLow codec (WASM) and WARP/SRTP/SFrame protocol layers,
  exported for lower-level use

**Requirements**

- A system `ffmpeg` binary on `PATH` (audio decode/encode)
- For the default WebRTC relay transport: the optional peer dependency
  `@roamhq/wrtc` — install it only if you make calls:

```bash
npm install @roamhq/wrtc   # or: yarn add @roamhq/wrtc
```

### Place a call

Call `attachCalling` once the connection is open (your LID is required):

```ts
import { attachCalling } from 'baileys/lib/VoIP/index.js'

sock.ev.on('connection.update', async ({ connection }) => {
    if (connection !== 'open') return

    const calling = await attachCalling(sock, {
        // ffmpeg can decode this: a file, an `lavfi:` spec, a device URI…
        audioSource: 'audio/hello.mp3',
        onAudio: samples => {
            // Float32Array of peer speech @ 16 kHz — play it, save it,
            // or feed it to your ASR/TTS pipeline
        },
        onLog: (level, msg) => console.log(`[voip:${level}]`, msg)
    })

    const callId = await calling.placeCall('15551234567') // digits or PN JID
    // …later:
    await calling.endCall(callId)
    calling.detach() // stop listening & destroy the engine
})
```

Options:

| Option | Default | Purpose |
| --- | --- | --- |
| `audioSource` | `lavfi:sine=frequency=440` | Audio streamed to the peer (any ffmpeg input) |
| `transport` | `'rtc'` | `'rtc'` = WebRTC DataChannel relay (needs `@roamhq/wrtc`); `'udp'` = raw UDP, testing only |
| `onAudio` | — | Decoded peer audio callback |
| `onLog` | silent | Engine/transport logs |
| `onCallNode` | — | Every inbound `<call>` child node (offers included) |

The handle also exposes `calling.voip` (the engine itself — stats, SSRCs,
group/SFrame layers) and `calling.feedCallNode(node)` to inject stanzas
manually. Everything is also exported individually from
`baileys/lib/VoIP/index.js` (`WhatsAppVoipNode`, `buildOfferStanza`,
`extractOfferEnc`, SRTP/WARP helpers, …).

### Incoming calls

Every inbound stanza is reported twice:

- `sock.ev.on('call')` — the friendly parsed event; `call.rawNode` now
  carries the full signaling node (including the `<enc>` call key and
  `<relay>` children the parsed fields don't model)
- `onCallNode(child, callNode)` on the calling handle — sees offers plus
  every in-call stanza as it arrives

Stanzas for calls **you** placed (accept, preaccept, terminate, …) are fed
to the engine automatically. Answering an incoming offer is deliberately
left to you — the pieces are exported:

```ts
import { extractOfferEnc, decryptInboundCallKey, parseInboundOfferLid } from 'baileys/lib/VoIP/index.js'

onCallNode: async (child, callNode) => {
    if (child.tag !== 'offer') return
    const myLidJid = sock.authState.creds.me.lid
    const enc = extractOfferEnc(child.content as BinaryNode[], myLidJid)
    const callKey = enc && (await decryptInboundCallKey(sock, enc, parseInboundOfferLid(child)))
    if (!callKey) return // not addressed to us / undecryptable
    calling.voip.setE2ECallKey(callKey, myLidJid, parseInboundOfferLid(child))
    calling.feedCallNode(callNode) // engine now tracks the call
    await sock.acceptCall(child.attrs['call-id'], child.attrs['call-creator'])
}
```

> ⚠️ Calling is unofficial-client protocol work: it can break as WhatsApp
> changes its VoIP stack, and misuse can get numbers banned. The engine has
> no upstream test suite — Baileys-X unit-tests the protocol pieces and
> glue, but only ever verify calls with your own test numbers.

## Send States in Chat

### Reading Messages
- A set of message [keys](https://baileys.wiki/docs/api/type-aliases/WAMessageKey/) must be explicitly marked read now.
- You cannot mark an entire 'chat' read as it were with Baileys Web.
This means you have to keep track of unread messages.

```ts
const key: WAMessageKey
// can pass multiple keys to read multiple messages as well
await sock.readMessages([key])
```

The message ID is the unique identifier of the message that you are marking as read.
On a `WAMessage`, the `messageID` can be accessed using ```messageID = message.key.id```.

### Update Presence

- ``` presence ``` can be one of the values in the [WAPresence type alias](https://baileys.wiki/docs/api/type-aliases/WAPresence/)
- The presence expires after about 10 seconds.
- This lets the person/group with `jid` know whether you're online, offline, typing etc.

```ts
await sock.sendPresenceUpdate('available', jid)
```

> [!NOTE]
> If a desktop client is active, WA doesn't send push notifications to the device. If you would like to receive said notifications -- mark your Baileys client offline using `sock.sendPresenceUpdate('unavailable')`

## Modifying Chats

WA uses an encrypted form of communication to send chat/app updates. This has been implemented mostly and you can send the following updates:

> [!IMPORTANT]
> If you mess up one of your updates, WA can log you out of all your devices and you'll have to log in again.

### Archive a Chat
```ts
const lastMsgInChat = await getLastMessageInChat(jid) // implement this on your end
await sock.chatModify({ archive: true, lastMessages: [lastMsgInChat] }, jid)
```
### Mute/Unmute a Chat

- Supported times:

| Time  | Miliseconds     |
|-------|-----------------|
| Remove | null           |
| 8h     | 86.400.000     |
| 7d     | 604.800.000    |

```ts
// mute for 8 hours
await sock.chatModify({ mute: 8 * 60 * 60 * 1000 }, jid)
// unmute
await sock.chatModify({ mute: null }, jid)
```
### Mark a Chat Read/Unread
```ts
const lastMsgInChat = await getLastMessageInChat(jid) // implement this on your end
// mark it unread
await sock.chatModify({ markRead: false, lastMessages: [lastMsgInChat] }, jid)
```

### Delete a Message for Me
```ts
await sock.chatModify(
    {
        clear: {
            messages: [
                {
                    id: 'ATWYHDNNWU81732J',
                    fromMe: true,
                    timestamp: '1654823909'
                }
            ]
        }
    },
    jid
)

```
### Delete a Chat
```ts
const lastMsgInChat = await getLastMessageInChat(jid) // implement this on your end
await sock.chatModify({
        delete: true,
        lastMessages: [
            {
                key: lastMsgInChat.key,
                messageTimestamp: lastMsgInChat.messageTimestamp
            }
        ]
    },
    jid
)
```
### Pin/Unpin a Chat
```ts
await sock.chatModify({
        pin: true // or `false` to unpin
    },
    jid
)
```
### Star/Unstar a Message
```ts
await sock.chatModify({
        star: {
            messages: [
                {
                    id: 'messageID',
                    fromMe: true // or `false`
                }
            ],
            star: true // - true: Star Message; false: Unstar Message
        }
    },
    jid
)
```

### Disappearing Messages

- Ephemeral can be:

| Time  | Seconds        |
|-------|----------------|
| Remove | 0          |
| 24h    | 86.400     |
| 7d     | 604.800    |
| 90d    | 7.776.000  |

- You need to pass in **Seconds**, default is 7 days

```ts
// turn on disappearing messages
await sock.sendMessage(
    jid,
    // this is 1 week in seconds -- how long you want messages to appear for
    { disappearingMessagesInChat: WA_DEFAULT_EPHEMERAL }
)

// will send as a disappearing message
await sock.sendMessage(jid, { text: 'hello' }, { ephemeralExpiration: WA_DEFAULT_EPHEMERAL })

// turn off disappearing messages
await sock.sendMessage(
    jid,
    { disappearingMessagesInChat: false }
)
```

## User Querys

### Check If ID Exists in Whatsapp
```ts
const [result] = await sock.onWhatsApp(jid)
if (result.exists) console.log (`${jid} exists on WhatsApp, as jid: ${result.jid}`)
```

### Query Chat History (groups too)

- You need to have oldest message in chat
```ts
const msg = await getOldestMessageInChat(jid) // implement this on your end
await sock.fetchMessageHistory(
    50, //quantity (max: 50 per query)
    msg.key,
    msg.messageTimestamp
)
```
- Messages will be received in `messaging.history-set` event

### Fetch Status
```ts
const status = await sock.fetchStatus(jid)
console.log('status: ' + status)
```

### Fetch Profile Picture (groups too)
- To get the display picture of some person/group
```ts
// for low res picture
const ppUrl = await sock.profilePictureUrl(jid)
console.log(ppUrl)

// for high res picture
const ppUrl = await sock.profilePictureUrl(jid, 'image')
```

### Fetch Bussines Profile (such as description or category)
```ts
const profile = await sock.getBusinessProfile(jid)
console.log('business description: ' + profile.description + ', category: ' + profile.category)
```

### Fetch Someone's Presence (if they're typing or online)
```ts
// the presence update is fetched and called here
sock.ev.on('presence.update', console.log)

// request updates for a chat
await sock.presenceSubscribe(jid)
```

## Change Profile

### Change Profile Status
```ts
await sock.updateProfileStatus('Hello World!')
```
### Change Profile Name
```ts
await sock.updateProfileName('My name')
```
### Change Display Picture (groups too)
- To change your display picture or a group's

> [!NOTE]
> Like media messages, you can pass `{ stream: Stream }` or `{ url: Url }` or `Buffer` directly, you can see more in the [WAMediaUpload type alias](https://baileys.wiki/docs/api/type-aliases/WAMediaUpload/)

```ts
await sock.updateProfilePicture(jid, { url: './new-profile-picture.jpeg' })
```
### Remove display picture (groups too)
```ts
await sock.removeProfilePicture(jid)
```

## Groups

- To change group properties you need to be admin

### Create a Group
```ts
// title & participants
const group = await sock.groupCreate('My Fab Group', ['1234@s.whatsapp.net', '4564@s.whatsapp.net'])
console.log('created group with id: ' + group.gid)
await sock.sendMessage(group.id, { text: 'hello there' }) // say hello to everyone on the group
```
### Add/Remove or Demote/Promote
```ts
// id & people to add to the group (will throw error if it fails)
await sock.groupParticipantsUpdate(
    jid,
    ['abcd@s.whatsapp.net', 'efgh@s.whatsapp.net'],
    'add' // replace this parameter with 'remove' or 'demote' or 'promote'
)
```
### Change Subject (name)
```ts
await sock.groupUpdateSubject(jid, 'New Subject!')
```
### Change Description
```ts
await sock.groupUpdateDescription(jid, 'New Description!')
```
### Change Settings
```ts
// only allow admins to send messages
await sock.groupSettingUpdate(jid, 'announcement')
// allow everyone to send messages
await sock.groupSettingUpdate(jid, 'not_announcement')
// allow everyone to modify the group's settings -- like display picture etc.
await sock.groupSettingUpdate(jid, 'unlocked')
// only allow admins to modify the group's settings
await sock.groupSettingUpdate(jid, 'locked')
```
### Leave a Group
```ts
// will throw error if it fails
await sock.groupLeave(jid)
```
### Get Invite Code
- To create link with code use `'https://chat.whatsapp.com/' + code`
```ts
const code = await sock.groupInviteCode(jid)
console.log('group code: ' + code)
```
### Revoke Invite Code
```ts
const code = await sock.groupRevokeInvite(jid)
console.log('New group code: ' + code)
```
### Join Using Invitation Code
- Code can't have `https://chat.whatsapp.com/`, only code
```ts
const response = await sock.groupAcceptInvite(code)
console.log('joined to: ' + response)
```
### Get Group Info by Invite Code
```ts
const response = await sock.groupGetInviteInfo(code)
console.log('group information: ' + response)
```
### Query Metadata (participants, name, description...)
```ts
const metadata = await sock.groupMetadata(jid)
console.log(metadata.id + ', title: ' + metadata.subject + ', description: ' + metadata.desc)
```
### Join using `groupInviteMessage`
```ts
const response = await sock.groupAcceptInviteV4(jid, groupInviteMessage)
console.log('joined to: ' + response)
```
### Get Request Join List
```ts
const response = await sock.groupRequestParticipantsList(jid)
console.log(response)
```
### Approve/Reject Request Join
```ts
const response = await sock.groupRequestParticipantsUpdate(
    jid, // group id
    ['abcd@s.whatsapp.net', 'efgh@s.whatsapp.net'],
    'approve' // or 'reject'
)
console.log(response)
```
### Get All Participating Groups Metadata
```ts
const response = await sock.groupFetchAllParticipating()
console.log(response)
```
### Toggle Ephemeral

- Ephemeral can be:

| Time  | Seconds        |
|-------|----------------|
| Remove | 0          |
| 24h    | 86.400     |
| 7d     | 604.800    |
| 90d    | 7.776.000  |

```ts
await sock.groupToggleEphemeral(jid, 86400)
```

### Change Add Mode
```ts
await sock.groupMemberAddMode(
    jid,
    'all_member_add' // or 'admin_add'
)
```

## Privacy

### Block/Unblock User
```ts
await sock.updateBlockStatus(jid, 'block') // Block user
await sock.updateBlockStatus(jid, 'unblock') // Unblock user
```
### Get Privacy Settings
```ts
const privacySettings = await sock.fetchPrivacySettings(true)
console.log('privacy settings: ' + privacySettings)
```
### Get BlockList
```ts
const response = await sock.fetchBlocklist()
console.log(response)
```
### Update LastSeen Privacy
```ts
const value = 'all' // 'contacts' | 'contact_blacklist' | 'none'
await sock.updateLastSeenPrivacy(value)
```
### Update Online Privacy
```ts
const value = 'all' // 'match_last_seen'
await sock.updateOnlinePrivacy(value)
```
### Update Profile Picture Privacy
```ts
const value = 'all' // 'contacts' | 'contact_blacklist' | 'none'
await sock.updateProfilePicturePrivacy(value)
```
### Update Status Privacy
```ts
const value = 'all' // 'contacts' | 'contact_blacklist' | 'none'
await sock.updateStatusPrivacy(value)
```
### Update Read Receipts Privacy
```ts
const value = 'all' // 'none'
await sock.updateReadReceiptsPrivacy(value)
```
### Update Groups Add Privacy
```ts
const value = 'all' // 'contacts' | 'contact_blacklist'
await sock.updateGroupsAddPrivacy(value)
```
### Update Default Disappearing Mode

- Like [this](#disappearing-messages), ephemeral can be:

| Time  | Seconds        |
|-------|----------------|
| Remove | 0          |
| 24h    | 86.400     |
| 7d     | 604.800    |
| 90d    | 7.776.000  |

```ts
const ephemeral = 86400
await sock.updateDefaultDisappearingMode(ephemeral)
```

## Broadcast Lists & Stories

### Send Broadcast & Stories
- Messages can be sent to broadcasts & stories. You need to add the following message options in sendMessage, like this:
```ts
await sock.sendMessage(
    jid,
    {
        image: {
            url: url
        },
        caption: caption
    },
    {
        backgroundColor: backgroundColor,
        font: font,
        statusJidList: statusJidList,
        broadcast: true
    }
)
```
- Message body can be a `extendedTextMessage` or `imageMessage` or `videoMessage` or `voiceMessage`, see the [AnyRegularMessageContent type alias](https://baileys.wiki/docs/api/type-aliases/AnyRegularMessageContent/)
- You can add `backgroundColor` and other options in the message options, see the [MiscMessageGenerationOptions type alias](https://baileys.wiki/docs/api/type-aliases/MiscMessageGenerationOptions/)
- `broadcast: true` enables broadcast mode
- `statusJidList`: a list of people that you can get which you need to provide, which are the people who will get this status message.

- You can send messages to broadcast lists the same way you send messages to groups & individual chats.
- Right now, WA Web does not support creating broadcast lists, but you can still delete them.
- Broadcast IDs are in the format `12345678@broadcast`
### Mention Chats in a Status
Pass an array of JIDs as the first argument to `sendMessage` to publish one status and mention
the given users (or all participants of the given groups). Baileys relays the status to
`status@broadcast` with the `mentioned_users` metadata, then sends an `is_status_mention` /
`is_group_status_mention` message into each chat so they get notified.
```ts
await sock.sendMessage(
    ['12345678901@s.whatsapp.net', '123456789-987654321@g.us'],
    { text: 'New drop is live', font: 1 }
)
```
- `delayMs` (default `1500`) is the pause after each mention message.
- Group JIDs are expanded to their participants before the status is sent.
- The status content must be a regular status type (text, image, video, audio); the mention
  wrapper uses `buildStatusMentionContent` internally.

### Query a Broadcast List's Recipients & Name
```ts
const bList = await sock.getBroadcastListInfo('1234@broadcast')
console.log (`list name: ${bList.name}, recps: ${bList.recipients}`)
```

## Baileys-X Additions

Everything in this section is Baileys-X functionality on top of upstream Baileys.
All of it is typed, covered by the test suite, and available on the normal socket
returned by `makeWASocket` — no extra imports beyond what each example shows.

### Message Types — Quick Reference

Every content type accepted by `sock.sendMessage(jid, content, options)`, with a
minimal example. Types marked † are Baileys-X additions; the rest are documented in
detail in the sections above.

| Content | Example |
|---|---|
| Text | `{ text: 'hello' }` |
| Image | `{ image: { url: './a.jpg' }, caption: 'hi' }` |
| Video | `{ video: { url: './a.mp4' }, caption: 'hi' }` |
| GIF | `{ video: { url: './a.mp4' }, gifPlayback: true }` |
| Audio / voice note | `{ audio: { url: './a.mp3' }, ptt: true }` |
| Document | `{ document: { url: './a.pdf' }, fileName: 'a.pdf' }` |
| Sticker | `{ sticker: { url: './a.webp' } }` |
| Location | `{ location: { degreesLatitude: 1.23, degreesLongitude: 4.56 } }` |
| Contact | `{ contacts: { displayName: 'Ada', contacts: [{ vcard }] } }` |
| Reaction | `{ react: { text: '❤️', key: msg.key } }` |
| Pin | `{ pin: { type: 1, time: 86400, key: msg.key } }` |
| Poll | `{ poll: { name: 'Lunch?', values: ['A', 'B'], selectableCount: 1 } }` |
| Poll vote | `{ pollVote: { pollCreationMessageKey, pollEncKey, selectedOptions: ['A'], pollCreatorJid, voterJid } }` |
| Event | `{ event: { name: 'Meetup', startDate: new Date() } }` |
| Album † | `{ album: [{ image: { url: './1.jpg' } }, { image: { url: './2.jpg' } }] }` |
| Buttons / list / Native Flow / carousel † | `{ text: 'Pick', nativeFlow: [{ id: 'a', text: 'A' }] }` (see Interactive Messages) |
| Product / order / payment † | `{ orderText: 'Order', itemCount: 2, thumbnail: imgBuffer }`, `{ requestPaymentFrom: jid, amount1000: 5000, currencyCodeIso4217: 'USD', text: 'Please pay' }` |
| Poll result / vote † | `{ pollResult: { name: 'Lunch?', votes: [{ name: 'A', voteCount: 3 }] } }`, `{ pollUpdate: { key, vote } }` |
| Group status † | `{ text: 'group update', groupStatus: true }` |
| Status mention † | `sock.sendMessage([jid1, jid2], { image: { url: './a.jpg' } })` — an **array** of JIDs publishes a status and mentions each chat in a follow-up message |
| View-once wrappers † | `{ image: { url: './a.jpg' }, viewOnce: true }` |
| Forward / delete / edit | `{ forward: msg }`, `{ delete: msg.key }`, `{ text: 'fixed', edit: msg.key }` |
| Raw protobuf † | `{ raw: { conversation: 'hand-built' } }` — bypasses the builders |
| Rich / HTML † | via `AIRich` / `sock.sendHtml` — see Rich Responses below |
| Rich table / code † | `sock.sendRichTable(jid, rows)` / `sock.sendRichCode(jid, code)` — see Rich Responses below |
| Sticker pack † | `{ stickerPack: { name, publisher, cover, stickers: [{ sticker }] } }` |

Common `options` for every send: `{ quoted: msg }`, `{ ephemeralExpiration: 86400 }`,
`{ statusJidList: [...] }` (status audience), `{ delayMs: 1500 }` (albums/status batches).

### Username API

WhatsApp Username API

WhatsApp usernames (as opposed to phone-number JIDs), via MEX GraphQL queries:

```ts
// Is a username available? Suggestions come back when it isn't.
const check = await sock.checkUsername('cosmic_bug')
console.log(check.available, check.suggestions)

// Claim / release your own username
await sock.setUsername('cosmic_bug')
await sock.setUsernamePin('123456')
console.log(await sock.getMyUsername())
await sock.deleteUsername()

// Look users up by username, and fetch usernames for known JIDs
const found = await sock.findUserByUsername('cosmic_bug') // { jid, contact } | null
const names = await sock.fetchContactUsernames('19999999999@s.whatsapp.net')
```

### AI Groups

Create and manage groups that include the Meta AI bot
(default bot `867051314767696@bot`):

```ts
const group = await sock.aiGroupCreate('Study Group', ['19999999999@s.whatsapp.net'])
await sock.aiGroupAddBot(group.id)
await sock.aiGroupParticipantsUpdate(group.id, ['18888888888@s.whatsapp.net'], 'add')
await sock.aiGroupUpdateSubject(group.id, 'Study Group 📚')
const code = await sock.aiGroupInviteCode(group.id)
console.log(await sock.aiGroupMetadata(group.id))
await sock.aiGroupLeave(group.id)
```

### Interop (third-party app interop)

Manage interoperability with external apps (BirdyChat, Haiket) and report
cross-app spam:

```ts
await sock.initInterop()                       // fetch integrators + opt-in state
const integrators = await sock.fetchIntegrators()
await sock.optInIntegrators()                  // default: BirdyChat + Haiket
const user = await sock.resolveInteropUser('external-id', 12) // BirdyChat = 12
await sock.reportInteropSpam('1234567890@interop')            // default flow shown
await sock.trustInteropContact('1234567890@interop')
await sock.updateInteropBlockStatus('1234567890@interop', 'block')
```

### Rich Responses — `AIRich`, `Toolkit`, `sendHtml`, `sendInteractive`

Build Meta AI-style rich responses (headings, tables, code with syntax
highlighting, LaTeX, inline links/entities) and send HTML content:

```ts
import { AIRich, Toolkit } from '@whiskeysockets/baileys'

const rich = new AIRich()
    .setTitle('Daily Report')
    .addText('Hello **world**, see [docs](<https://example.com>)')
    .addTable([['Name', 'Score'], ['Ada', '42']])
    .addCode('ts', 'const x: number = 1')
    .setFooter('generated by Baileys-X')
await rich.send(sock, jid)

// Raw HTML rendered through the rich-response HTML primitive (unofficial —
// rendering depends on the recipient's client):
await sock.sendHtml(jid, '<h1>Hello</h1><p>from Baileys-X</p>')

// One-call sugar over the same AIRich engine:
await sock.sendRichTable(jid, [['Name', 'Score'], ['Ada', '42'], ['Grace', '37']])
await sock.sendRichCode(jid, 'const x: number = 1', { language: 'typescript' })

// Native-flow "in-app signup" style message (falls back to plain text on iOS):
await sock.sendInteractive(jid, 'Tap to continue', { title: 'Welcome' })

// Toolkit exposes the inline-entity extractor used by the builder:
const entities = Toolkit.extractIE('Hello **world**')
```

### Call Signalling

Accept or terminate incoming calls (signalling only — for full call media
use the built-in engine, see [Voice Calling](#voice-calling)):

```ts
sock.ev.on('call', async ([call]) => {
    if (call.status === 'offer') {
        await sock.acceptCall(call.id, call.from)
        // ... hand media to your engine ...
        await sock.terminateCall(call.id, call.from)
    }
})
await sock.rejectCall(callId, callFrom) // decline instead (see Reject Call above)
```

### Newsletter Helpers

```ts
import { newsletterId } from '@whiskeysockets/baileys'

newsletterId('12345678901234567890@newsletter') // '12345678901234567890'
newsletterId('not-a-channel@g.us')              // null
```

### Socket Config — Full Reference

Every `makeWASocket` option, with its default. Only `auth` is effectively
required; everything else can be omitted.

```ts
import makeWASocket, { Browsers, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys'

const sock = makeWASocket({
    // --- connection ---
    version: [2, 3000, 1049974625],        // WA Web version tuple (pinned by the repo)
    browser: Browsers.macOS('Chrome'),     // client identity presented to WA
    waWebSocketUrl: 'wss://web.whatsapp.com/ws/chat',
    connectTimeoutMs: 20_000,              // fail connect after 20s
    keepAliveIntervalMs: 30_000,           // WS ping-pong interval
    defaultQueryTimeoutMs: 60_000,         // per-query timeout (undefined = none)
    qrTimeout: undefined,                  // ms to wait for next QR

    // --- auth (required) ---
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
    },

    // --- behaviour ---
    markOnlineOnConnect: true,             // send 'available' presence on connect
    syncFullHistory: true,                 // request full history sync
    fireInitQueries: true,                 // run init queries automatically
    emitOwnEvents: true,                   // emit events for your own actions
    countryCode: 'US',                     // for number formatting
    generateHighQualityLinkPreview: false, // upload HQ link-preview thumbnails
    linkPreviewImageThumbnailWidth: 192,
    enableAutoSessionRecreation: true,     // recreate Signal sessions on failure
    enableRecentMessageCache: true,        // cache recent messages for retries

    // --- retries & timeouts ---
    maxMsgRetryCount: 5,
    retryRequestDelayMs: 250,
    transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
    mediaUploadTimeoutMs: undefined,       // per-send option also available

    // --- hooks (all optional) ---
    getMessage: async key => undefined,            // your store lookup for retries
    cachedGroupMetadata: async jid => undefined,   // your group-metadata cache
    shouldSyncHistoryMessage: () => true,          // filter history-sync downloads
    shouldIgnoreJid: jid => false,                 // drop events for a JID entirely
    patchMessageBeforeSending: msg => msg,         // last-chance message mutation

    // --- networking ---
    agent: undefined,                      // proxy agent for WS
    fetchAgent: undefined,                 // proxy agent for media HTTP
    options: {},                           // extra fetch RequestInit
    customUploadHosts: [],                 // override media upload hosts

    // --- caches (optional; in-memory defaults are used otherwise) ---
    mediaCache: undefined,
    msgRetryCounterCache: undefined,
    userDevicesCache: undefined,
    callOfferCache: undefined,
    placeholderResendCache: undefined,

    logger // pino logger
})
```

Deprecated/no-op options kept for compatibility: `mobile`, `printQRInTerminal`
(handle the `qr` field of `connection.update` yourself).

## Writing Custom Functionality
Baileys is written with custom functionality in mind. Instead of forking the project & re-writing the internals, you can simply write your own extensions.

### Enabling Debug Level in Baileys Logs
First, enable the logging of unhandled messages from WhatsApp by setting:
```ts
const sock = makeWASocket({
    logger: P({ level: 'debug' }),
})
```
This will enable you to see all sorts of messages WhatsApp sends in the console.

### How Whatsapp Communicate With Us

> [!TIP]
> If you want to learn whatsapp protocol, we recommend to study about Libsignal Protocol and Noise Protocol

- **Example:** Functionality to track the battery percentage of your phone. You enable logging and you'll see a message about your battery pop up in the console:
    ```
    {
        "level": 10,
        "fromMe": false,
        "frame": {
            "tag": "ib",
            "attrs": {
                "from": "@s.whatsapp.net"
            },
            "content": [
                {
                    "tag": "edge_routing",
                    "attrs": {},
                    "content": [
                        {
                            "tag": "routing_info",
                            "attrs": {},
                            "content": {
                                "type": "Buffer",
                                "data": [8,2,8,5]
                            }
                        }
                    ]
                }
            ]
        },
        "msg":"communication"
    }
    ```

The `'frame'` is what the message received is, it has three components:
- `tag` -- what this frame is about (eg. message will have 'message')
- `attrs` -- a string key-value pair with some metadata (contains ID of the message usually)
- `content` -- the actual data (eg. a message node will have the actual message content in it)
- read more about this format [here](/src/WABinary/readme.md)

### Register a Callback for Websocket Events

> [!TIP]
> Recommended to see `onMessageReceived` function in `socket.ts` file to understand how websockets events are fired

```ts
// for any message with tag 'edge_routing'
sock.ws.on('CB:edge_routing', (node: BinaryNode) => { })

// for any message with tag 'edge_routing' and id attribute = abcd
sock.ws.on('CB:edge_routing,id:abcd', (node: BinaryNode) => { })

// for any message with tag 'edge_routing', id attribute = abcd & first content node routing_info
sock.ws.on('CB:edge_routing,id:abcd,routing_info', (node: BinaryNode) => { })
```

# License
Copyright (c) 2025 Rajeh Taher/WhiskeySockets

Licensed under the MIT License:
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Thus, the maintainers of the project can't be held liable for any potential misuse of this project.
