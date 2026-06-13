# Go-Live — the exact sequence to get JARVIS running

Work top to bottom. Each step has a **done-when** so you know it actually worked.
Most of this is one evening of setup + accounts. Nothing here needs code.

---

## STAGE 1 — Accounts & keys (~45 min, do at your desk)

### 1.1 Anthropic API key (the brain)
- Go to https://console.anthropic.com → Billing → add a payment method.
- Set a **spend limit / alert at $50/mo** (Billing → Limits). This caps runaway cost.
- API Keys → Create Key → copy it (starts `sk-ant-`).
- **Done when:** you have the `sk-ant-...` key saved somewhere safe.

### 1.2 Telegram bot (your command center)
- In Telegram, message **@BotFather** → `/newbot` → name it (e.g. "Jarvis HQ") → copy the **bot token** (`123456:ABC...`).
- Message **@userinfobot** → it replies with your numeric **chat id**.
- Open a chat with your new bot and send it "hi" (a bot can't message you until you message it first).
- **Done when:** you have the bot token + your chat id.

### 1.3 SAM.gov API key (gov scout) — you're already registered
- Log into https://sam.gov → your profile → **Account Details** → Request/Copy **API Key**.
- While there: confirm your registration shows **Active** (not "Submitted") and note your **CAGE code**.
- **Done when:** you have the SAM key, AND you've put the CAGE into `prompts/gov/entity-profile.md`.

### 1.4 (Optional now, needed later) Notion
- https://www.notion.so/my-integrations → New integration → copy the `ntn_...` key.
- You'll share specific databases with it in Stage 4. Skip for now if you want momentum.

### 1.5 Fiverr — your month-1 cash engine
- Create the seller account; pick **2–3 gigs** (thumbnails / book covers / SEO articles / landing pages / photo cleanup). Don't publish polished gigs yet — just reserve the account. This has no API; you'll operate it by hand with agent-drafted deliverables.
- **Done when:** account exists and you've decided your 2–3 gig types.

---

## STAGE 2 — Bring the stack up on the NAS (~30–45 min)

> Detailed version: `docs/nas-setup.md`. This is the fast path.

### 2.1 Tailscale (private access)
- Install Tailscale on the **NAS** (UGREEN App Center, or the Docker method in `docker-compose.yml`), your **iPhone**, and **iPad** — all logged into the same account.
- **Done when:** from your phone (off home wifi), you can ping the NAS's Tailscale name.

### 2.2 Copy the repo to the NAS
- Get the `jarvis` folder onto the NAS (SMB copy into `/volume1/docker/jarvis`, or `git clone`).
- **Done when:** `docker-compose.yml` is sitting on the NAS.

### 2.3 Fill in `.env`
- `cp .env.example .env`, then edit `.env` with the keys from Stage 1:
  `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SAM_API_KEY`.
- Set `N8N_HOST` to your NAS Tailscale hostname. Set strong random values for
  `POSTGRES_PASSWORD` and `N8N_ENCRYPTION_KEY`. Leave `HQ_TOKEN` blank for now (set it after you confirm things work).
- **Done when:** every line in `.env` is filled.

### 2.4 Launch
```sh
cd /volume1/docker/jarvis
docker compose up -d
docker compose ps          # all services "Up"/healthy?
```
- **Done when:** `docker compose ps` shows n8n, postgres, hq, whisper all running.

### 2.5 Reach the dashboards from your phone (over Tailscale)
- HQ → `http://<nas-tailscale-name>:8099` → Safari share → **Add to Home Screen** (it's a PWA, opens like an app).
- n8n → `http://<nas-tailscale-name>:5678` → create your n8n owner login.
- **Done when:** the HQ floor loads on your iPhone home screen (it'll be mostly empty — that's correct, no agents are running yet).

---

## STAGE 3 — Light it up (~30 min)

### 3.1 Heartbeat (proves the whole wire)
- In n8n: Workflows → Import from File → `n8n/workflows/00-hq-heartbeat.json`.
- Open each node once, Save, then toggle the workflow **Active**.
- **Done when:** within 15 min the HQ floor shows a "CORE · n8n heartbeat" operator. If yes, your n8n→HQ plumbing works and every other workflow will too.

### 3.2 Chief of Staff (banks you time)
- In n8n: Settings → Credentials → New → **Gmail OAuth2**, connect your Google account (grant read + compose only).
- Import `02-morning-brief.json`, `03-email-triage.json`, `04-eod-report.json`. In each Gmail node, pick your new credential. Save, activate.
- **Done when:** you get a 7am morning brief and a 6pm EOD report on Telegram, and new emails produce **draft replies in Gmail** (never auto-sent) with a Telegram nudge.

### 3.3 Gov scout (fills the pipeline)
- Import `01-sam-scout.json` (already set to your NAICS 561210/561720/561990). Activate.
- Optional smoke test from any machine with Node + the keys:
  `SAM_API_KEY=... ANTHROPIC_API_KEY=... node scripts/sam-scout.mjs`
- **Done when:** you get a daily 6:10am SAM digest on Telegram ranking the most winnable janitorial/grounds notices.

### 3.4 The approval gate
- Import `05-approval-executor.json`. Copy its webhook URL into `.env` as the callback the HQ uses, or note it. Activate.
- **Done when:** tapping Approve/Pass on an HQ approval sends a confirmation to Telegram.

### 3.5 Lock the door
- Now that it works, set `HQ_TOKEN` to a random string in `.env`, `docker compose up -d` again. The HQ machine endpoints now require it (n8n already sends it).
- **Done when:** `docker compose ps` is healthy and the floor still updates.

---

## STAGE 4 — The soul of the system (do this with care, ~1–2 hrs)

### 4.1 Write the Operator Profile
- `cp prompts/operator-profile-template.md prompts/operator-profile.md` and fill it honestly — goals, voice, hard money rules, where you've failed and won. This is injected into every agent. 2–3 pages. Don't rush it.
- **Done when:** `operator-profile.md` exists and reads like *you*.

### 4.2 Confirm the gov entity file
- Open `prompts/gov/entity-profile.md`, fill the CAGE code, confirm "Active" status.
- **Done when:** no `__CONFIRM/FILL__` placeholders remain.

### 4.3 Notion (optional but recommended)
- Restructure Notion: a Vision page, a Lessons database, a Gov pipeline DB, a Fiverr DB.
- Create the Notion credential in n8n; share those databases with the integration.
- Activate `06-voice-memo.json` and drop an audio file in `volumes/voice-inbox` to test.
- **Done when:** a voice memo transcribes to Telegram (and Notion if wired).

### 4.4 First backup
- Set up a weekly encrypted offsite copy of `volumes/hq/`, `volumes/n8n/`, the Operator Profile, and a Notion export (UGOS backup app or a `restic` container). See `docs/nas-setup.md` §4.
- **Done when:** one backup has run and you've confirmed the file exists offsite.

---

## STAGE 5 — Earn your first dollars (ongoing)

1. **Fiverr:** publish your 2–3 gigs. On each order: PIXEL-02 drafts options → **you QC for 5 min** → you deliver. Price low until 15–20 reviews, then raise. Target: first $100, then $1k/mo.
2. **Gov:** each morning, read the SAM + (later) COSTARS digest. When the bid-analyst flags a winnable janitorial/grounds set-aside, respond to sources-sought notices and assemble small proposals — **you sign and submit every one.**
3. **Build the proposal boilerplate** (capabilities statement leading with your SDB/minority/Hispanic-owned status, pricing template) so the assembler has something to work from.
4. **Sunday:** run the weekly strategy agent (Opus) → it posts 3 quests to the HQ and proposes Operator Profile edits.
5. **Let the game gate the rest:** Etsy/POD unlocks at $1k banked, Content Lab at $5k, and so on. Don't open a new pod while one is on fire.

---

## If something doesn't work
- HQ floor empty after heartbeat activates → check n8n execution log on the "Ping HQ" node; usually `HQ_URL` is wrong (must be `http://hq:8099`, the Docker service name, not localhost).
- Telegram silent → you must message the bot first; recheck token + chat id.
- SAM digest empty → normal on a slow day; widen `--days` or confirm the SAM key works via the script.
- Claude node 401 → `ANTHROPIC_API_KEY` not loaded into the container; re-run `docker compose up -d` after editing `.env`.
