# Where we are & what's next (living checklist)

_Last updated: 2026-06-14. Tick items as you finish them._

## ✅ Already done
- NAS stack deployed & live 24/7 (HQ :8099, n8n :5678, Postgres) — survived reboot
- HQ heartbeat active (CORE operator on the floor)
- 7 n8n workflows imported (only heartbeat activated so far)
- Companion ("her") built: orb UI, chat brain, file tools + organize engine, browser voice,
  HQ fusion, Notion read, full NAS access (BusinessVault/PersonalVault/NotabilityBackups)
- Notion pages shared with the integration ✓ · NAS drives mapped ✓
- Notability reader built & tested · voice-transcription script built
- Fiverr gig pack + samples ready · gov entity + capability boilerplate ready
- Specs written: Companion PRD, Knowledge Vault, SaaS/Recon pod

## 🟦 TRACK A — Make Jarvis fully know you (→ Operator Profile)
- [x] **A1. Transcribe Notability** — DONE: 64 notes → vault\notability\*.md (2026-06-14)
- [ ] **A2. Deploy Whisper on the NAS** (one SSH session) then `node scripts\transcribe-audio.mjs`
- [ ] **A3. Share remaining Notion pages** with the integration (more = smarter)
- [ ] **A4. Operator Profile deep-pass** — once A1–A3 done, Jarvis distills it from your real data

## 💵 TRACK B — Make money (can run in parallel, needs no system)
- [ ] **B1. Post your 5 Fiverr gigs** (copy + samples in `fiverr-assets/gigs/`)
- [ ] **B2. Activate gov SAM scout** in n8n (daily winnable-contract digest)
- [ ] **B3. Recon Tweaks launch kit** — point me at your goals/affiliates folder, then Gumroad listing + content
- [ ] **B4. Activate Chief-of-Staff workflows** (Gmail credential → morning brief, email triage, EOD report)

## 🔧 TRACK C — Housekeeping / security (do soon)
- [ ] **C1. Rotate the Claude API key** (console.anthropic.com) + **Telegram token** (@BotFather /revoke) — both were pasted in chat
- [ ] **C2. Change the temporary NAS password** (`Jarvis2026deploy`) to something permanent
- [ ] **C3. Rebuild HQ on NAS** to show the new rooms: `docker compose up -d --build hq`
- [ ] **C4. First encrypted offsite backup** of volumes/hq, volumes/n8n, Operator Profile

## Optional upgrades (anytime)
- ElevenLabs voice (drop key in `.env`) · Electron desktop app (`companion/desktop` → npm install)
