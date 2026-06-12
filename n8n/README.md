# n8n workflows

Import order: in n8n (http://nas:5678) → Workflows → ⋯ → **Import from file** → pick a JSON.
After import, **open each node once and Save** (n8n fills in any version gaps), then toggle Active.

These are the source of truth — if you edit a workflow in the n8n UI, export it back here
(Workflow menu → Download) so Claude Code sessions can see/modify it.

| File | What it does | Needs |
|---|---|---|
| `00-hq-heartbeat.json` | Pings the HQ floor every 15 min — proves wiring end-to-end. **Import this first.** | env only |
| `01-sam-scout.json` | Daily 06:10: polls SAM.gov for your NAICS codes, filters small-biz-winnable, Haiku ranks top 5, digest → Telegram. Edit NAICS list in the "Config" node. | `SAM_API_KEY`, `ANTHROPIC_API_KEY` |
| `02-morning-brief.json` | 07:00: unread email → Sonnet → morning brief on Telegram | Gmail OAuth credential |
| `03-email-triage.json` | Polls inbox, classifies each email, writes a reply draft **into Gmail drafts** (never sends), pings you | Gmail OAuth credential |
| `04-eod-report.json` | 18:00: reads HQ state → Sonnet writes the end-of-day report → Telegram | env only |
| `05-approval-executor.json` | Webhook the HQ approve/pass buttons call back to. Executor actions per pod get added here. | env only |
| `06-voice-memo.json` | Drop an audio file in `volumes/voice-inbox` → local Whisper transcribes → Telegram (+ Notion if configured) | Whisper container; Notion credential optional |

## Credentials to create in n8n (Settings → Credentials)

- **Gmail OAuth2** — for workflows 02/03. Scope: read + compose (drafts). Never grant send/delete early on.
- **Notion API** — optional, for 06 and later pods. Share your target database with the integration.

Telegram and Claude are called over plain HTTP using env vars from `.env` (no credential setup needed):
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ANTHROPIC_API_KEY`, `SAM_API_KEY`, `HQ_URL`, `HQ_TOKEN`.

## The status-ping convention (how the HQ floor stays alive)

Every workflow should POST to `{{ $env.HQ_URL }}/api/event` at start/finish/error:

```json
{ "agent": "SAM-SCOUT", "pod": "gov", "state": "work", "text": "Scanned 212 notices → 4 leads" }
```

`pod` must match a room id in `hq/config/rooms.json` (cos, fiv, gov, etsy, lab, music, kids, re, trade, supp).
`state`: `work` | `idle` | `need` | `error`. Add `amount`/`xp` only when money is actually banked
or a deliverable actually shipped.

## The approval-gate convention

Anything that would send/submit/publish/list/spend must NOT execute directly. Instead POST to
`{{ $env.HQ_URL }}/api/approval` with a `callback` of `http://n8n:5678/webhook/approval-gate`.
When you tap Approve in the HQ (or Telegram), workflow 05 receives the callback and runs the
real executor action. Until you wire a pod's executor, 05 just confirms on Telegram — safe default.
