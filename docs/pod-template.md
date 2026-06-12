# Pod template — how to add any new side hustle in ~a week

Every business is the same six-role pipeline. Adding "side hustle #8" is filling in this
template, never re-architecting.

| Role | Runs | Model | Job |
|---|---|---|---|
| **Scout** | 24/7 schedule | Haiku | Find opportunities (contracts, trends, orders, leads) |
| **Analyst** | on Scout output | Sonnet | Score against Operator rules; kill noise; short memo |
| **Producer** | on approval to pursue | Sonnet | Create the deliverable (draft, design, quote pack) |
| **Gate** | — | YOU | One tap: approve / edit / pass (HQ or Telegram) |
| **Executor** | on approve | n8n | The real send/submit/publish/list action |
| **Bookkeeper** | always | — | HQ events + Notion log + money tracking |

## Checklist for a new pod

1. ☐ Room entry in `hq/config/rooms.json` (id, name, icon, unlockAt — pick an honest rank)
2. ☐ Notion pipeline database for the pod
3. ☐ `prompts/<pod>/scout.md`, `analyst.md`, `producer.md` — copy a neighbor pod's and edit.
   Every prompt keeps the untrusted-data clause and the Operator Profile injection.
4. ☐ n8n workflows: scout schedule → analyst → HQ `/api/approval` (with `callback` to the
   approval-gate webhook) → executor branch in workflow 05
5. ☐ Status pings (`/api/event`) at start/finish/error of each workflow
6. ☐ Define what banks money/XP — only real dollars and shipped deliverables, ever
7. ☐ Compliance line: what's the legal/platform risk, and which human checkpoint covers it?
8. ☐ Two weeks fully gated before any step earns wider autonomy

## Pre-specced future pods (from the build plan)

- **Etsy/POD** ($1k): trend scout (eRank/EverBee) → ORIGINAL designs in trending themes →
  USPTO trademark check on every phrase → Printify/Printful push, AI disclosure per Etsy policy.
- **Content Lab** ($5k): `prompts/content/` already written. Blog + affiliate + short-form.
- **Music** ($10k): licensed gen tool (keep license receipts), release 1-in-10, BeatStars/
  lofi-YouTube/sync; never mass-upload to Spotify.
- **Kids show** ($10k): one show bible, original characters, educational scripts; your full
  watch-through of every frame; Made-for-Kids + AI disclosure. Highest platform-risk pod.
- **Real Estate desk** ($25k): listings/county-records scout → comps analyst → offer/letter
  drafts. Everything signed by you; no agent talks to a counterparty unsupervised.
- **Trading Watchtower** ($50k): monitor + journal ONLY. Watchlists, filings summaries,
  price alerts → Telegram; trade journal with your stated reasoning vs. plan. No execution.
- **Supplements** ($50k, with counsel): Supliful storefront; compliance-checklist agent flags
  claims; attorney-reviewed claim templates; you approve every health-adjacent sentence.
