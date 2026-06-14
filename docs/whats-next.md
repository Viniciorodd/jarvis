# Where we are & what's next (handoff — read this first in a new chat)

_Updated 2026-06-14. Everything is committed to git + saved to memory. Resume from here._

## ✅ DONE & LIVE
- **NAS stack 24/7:** n8n, Postgres, HQ (`192.168.6.121:8099`), Whisper (port 9100). HQ heartbeat active.
- **Gov pod LIVE:** SAM scout (daily 6:10am, profile-aware ranking) + EOD report + approval-executor —
  activated & tested (Telegram digest + SAM-SCOUT on HQ floor both confirmed working).
- **Companion ("her"):** orb UI, Claude brain, file + organize tools (plan→approve→reversible quarantine),
  full NAS access, Notion read, HQ read, browser voice. **Loads the Operator Profile** (she knows him).
  Open: `node companion\server.js` → http://localhost:8095  (or companion\start-jarvis.cmd).
- **Operator Profile — FINALIZED & live** (`prompts/operator-profile.md`, gitignored): merged from 232
  notes/voice/journals + his confirmed facts. Key: gov #1, $10 spend gate, trading off 6mo, RE passive,
  $10k/mo net goal, "be hard on me," family-driven why.
- **Data ingested (full archive, searchable):** 65 Notability .note · 166 voice transcripts ·
  12 Day One journals (520-entry main) · **280/284 handwritten PDFs OCR'd** (4 large ones failed —
  retry with split: "Getting to $1M by 2027", "Main Street Millionaire", "ICT Mentorship", one 413).
- **Voice + comms LIVE (keys in .env, verified):** ElevenLabs (she speaks) · Deepgram (she hears) ·
  **Slack bridge** (DM her / approvals with buttons, Socket Mode). Launch both: `companion\start-jarvis.cmd`.
- **Operator Profile v3** built from 512 sources; live profile enriched (no-equity rule, gov margin).
  Private mental-health content kept OUT of the agent-injected profile by design.
- **Tooling:** ingest.mjs (always-scan, all types) · transcribe-audio · read-notability · build-operator-profile
  · sam-scout (profile-aware) · Fiverr gig pack · gov capability boilerplate + a drafted sources-sought response.

## 🔜 NEXT (in priority order)
1. **SEND 1 GOV PROPOSAL (his #1 priority).** Draft ready: `prompts/gov/boilerplate/DRAFT-sources-sought-westpoint-cleaning.md`.
   Pull the real notice (CO email + exact #) from SAM.gov, fill 3 brackets, send. (Or run `node scripts/sam-scout.mjs --days 7` for fresh targets.)
2. **Slack command center** (he chose this as the unifier): create workspace + bot token → wire pods + Jarvis
   + approval buttons; replaces Telegram.
3. **Gmail pods:** morning brief + email triage need a Gmail OAuth credential in n8n (fiddly — its own step).
4. **Jarvis always-on:** containerize Companion + schedule ingestion on the NAS (so she's 24/7 + auto-updated).
5. **HQ rebuild** for new rooms (`docker compose up -d --build hq`) + have pods ping HQ.
6. **Device→NAS auto-backup** (Notability WebDAV, Just Press Record, Day One, photos) so the data-lake self-fills.
7. **Recon Tweaks launch kit** — needs his goals/affiliates folder; pre-revenue → Gumroad listing + content.

## 🔧 Housekeeping / security (do soon)
- Rotate the Claude API key + Telegram bot token (both were pasted in chat).
- Change the temporary NAS password (`Jarvis2026deploy`).
- First encrypted offsite backup (volumes/hq, volumes/n8n, operator-profile.md).

## Decisions on the table
- **Notability 284 PDFs (320MB):** NOT bulk-OCR'd (cost vs marginal gain — profile already rich). OCR
  high-value ones on demand later if wanted.

## How to resume in a new chat
Open Claude Code **in `C:\Users\vinic\Desktop\jarvis`** and say:
> "Read docs/whats-next.md and the memory. We left off with the gov pod live and my Operator Profile done.
>  Let's [send the gov proposal / set up Slack / do the Gmail pods]."
