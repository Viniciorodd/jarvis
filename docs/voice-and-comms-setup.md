# Setup — Slack command center + ElevenLabs voice + Deepgram ears

All three are BUILT and wired with graceful fallback. You just create the accounts, grab keys,
drop them in `.env`, and run. Nothing here exposes anything to the public internet.

---

## 1. Slack — your command center (talk to Jarvis + agents, approve from anywhere)

**Create the app (~10 min):**
1. Go to **https://api.slack.com/apps → Create New App → From scratch**. Name it `Jarvis`, pick your
   workspace (create a free Slack workspace first if you don't have one).
2. **Socket Mode** (left menu) → toggle **Enable Socket Mode**. It creates an **App-Level Token** —
   copy it (starts `xapp-`) → this is `SLACK_APP_TOKEN`.
3. **OAuth & Permissions → Bot Token Scopes**, add: `chat:write`, `app_mentions:read`, `im:history`,
   `im:read`, `im:write`. (Add `channels:history` + `groups:history` if you want her in channels too.)
4. **Event Subscriptions** → Enable → **Subscribe to bot events**: `app_mention`, `message.im`.
5. **Interactivity & Shortcuts** → toggle **On** (needed for the approve/pass buttons; with Socket
   Mode you don't need a request URL).
6. **Install App** (left menu) → Install to workspace → copy the **Bot User OAuth Token**
   (starts `xoxb-`) → this is `SLACK_BOT_TOKEN`.
7. In Slack, create a channel **#approvals** and invite the bot: `/invite @Jarvis`.

**Configure + run:**
- Put in `.env`: `SLACK_BOT_TOKEN=xoxb-…`, `SLACK_APP_TOKEN=xapp-…`, `SLACK_APPROVALS_CHANNEL=#approvals`
- Run alongside the Companion server: `node companion/slack-bridge.mjs`
- **Test:** DM the Jarvis bot ("what's my #1 priority this week?") or `@Jarvis` in a channel. Approvals
  posted to HQ now also appear in #approvals with Approve/Pass buttons.

> Replaces Telegram as your primary comms. (Telegram workflows still work; you can retire them later.)

---

## 2. ElevenLabs — her real voice (already wired)

1. **https://elevenlabs.io** → sign up → **Profile → API Key** → copy.
2. (Optional) Voice Library → pick a voice you like → copy its **Voice ID**.
3. In `.env`: `ELEVENLABS_API_KEY=…` and optionally `ELEVENLABS_VOICE_ID=…` (defaults to "Sarah").
4. Restart the Companion. She now speaks with the ElevenLabs voice automatically (toggle 🔊 in the UI).
   No key = free browser voice; key present = premium voice. Zero code change.

---

## 3. Deepgram — accurate, cross-browser speech-to-text (already wired)

1. **https://deepgram.com** → sign up (free starting credit) → **API Keys → Create a Key** → copy.
2. In `.env`: `DEEPGRAM_API_KEY=…`
3. Restart the Companion. The 🎙 mic now records → Deepgram transcribes → sends to her brain.
   No key = browser speech recognition; key present = Deepgram. Tap mic to start, tap again to send.

---

## After adding keys
Restart whatever's running so it picks up the new `.env`:
- Local: stop and re-run `node companion/server.js` (and `node companion/slack-bridge.mjs`).
- On the NAS (once containerized): `docker compose up -d`.
