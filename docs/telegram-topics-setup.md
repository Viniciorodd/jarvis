# One Telegram topic per agent — setup (5 min)

Built 2026-07-24 in response to: *"i want one chat per ai agent, right now i receive so many things at
once all in one chat... by the time i want to respond, there's 2 other messages and jarvis gets confused."*

Telegram bots can't open separate 1:1 chats per agent — but a **group with "Topics" enabled** (a forum
supergroup) gives the same result inside one place: each agent gets its own named thread in the sidebar,
and a stable **🗣 Talk to Jarvis** thread holds your actual conversation with her, untouched by agent noise.

**Status: code written and syntax-checked (`node --check` on both files), NOT yet run against a live
Telegram chat.** No sandbox in this session could reach `api.telegram.org` to test it end-to-end — you're
the first real test. If something looks wrong, it's a code bug to report, not a setup mistake to chase.

## What changed
- `companion/telegram-topics.mjs` (new) — creates + remembers one topic per agent (persisted in
  `control-plane/data/telegram-topics.json`, gitignored).
- `companion/telegram-bridge.mjs` — agent-initiated pushes (new approvals, narrated agent activity) now go
  to that agent's own topic instead of the one flat chat. Your own messages/replies always stay in
  whatever topic you sent them from — nothing ever jumps threads on its own.
- **Fully backward-compatible.** If you skip the setup below, or topics fail for any reason, everything
  falls back to exactly today's behavior: one flat chat, no threads. Nothing breaks either way.

## Setup
1. **Create a new Telegram group** (not your existing 1:1 chat with the bot — Telegram can't convert a
   1:1 chat into a forum). Name it whatever you like, e.g. "Jarvis".
2. **Enable Topics:** group name → Edit → toggle **Topics** on. (If you don't see this option, update
   Telegram — it's a newer feature.)
3. **Add your Jarvis bot to the group** as a member, then promote it to **admin** with at least the
   **"Manage Topics"** permission (Administrators → your bot → toggle Manage Topics on).
4. **⚠️ TURN OFF THE BOT'S PRIVACY MODE FIRST — or nothing below works.** By default a Telegram bot in a
   group can only see messages starting with `/`, so it will NEVER see your normal chat. In Telegram open
   **@BotFather** → `/mybots` → pick your Jarvis bot → **Bot Settings → Group Privacy → Turn off**. (You must
   then REMOVE the bot from the group and re-add it for the change to take effect.) Verified 2026-07-27 —
   the bridge is built for normal conversation, so with privacy ON the "🗣 Talk to Jarvis" thread stays silent.
5. **Send `/start` inside the new group** (use the command, not "hi" — commands are always delivered even if
   privacy is still on). The bot replies with the group's chat id, either in its `/start` text or as
   "Not authorized. (To allow this phone, set TELEGRAM_CHAT_ID=… )" — either way, that number is what you need.
6. **Update the NAS `.env`:** set `TELEGRAM_CHAT_ID` to the new group's id (a forum supergroup id starts with
   `-100…` — negative and long; that's normal, and it will look nothing like your old 1:1 id). ⚠️ The bridge
   runs on the **NAS**, so edit the NAS `.env` (`/volume1/docker/jarvis/.env`), not the PC one.
7. **Restart the bridge on the NAS:** `docker compose up -d --build telegram-bridge`
   (or `docker compose restart telegram-bridge` if the code is already deployed).

## Done-when
- On boot, the bridge posts once into a new **🗣 Talk to Jarvis** topic it creates automatically.
- The next agent-triggered approval or activity update (Gideon's scan, Hector's sub outreach, Elle's
  triage, etc.) shows up in a **new topic named after that agent**, not the flat feed.
- Typing in one topic and getting a reply keeps the whole exchange in that same topic — no more losing
  your place when a second agent's update lands mid-conversation.

## If it doesn't work
- **`createForumTopic` fails silently, everything stays in one flat chat** → almost always means Topics
  isn't actually enabled on the group, or the bot isn't an admin with Manage Topics. Check step 2–3 again.
  The bridge logs the exact Telegram error to console (`telegram-topics: createForumTopic failed...`).
- **Wrong/old chat id** → you're still pointed at your old 1:1 chat, which can never have topics. Re-check
  step 4–5.
- Delete `control-plane/data/telegram-topics.json` and restart to force every topic to be re-created from
  scratch (useful if a topic got deleted on Telegram's side and the bridge doesn't know).
