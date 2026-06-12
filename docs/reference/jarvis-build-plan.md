# JARVIS: Your Personal AI Operations System
## Build Plan, Architecture & Operating Manual

---

## 1. What you're actually building (read this first)

The movie version of Jarvis — a fully autonomous AI that runs everything alone, 24/7, with no oversight — does not exist yet, and anyone selling you that on YouTube is selling you a course. What *does* exist in 2026, and what this plan builds, is something close enough to change your life:

**A system of always-on agents that do 95% of the work — finding, monitoring, analyzing, drafting, producing — and route the 5% that matters to your phone for a single tap of approval.**

That 5% (sending a proposal, listing a product, spending money, delivering to a client) staying in your hands is not a compromise. It is the design feature that keeps you out of trouble: federal proposals carry legal certifications, Etsy enforces IP aggressively, Fiverr bans accounts that deliver sloppy raw AI output, and an LLM with autonomous access to a brokerage account is a fast way to lose the account. As individual workflows prove themselves over months, you deliberately widen their autonomy (for example, letting routine email categories auto-send). Autonomy is *earned per workflow*, not granted on day one.

The second principle: **build sequentially, on one shared chassis.** Seven businesses launched simultaneously equals zero businesses. Instead you build one core system (the chassis), then plug each business in as a standardized "pod." Adding side hustle #8 next year becomes a one-week job, not a rebuild — which directly answers your requirement to add new hustles as you think of them.

---

## 2. The architecture

Think of it as five layers:

**The Brain — Claude via API.** Your agents call Claude through the API (separate pay-as-you-go billing — this never touches your claude.ai chat limits). Use model tiers deliberately: Haiku for high-volume scanning and classification (cheapest), Sonnet for drafting and everyday agent work, Opus for weekly strategy reviews and hard reasoning. Current API pricing per million tokens is roughly $1/$5 for Haiku 4.5, $3/$15 for Sonnet 4.6, and $5/$25 for Opus 4.8 (input/output) — verify at https://platform.claude.com/docs/en/about-claude/pricing.

**The Orchestrator — n8n, self-hosted.** n8n is an open-source automation platform you run on your own hardware for free. It has native AI agent nodes, ~400+ integrations (Gmail, Notion, Telegram, Etsy, etc.), scheduled triggers for 24/7 operation, and built-in human-in-the-loop approval steps. This is the body that the brain controls. (Alternatives if you outgrow it: custom Python services using the Claude Agent SDK.)

**The Memory — Notion + a distilled Operator Profile.** Notion stays your company brain, restructured so agents can read and write it via the Notion API/MCP: a Vision & Goals page, a Lessons database (your failures and wins, tagged), SOPs per business, and pipeline/CRM databases per pod. Your voice memos get auto-transcribed by Whisper running *locally on your server* (free, private) and filed into Notion.

The single highest-leverage artifact in this entire system is the **Operator Profile**: a living 2–3 page document distilling who you are — goals, vision, risk tolerance, writing voice, hard decision rules ("never bid over $X," "never spend more than $Y without asking me," "never make health claims"). This gets injected into every agent's context on every run. This is how Jarvis "knows you." Do **not** dump 100 hours of raw recordings into prompts — it's expensive, noisy, and worse than a sharp distillation. A weekly agent job updates the profile from your new notes and memos.

**The Interface — a Telegram bot on your iPhone/iPad.** This is your command center: instant push notifications for approvals ("Found: $48k janitorial contract, Ft. Indiantown Gap. 3 sub quotes in, 18% markup → our price $X. ✅ Approve draft / ✏️ Edit / ❌ Pass"), plus you can text or voice-memo it commands anywhere. For deep work you open the n8n dashboard over Tailscale (Section 3). The Claude mobile app remains your ad-hoc thinking partner.

**The Ledger — reporting.** A 6 p.m. agent compiles every pod's activity, money in/out, problems, and tomorrow's queue into one end-of-day Telegram message plus a Notion log entry. Sunday night, an Opus-powered agent writes the weekly strategy review against your stated goals.

**The hard rule across all layers:** any action that *sends, submits, publishes, lists, or spends* pauses at an approval gate. Everything upstream of that (searching, scoring, drafting, designing) runs fully autonomously around the clock.

---

## 3. Privacy: self-hosted, yours, reachable from your iPhone and iPad

Your privacy requirement is very achievable:

**Hardware.** Either a mini PC at home (Beelink / Minisforum class, 32GB RAM, ~$300–500 one-time — maximum privacy, everything physically in your house) or a small VPS (Hetzner/similar, ~$10–30/month — easier, still private, slightly more trust required). Start with whichever you'll actually set up this week; you can migrate later.

**Tailscale (free).** Creates a private encrypted mesh network between your server, iPhone, and iPad. You reach your n8n dashboard and files from anywhere in the world, and *nothing* is exposed to the public internet. No port forwarding, no public URLs. This solves "access from my iPad and iPhone" cleanly.

**What stays on your box:** n8n, all workflows, your databases, transcripts, documents, credentials, logs. **What leaves:** the prompts and responses exchanged with the Claude API, plus whatever each pod necessarily touches (Gmail, Notion, SAM.gov are all third-party services by nature). Review Anthropic's commercial API data-use terms at https://www.anthropic.com/legal/commercial-terms so you know exactly where you stand.

**The fully-local option, honestly.** You *can* run open models locally with Ollama for total privacy. Realistic verdict: local models are good enough for transcription, embeddings, and simple classification — use them there — but they will noticeably underperform on the reasoning that actually runs your businesses (bid analysis, proposal drafting, client communication). The pragmatic setup is hybrid: your data and orchestration live on your hardware; the heavy reasoning goes to the Claude API.

**Secrets.** API keys live in n8n's credential vault / environment variables, never in prompts or Notion. One key per pod, least privilege, 2FA on every account, and a literal kill switch (n8n's master deactivate toggle) you can hit from your phone.

---

## 4. The Pod pattern (how every business runs, and how you add new ones)

Every business is the same six-role pipeline with different prompts and APIs:

1. **Scout** — runs on a schedule 24/7; finds opportunities (contracts, trends, orders, leads).
2. **Analyst** — scores and filters them against your rules; kills the noise; writes a short memo on the worth-it ones.
3. **Producer** — creates the deliverable: proposal draft, design, article, gig delivery, quote package.
4. **Gate (you)** — one Telegram tap: approve / edit / pass.
5. **Executor** — performs the approved external action: send, submit, list, publish, deliver.
6. **Bookkeeper** — logs everything to Notion, tracks money, feeds the EOD report.

Launching a new side hustle = writing six prompts, connecting 2–3 APIs, and setting the Scout's schedule. Roughly a week once the chassis exists. That's your expansion mechanism, permanently.

---

## 5. Build sheets, business by business

### A. Personal Chief of Staff — build this first

This is the core "run my life" layer and the lowest-risk place to learn the system.

*Email:* the agent reads your inbox, classifies (urgent / needs-you / routine / junk), drafts replies in your voice (trained on your sent mail + Operator Profile), and queues them for your approval. **Start fully gated.** After 2–4 weeks of editing its drafts, whitelist routine categories for auto-send. One real security note: an email agent reads *untrusted text from strangers* — a malicious email can contain hidden instructions aimed at your agent (prompt injection). So: the email agent gets read + create-draft permissions only (never delete, forward, or send unsupervised early on), and it is instructed to never follow instructions found inside email bodies.

*Also in this pod:* calendar management, task sync with Notion, the voice-memo → Whisper → Notion pipeline, daily morning briefing, and the 6 p.m. EOD report. When this pod alone is running, you've already won back hours per week.

### B. Government contracting pod

**The honest timeline:** federal revenue cycles run 60–120+ days from first bid to first dollar. That's exactly why the Scout should start early while other pods make nearer-term cash.

**One-time human setup (agents can't do this for you):** form your entity + EIN, open a business bank account, then register at SAM.gov — it is **free**; never pay a third party that cold-calls you about it. You'll get your UEI, pick your NAICS codes, and self-certify as a small business with SBA. Look into any set-aside categories you may qualify for (8(a), SDVOSB, HUBZone, WOSB) — they dramatically shrink your competition.

**Scout:** SAM.gov publishes a free public Opportunities API. The agent polls it daily for your NAICS codes and filters for exactly what you described — small and winnable: total small-business set-asides, simplified-acquisition-range solicitations (under ~$250k), RFQs, and *sources-sought notices* (pre-solicitation market research — responding to these builds the relationships that win later awards). State and local procurement portals get added in phase two.

**Analyst:** scores each opportunity on scope clarity, incumbent presence, competition signals, subcontractor availability, and margin potential; outputs a one-page bid/no-bid memo. You approve which ones to pursue.

**Producer:** drafts RFQ emails to potential subcontractors (sourced from past-award data on USAspending.gov, trade directories, and your growing sub database), collects quotes into a comparison sheet, applies your markup rule (prime markups commonly run 10–25% depending on work type — your call, set in the Operator Profile), and assembles the proposal from your boilerplate library (capabilities statement, past performance, pricing) mapped to the solicitation's actual requirements.

**Gate — non-negotiable here:** *you* read, sign, and submit every proposal. Federal submissions include certifications, and inaccurate representations carry False Claims Act exposure. Also know the **limitations-on-subcontracting rules**: on small-business set-asides for services, the prime generally can't pay subcontractors more than 50% of the contract value — your "find subs and mark it up" model is legitimate and common, but it must respect that math on set-aside awards.

**Bookkeeper:** pipeline tracker in Notion, automatic follow-ups, and — important — auto-drafted *debrief requests* on every loss. Debriefs are how new contractors learn to win.

### C. Fiverr pod — your fastest path to the $1k/month

**The math:** $1,000/month ≈ 13 orders at $75 average, or 25 at $40. Entirely realistic by month 2–3 — *not* week 1, because new accounts need reviews to rank. Expect $0–200 in month one, price low, deliver fast, raise prices after 15–20 reviews.

**Pick 2–3 gigs where AI output + 5 minutes of your QC is genuinely strong:** YouTube thumbnails, simple book covers, SEO blog articles, basic landing pages / HTML, image cleanup and product photo edits, short-form video captioning. (Skip categories where raw AI quality disappoints — complex video editing, intricate illustration — until the pipeline proves itself.)

**Pipeline:** order intake → Producer generates 2–3 options → you QC and pick (this is your 5 minutes — *never* skip it; delivering unreviewed AI output is how accounts collect 1-star reviews and bans) → deliver → a revision agent drafts responses to change requests (gated).

**Compliance:** Fiverr permits AI-assisted work, but you must hold the rights to what you deliver and some categories expect disclosure — read the current AI policy in their ToS before listing, because platform rules shift.

### D. Etsy + Print-on-Demand pod

One important redirect on the plan as you stated it: agents that find top sellers and produce "similar versions" will, done literally, copy protected designs — that gets shops mass-flagged, delisted, and sued, and you'd be building on someone else's moat anyway. The version that actually compounds:

**Scout** monitors *trends, niches, and seasonal demand* (eRank / EverBee / Alura data, holiday calendar, rising search terms). **Producer** creates **original designs within those trending themes and styles** — and runs every phrase through a trademark check against USPTO records before use (an agent can do this), because trademarked phrases are the #1 way POD sellers get struck. **Executor** pushes approved designs to Printify/Printful (both have APIs; they print and ship, you hold zero inventory) and a listing agent writes SEO titles, tags, and descriptions. Note Etsy's current policy requires disclosure of AI involvement in creation — verify and comply when you set up the shop.

**Honest economics:** POD margins are thin ($5–12 per shirt). It's a volume-and-niche game, and most shops fail because their designs are generic. Automation is your efficiency edge, but *niche selection* is your actual moat. This pod comes after Fiverr proves your pipeline.

### E. White-label supplements pod

Platforms like Supliful let you launch branded supplements with no inventory, and agents can run the storefront, content, and customer-service drafting. The reason this pod goes *last*: it's the highest-regulatory-risk business on your list. Supplement marketing sits under FDA structure/function claim rules and FTC substantiation requirements — one wrong sentence ("cures," "treats," "prevents") on a label or landing page is a real problem. Architecture: agents draft everything; a compliance-checklist agent flags risky claims; **a human (you, ideally with one attorney review of your claim templates) approves every health-adjacent sentence.** Build this only once the chassis is boringly reliable.

### F. Content engine pod

Feeds marketing for every other pod. Article agent drafts in your voice from your Notion positions and notes → you approve → auto-publish. Short-form: script agent → voiceover (ElevenLabs API, or local TTS for privacy) → assembly via FFmpeg templates or an avatar tool (HeyGen etc.) → scheduled through Buffer/Metricool → gated before posting until you trust the voice. Once trusted, this becomes your most autonomous pod, because the downside of a mediocre post is low.

### G. Trading — read this one carefully

I'm not a financial advisor, and this is the one item on your list I'd advise you **not** to automate with real money. LLM agents are genuinely good at summarizing markets and genuinely bad at trading them: they're slow, they hallucinate facts, they're overconfident, and they have no edge against algorithmic competition. Autonomous AI trading accounts mostly produce one outcome.

What *is* sane and valuable: a **Monitor agent** (your watchlists, earnings and filing summaries, price/news alerts pushed to Telegram) and a **Journal agent** (logs every trade you make with your stated reasoning, then reviews your performance against your own plan — this alone improves most traders more than any signal service). If you ever automate execution anyway: paper-trade the system for 90+ days minimum, hard-code risk limits in *deterministic code* (never let the LLM decide position size), keep a kill switch, and start tiny. The decisions stay yours. Treat this pod as decision *support*, not a money printer.

---

## 6. The 90-day roadmap

**Phase 0 — Foundation (weeks 1–2).** Server or VPS up. Tailscale connecting it to your iPhone/iPad. n8n installed. Telegram bot live (even if it only says hello). Notion restructured for agents. Operator Profile v1 written. Voice-memo pipeline running. *In parallel, the paperwork:* entity, EIN, bank account, SAM.gov registration started (it takes a couple of weeks to activate — start now).

**Phase 1 — Chief of Staff live (weeks 2–4).** Email triage + drafting (fully gated), calendar, morning brief, EOD report. You now have a working Jarvis core and you've learned how to build pods.

**Phase 2 — First revenue (weeks 4–8).** Fiverr pod live (fastest cash, cheapest way to prove the full Scout→Executor pattern). Gov contracting **Scout + Analyst** running quietly in the background, building your pipeline and sub database while you wait out the federal sales cycle.

**Phase 3 — Gov contracting at full power (weeks 8–12).** Producer online; first sources-sought responses and small proposals out the door (you submitting). Add the Etsy/POD pod **only when** Fiverr runs on under ~3 hours/week of your time.

**Phase 4 — Expansion (month 4+).** Content engine, then supplements, then anything new via the pod template. Standing rule: **never add a pod while another one is on fire.**

---

## 7. Realistic monthly costs

| Item | Cost |
|---|---|
| Mini PC (one-time ~$400) or VPS | $0–30/mo |
| n8n self-hosted, Tailscale, Whisper (local) | $0 |
| Claude API (early phases, tiered models) | $30–150/mo |
| Notion (you have it) + Telegram | $0–10/mo |
| Pod-specific tools as added (eRank, ElevenLabs, Printify, etc.) | $0–100/mo |
| One-time: LLC/registration, domain | varies by state |

Call it **$75–250/month** before pod-specific tooling, scaling with volume — and volume scaling means revenue is scaling.

---

## 8. Don't burn your Claude limits — how to actually build this

You flagged this yourself, and it's the right instinct. Three rules:

**1. Build in Claude Code, not in chat threads.** Claude Code (included with Pro/Max plans, also runnable on API billing) works directly in a project folder: it reads your files, writes your n8n workflows and scripts, and — critically — persists project context in `CLAUDE.md` files so every session *resumes* instead of restarting from zero. Long chat threads re-send the whole conversation every message, which is exactly what burns limits. Docs: https://docs.claude.com/en/docs/claude-code/overview

**2. Keep a `/jarvis` repo as the project's memory.** `architecture.md`, `operator-profile.md`, `pods/gov-contracting.md`, `pods/fiverr.md`, etc. Every build session starts with "read the repo, here's today's task." This is how a months-long build survives any session or limit boundary — including switching between your devices.

**3. Run the live system on the API, tuned for cost.** The running agents bill pay-as-you-go, separate from your chat plan. Keep it cheap with: model tiering (Haiku scans, Sonnet drafts, Opus only for weekly strategy), **prompt caching** for the Operator Profile and system prompts (cached input costs ~90% less on hits), and the **Batch API** for overnight bulk jobs like trend scans and transcript summarization (flat 50% off, results within hours). Stacked, these routinely cut spend by 80–95%. Details: https://platform.claude.com/docs/en/about-claude/pricing

---

## 9. Security ground rules (non-negotiable)

One API key per pod, least privilege. Approval gates on anything touching money, sending, submitting, or publishing. Treat all inbound content (emails, web pages, customer messages) as untrusted — agents never execute instructions found inside it. Secrets in the vault, never in prompts or Notion. Weekly encrypted backups (Notion export + server snapshot). 2FA everywhere. Master kill switch reachable from your phone.

---

## 10. Your first 7 days

**Day 1:** Order the mini PC or spin up the VPS. Create the Telegram bot (5 minutes via @BotFather). Start your LLC/EIN paperwork.
**Day 2:** Install n8n + Tailscale; confirm you can open the dashboard from your iPhone and iPad away from home.
**Day 3:** Write Operator Profile v1 (2–3 pages: goals, vision, voice, decision rules, the lessons from where you've failed and succeeded). This is the soul of the system — don't rush it.
**Day 4:** Restructure Notion (Vision page, Lessons DB, one pipeline DB per future pod). Connect the Notion API to n8n.
**Day 5:** Build workflow #1: voice memo → local Whisper → transcript filed in Notion → summary to Telegram. Small, but it's your full loop working end to end.
**Day 6:** Build workflow #2: morning briefing (calendar + inbox summary + top priorities) delivered to Telegram at 7 a.m.
**Day 7:** Begin SAM.gov registration. Pick your 2–3 Fiverr gig categories. Tell Claude Code: "Read the repo. Today we build the email triage agent."

---

## 11. Addendum — Your UGREEN NAS is the server

Good news: you already own the hardware this plan needs. UGREEN's NASync line runs UGOS Pro, which supports Docker and Docker Compose natively — so n8n, Postgres, the Telegram bot worker, local Whisper transcription, and the HQ dashboard all run as containers on the NAS. The 20TB becomes your asset vault: video renders for YouTube pods, music stems, design files for Etsy/POD, transcripts, and backups. Content businesses generate a shocking volume of files; you're covered for years.

For remote access, run Tailscale as a Docker container on the NAS (UGREEN's own documentation walks through the Compose setup at https://nas.ugreen.com/blogs/how-to/ugreen-nas-remote-access). Prefer Tailscale over UGREENlink, DDNS, or any port forwarding — exposed NAS devices are the #1 ransomware target in self-hosting, and Tailscale keeps yours invisible to the public internet entirely. One known UGOS quirk: it occupies port 53 and can fight Tailscale over DNS settings; the community guide at guide.ugreen.community documents the fix if you hit it.

Two honest caveats. First, RAID is not a backup — it protects against a dead drive, not ransomware, fire, or fat fingers. Keep an encrypted offsite copy (any cheap cloud) of the irreplaceable 1%: Notion exports, the Operator Profile, workflow configs, financial records. Second, CPU expectations: entry NAS chips (N100-class) handle the entire orchestration stack easily, and whisper.cpp with a small model transcribes voice memos fine — but heavy local AI (large models, image generation) will crawl. That's fine: in this architecture, the heavy reasoning lives on the Claude API anyway.

---

## 12. Addendum — The Habitat: JARVIS HQ

What you saw is real and very buildable: a live view where each pod is a room, each agent is an operator you can watch — working, idle, or standing at your desk needing a decision — like managing NPCs in a tycoon game.

**How it wires up.** Every n8n workflow gets two tiny extra nodes: a "status ping" at start and finish (plus on error) that writes one row to an `events` table (SQLite or Postgres on the NAS) — agent name, pod, state, activity text, money in/out. The HQ web app reads that table and renders the floor. It runs as one more Docker container on the NAS, reached over Tailscale, and saved to your iPhone/iPad home screen as a PWA so it opens like a native app. Approvals shown in the HQ call the same n8n webhooks your Telegram buttons do — same gates, two interfaces.

**Scope discipline.** The HQ is the most fun thing in this whole plan to build, which makes it the most dangerous: it earns $0. So v0 ships in one weekend (the demo file delivered with this plan is your starter code), and deeper polish — sprites, sound design, isometric art — is itself a milestone reward you unlock later, not a day-one task.

---

## 13. Addendum — The Game Layer (design spec)

**Ranks are revenue milestones.** Lifetime earnings across all pods set your rank:

| Earned | Rank | Unlocks |
|---|---|---|
| $0 | Garage | Chief of Staff, Fiverr Studio, Gov War Room (scout) |
| $1,000 | Workshop | Etsy & POD Workshop |
| $5,000 | Office | Content Lab (blog + affiliate + short-form) |
| $10,000 | Studio | Music Studio **or** Kids Animation Bay (pick one first) |
| $50,000 | Penthouse | Trading Watchtower (monitor-only) · supplements with counsel |
| $100,000 | Tower | First human hire (VA / sub-manager) |
| $1,000,000 | Empire | ??? (you'll know when you get there) |

**The mechanic that makes this brilliant rather than a toy:** room unlocks *are* the roadmap. You literally cannot open the Etsy Workshop until $1k is banked. The game enforces the sequencing discipline from Section 6 — the thing that kills most multi-hustle builders is spreading thin, and your own reward system now prevents it.

**XP rules (anti-vanity, important).** XP is earned only for: money banked, deliverables shipped, approvals handled, streaks kept (daily EOD review), debriefs requested on lost bids, quests completed. Never award XP for agent runs, tokens burned, or hours logged — you must never build a system that rewards the meter spinning.

**Quests.** The Sunday strategy agent (Opus) reads your goals and generates three weekly quests: "Get 3 sub quotes," "Ship 5 Fiverr orders," "Respond to 1 sources-sought notice." Completing all three = bonus XP.

**Loot table.** Write it now, before you're tempted to skip rewards: a real-world prize per rank (dinner out at $1k, the gadget you've been eyeing at $10k, a trip at $50k). Plus a trophy shelf (first 5-star review, first contract win, first $100 day), operator skins and room themes as cosmetic unlocks, and — strong recommendation — an old monitor or tablet wall-mounted in your office permanently showing the HQ floor.

---

## 14. Addendum — Three new pods

### Pod H: YouTube kids channel — read the warnings first

The honest platform reality: in July 2025 YouTube renamed its repetitious-content rule to "inauthentic content," explicitly demonetizing mass-produced and repetitive uploads, and enforcement has been aggressive since — including waves of terminations of large AI-driven channels in 2026. Separately, anything for children must be designated "Made for Kids" under COPPA, which disables personalized ads and comments (meaning far lower ad rates), and YouTube applies extra quality principles to kids and family content on top. Translation: the "AI slop kids channel" you've seen in get-rich videos is the single most likely-to-die business on your list.

The survivable version is a real show: one concept, consistent original characters, genuinely educational scripts (phonics, counting, colors, feelings), slower cadence and higher quality — a brand build, not an arbitrage. Pipeline: show bible → script agent → asset generation → assembly → **your full watch-through of every video before upload** → publish with Made-for-Kids designation and AI disclosure. The human-review gate is non-negotiable here and gets a hard rule in the Operator Profile: nothing reaches a child without your eyes on every frame. Slot this pod at the $10k rank, not before.

### Pod I: Music & beats

Tools in the Suno/Udio class can produce commercial-grade tracks, but commercial rights come with paid tiers — use one and keep your license receipts (the 2024–25 major-label lawsuits resolved toward licensing deals, so the space is legitimizing, but provenance is your protection). Revenue lanes: beat licensing on BeatStars/Airbit with consistent branding and tagging; lofi/ambient long-form YouTube and livestreams; sync libraries; selective streaming distribution — but do not mass-upload to Spotify, which actively purges AI spam. Workflow: the Producer generates in volume, *you curate ruthlessly* (release roughly one in ten), a metadata agent handles titles, tags, and cover art, and be careful with Content ID — only register tracks whose rights are verifiably yours.

### Pod J: Niche blog + affiliate (lives inside the Content Lab)

The 2021 playbook — publish 300 AI posts and collect Amazon commissions — is dead. Google's scaled-content and site-reputation policies buried those sites, and AI Overviews now absorb much of the top-of-funnel clicks that affiliate blogs lived on. What still works: one tight niche where you have genuine first-hand experience, fewer and better posts with original photos, data, and real testing, FTC affiliate disclosures on every page, and owning your audience directly (an email list from day one; Pinterest is the strongest non-Google traffic source in many niches). Set expectations: 6–12 months to meaningful traffic. Agents: a keyword/intent scout, an outline-and-draft producer that injects your actual experience from Notion, an internal-link maintainer, and a monetization auditor. You approve every post — your name is on the site.

---

*Next builds available on request: the actual n8n workflow JSON for any pod, the six agent prompts for a given pod, the SAM.gov polling script, the Operator Profile template, the Telegram approval-gate setup, or wiring the HQ demo to live n8n data. Pick one and we build it for real.*
