# Where we are & what's next (handoff — read this first in a new chat)

_Updated 2026-06-19. Everything is committed to git + saved to memory. Resume from here._

### 🆕 2026-06-19 — shipped: Fiverr Studio is LIVE (real clickable thumbnails)
- **Hybrid thumbnail engine** (`scripts/make-thumbnail.mjs`): Claude designs a spec → FLUX paints the
  photoreal SUBJECT (free, Cloudflare) → CODE composites the bold legible headline + accent badge → one
  self-contained 1280×720 SVG (embedded raster + system-font text). This is how real designers work, and it
  fixes the old gap (Claude-SVG drew crude silhouettes + truncated; FLUX mangles text). Never a silhouette,
  never truncated. The deterministic composition lives in code (doctrine #1).
- **Live Studio surface** in the ONE app: Companion → **Operations → 🎨 Fiverr Studio → 🎨 Studio**. Type a
  client scenario → it renders in a faithful **YouTube in-feed card** (so you see it as a viewer would) →
  **Download PNG (1280×720)** via a client-side canvas (untainted because the subject is embedded as a data
  URI). New route `POST /api/studio/thumbnail` in `companion/server.js`; UI in `companion/public/ops.js`
  (+ `style.css`). Verified end-to-end in-browser across finance/fitness/tutorial/gaming.
- **Worker wired**: `pods/fiverr/worker.mjs` routes `thumbnail` briefs through the hybrid engine (vault-scoped
  to STUDIO-01), still behind the HITL deliver gate. Voice/chat works: *"have Remy make a thumbnail for X."*
- **Full Studio — 4 deliverable types.** Shared `scripts/studio-lib.mjs` + `make-thumbnail.mjs` (now
  **MrBeast-style**: extreme expression, hyper-saturated color grade, huge minimal text), `make-cover.mjs`
  (hybrid book/eBook cover, KDP 1600×2400, genre-aware type), `make-logo.mjs` (clean **vector** monogram +
  wordmark — no FLUX, always crisp), `edit-product.mjs` (fal.ai BiRefNet bg-removal → clean studio backdrop +
  shadow). Studio UI has a type switcher + per-type previews + natural-size PNG export. Worker routes
  cover/logo too. Routes `/api/studio/{thumbnail,cover,logo}` + `/api/studio/product`.
- **Portfolio = master gallery `fiverr/portfolio/index.html`** (real PNGs + Download buttons that work from a
  plain file open), niche spread (real estate / business / trading / crypto / finance / fitness / …):
  8 thumbnails, 5 covers, 6 logos, 1 product. Folders: `thumbnails/ covers/ logos/ products/`.
- ⏭ Next for Fiverr: a couple more product samples; publish the actual gigs; land the first paid order.

### 🆕 2026-06-16 — shipped
- **Email-finder enrichment** (`pods/gov/enrich.mjs`): discovery gave subs a website but no email; this
  scrapes the site + its contact/about pages (mailto + text), picks the best on-domain role inbox, and writes
  `contact_email` back to the CRM. Free + read-only; optional Hunter.io fallback if `HUNTER_API_KEY` is set.
  Wired into `discover.mjs` (auto-enriches new rows) + the CoS router ("find emails for the subs" / "enrich").
  Pure extract/pick logic is eval-pinned (`evals/enrich.eval.mjs`).
- **Gov email sending WIRED** (`pods/gov/sender.mjs` + control-plane executor): approvals used to be logged
  but never executed. Now approving a gov **send/email** approval (HQ/Slack/companion) fires the sender on the
  referenced draft. The human approval IS the gate (doctrine §9 rule 2); auto-send is **opt-in via
  `GOV_AUTO_SEND=1`** — with it off the executor dry-runs + posts a Slack preview so you see what would go out.
  `scripts/gov-send.mjs` is now a thin CLI over the same module. Connector writes a sendable `To:/Subject:`
  header when the top sub has an (enriched) email, so the outreach loop actually closes. A **proposal `submit`
  never auto-emails** (it goes out a portal). Pure parser + executor gate eval-pinned (`evals/gov-send.eval.mjs`).
- **Stripe invoicing / payment links WIRED** (`pods/finance/invoice.mjs`, Victor / LEDGER-01): "invoice a
  client for $X" → Victor validates the amount **in code** (integer cents, deterministic idempotency key),
  drafts it, and raises ONE money gate. On approval the control-plane executor creates a Stripe **payment
  link** (REST, no npm dep) and writes a ready-to-send email carrying the link. **Test mode first** — the key
  is vault-scoped to LEDGER-01 only, a `sk_live_` key is refused unless `STRIPE_ALLOW_LIVE=1`, and auto-create
  is opt-in via `FINANCE_AUTO_INVOICE=1` (off = dry-run/preview). Pure money core + gate eval-pinned
  (`evals/finance.eval.mjs`) + a vault ACL eval. **Evals: 95/95 green.**
  → **To go live (test mode):** add `STRIPE_API_KEY=sk_test_…` to `.env` (Stripe Dashboard → Developers → API
    keys, in Test mode), set `FINANCE_AUTO_INVOICE=1`, then
    `node pods/finance/invoice.mjs 500 client@email.com "Office cleaning"` → approve in HQ/companion → a real
    **test-mode** payment link is created. Flip to `sk_live_` + `STRIPE_ALLOW_LIVE=1` when ready for real money.

### 🆕 2026-06-14 (PM session) — shipped
- **Rodgate site LIVE → https://rodgate-llc.netlify.app** (Netlify free; redeploy: `netlify deploy --dir=site --prod --site 2c860be1-48f8-497b-a1c1-46d1772d2973`).
- **Inbox cleanup executed** (reversible): Rodgate inbox → ~623 (archived 967 / trashed 420);
  Personal viniciorodd@ scanned all 35,818 → inbox ~13,322 (archived 5,832 / trashed 16,664).
  Deal-flow (biz-for-sale + RE listings) preserved; junk unsubscribe list = `reports/unsubscribe-personal-2026-06-14.md` (user actions it).
- **Jarvis Companion v2**: open files/apps/URLs on the PC (`open_path`), drag-drop docs to read,
  show maps/images/web (`show_visual`), live dashboard rail (income/spend/tokens/net + urgent/emails/tasks/pods),
  Deepgram-based wake (fixes Electron's missing browser speech API). See `project-jarvis-companion` memory.
- **Fiverr gig gallery**: `fiverr/portfolio/index.html` — 8 screenshot-ready samples across the gig types.
- ⏭ Pending: Porcupine always-on wake word; auto-sync `.dashboard.json`; respond to the 3 open SAM leads.

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
1. ✅ **DONE 2026-06-14 — FIRST GOV PROPOSAL SENT.** West Point sources-sought **W911SD06102026**
   (Army MICC West Point, janitorial BPA) emailed to CO **Leslie Duron** via the new gated emailer
   `scripts/gov-send.mjs` (RodGateGroup@gmail.com, app-password SMTP; dry-run → approve → `--send`).
   Final text: `prompts/gov/boilerplate/READY-westpoint-W911SD06102026-sources-sought.md`.
   → NEXT gov action: respond to the other live sources-sought leads from the scout (VA Hampton,
     Navy Norfolk, Forest Service) the same way.
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
