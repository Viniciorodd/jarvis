# Stitch prompt pack — the Jarvis cockpit redesign

Paste these into **https://stitch.withgoogle.com**. Written 2026-07-17 against a full audit of the live
front-end, so every screen below reflects REAL data from REAL endpoints — nothing invented. Hand the
generated UI back to Claude to implement.

**How to use:** Stitch works best one screen at a time. Paste **§1 (Design system)** at the top of EVERY
screen prompt, then one screen block from §3. Generate desktop first, then ask Stitch for the mobile variant.

---

## §0 — What we're fixing (context for you, not for Stitch)

The audit found the cockpit has **12 separate government-contracting surfaces**, `/api/gov-board` rendered by
**4 different renderers with 4 disagreeing stage vocabularies**, quick-wins/teaming/map each built **twice**,
and **4 theme bootstraps with 3 conflicting palettes** (`govcon.css` even redefines `--ink` as *text* — the
opposite of `style.css`). The More menu is a junk drawer holding 9 things that are really just GovCon.

**The fix:** 5 destinations. One gov system. One theme contract. One board renderer. One stage vocabulary.

---

## §1 — DESIGN SYSTEM (paste at the top of every screen prompt)

```
Design a calm, premium, information-dense operations cockpit for a one-person government-contracting
company. The user is a solo operator: he is the CEO, the salesperson, and the only pair of hands. He is
not a developer. Every screen must answer "what is mine to do right now?" in under 3 seconds.

TONE: calm, confident, quiet. Think Things 3, Fantastical, Linear, and Notion — not a dashboard demo,
not a sci-fi HUD, no neon, no glow, no gradients-as-decoration. Generous whitespace. Restraint.

TYPOGRAPHY: Inter only (weights 300–800). No second typeface. Tracking slightly tight on headings
(-0.01em). Uppercase 11px labels with 0.12em letter-spacing for section eyebrows.

SHAPE: border-radius 14px on cards, 20px on pills, 50% on avatars/rings. 1px hairline borders.
Shadows only in light mode, and only barely.

COLOR — two themes, same layout, exact tokens (do not invent colors):

  DARK ("Jet Black", the default):
    page background #000000 · card #141417 · raised card #1c1c21
    primary text #f3f4f6 · secondary text #8b909a
    accent #43e6d4 (text on accent: #00201c)
    hairline rgba(255,255,255,0.09)
    warning #f0b45c · error #ff8f80 · success #5dcaa5

  LIGHT ("True White"):
    page background #ffffff · card #ffffff · raised card #f4f6f9
    primary text #181b22 · secondary text #68707d
    accent #0d9488 (text on accent: #ffffff)
    hairline rgba(17,24,39,0.10)
    warning #b45309 · error #c0392b · success #0d9488

RULES:
- Accent is for ONE thing per screen: the next action. Never decorate with it.
- Status is communicated by a small colored dot or a text chip, never by a full-color card.
- No emoji as primary UI. A single small glyph in a section eyebrow is acceptable.
- Data density is good; visual noise is not. Prefer a quiet table to a grid of colored boxes.
- Every screen works at 1440px desktop AND 390px mobile. Desktop must USE the width (multi-column),
  not render a phone layout in the center of a big monitor.
- Empty states are honest and instructive: say what's missing and what to do, never a fake number.
```

---

## §2 — INFORMATION ARCHITECTURE (paste with any navigation screen)

```
FIVE destinations in the bottom nav (mobile) / left rail (desktop). Nothing else is top-level:

1. HOME    — the glance. The ONE thing, what's waiting on you, today.
2. TODAY   — tasks + calendar + capture.
3. JARVIS  — talk to her (voice + chat).
4. OPS     — the businesses. One card each. This is where work lives.
5. MORE    — genuinely behind-the-scenes only.

OPS contains one card per business, each showing "whose move" (You / Jarvis):
   • GovCon OS   — the government contracting business (the main engine)
   • Finances    — money: lendability, income, tax, P&L, invoices
   • Real Estate — units, flips, rentals, deal analyzer
   • Side work   — Fiverr, Music, Web Studio

GOVCON OS IS ONE SYSTEM with four sections and one deep view. It absorbs what used to be six
separate pages (GovCon OS, Quick wins, Teaming radar, Capability statement, the Map, Deal Room):
   • Board    — the pipeline (default)
   • Find     — new work: quick wins + teaming radar + map (one screen, three lenses)
   • Subs     — the subcontractor bench
   • Journal  — decisions, wins, losses, debriefs
   + Opportunity (a deep drawer opened from anywhere)
   + Submit wizard (a focused full-screen flow)

MORE holds only: Focus & time, Ideas, Personal, Activity log, Floor, HQ, Command wall.
```

---

## §3 — SCREEN PROMPTS

### 3.1 HOME — the glance

```
Screen: HOME. A calm daily glance. Vertical rhythm, one clear focal point.

Top bar: small wordmark left; on the right three tiny status chips (system health, AI brain mode,
pause switch) and a settings gear. Chips are dots + one word, not badges.

1. APPROVALS TICKER — a single slim horizontal bar at the very top: "3 awaiting you" with the titles
   of pending approvals scrolling slowly. Tapping opens the list. If zero, the bar is absent entirely.

2. GREETING — "Good morning, Vinicio" + one quiet subline: "2 things need you today."

3. THE ONE THING — the hero. A single large card, the only accent-colored element on the screen:
   an eyebrow "THE ONE THING", a plain-English sentence describing the single most important action
   ("Submit the USACE janitorial bid — closes in 3 days"), and one primary button
   ("Walk me through it"). This card is the whole point of the screen. Give it room.

4. NEEDS YOU — a short stack of action cards. Each: what it is, one line of why, and two buttons
   (Approve / Pass). Include one card variant showing a drafted email preview (To / Subject / first
   lines) because approving genuinely sends it — the preview must be readable before tapping.

5. TODAY — max 5 task rows (checkbox, text, optional due chip) + "all →".

6. FOUR METRIC TILES — Opportunities · Needs you · Collected · AI spend. Small, quiet, each tappable.

7. PIPELINE — 5 compact rows (status dot, title, agency, stage) + "open the board →".

8. RECENT — a low-contrast feed of the last 5 things Jarvis did.

Mobile: single column, ticker → greeting → ONE THING → needs you → today → tiles (2x2) → pipeline.
Desktop 1440px: two columns — left (ONE THING, needs you, today), right (tiles, pipeline, recent).
Do NOT center a narrow phone column on desktop.
```

### 3.2 TODAY

```
Screen: TODAY. Tasks, calendar, capture. Feels like Things 3 married Fantastical.

Hero: large weekday + date ("Thursday, July 17").

TASKS: a quick-add input at the top with hint text "Add a task… #gov 📅 friday". Then two groups:
"Today & overdue" (overdue rows show a red-tinted due chip) and "Active". Rows: round checkbox,
text, optional tag chip, optional due chip. Completing animates the row out. Max 40 rows, scrolls.

CALENDAR: a segmented Day / Week / Month control. Month = a clean grid with event dots. Day/Week =
time-gridded events. An "add event" affordance that expands inline (title, date, time) — not a modal.

CAPTURE: a single always-available textarea, placeholder "Dump a thought — Jarvis will file it."
One quiet "Capture" button. This is a brain-dump, not a form.

Desktop: 3 columns (tasks | calendar | capture as a sticky right column).
Mobile: tasks first, calendar collapsible, capture as a floating "+" that opens a sheet.
```

### 3.3 JARVIS (talk)

```
Screen: JARVIS. Voice-first conversation. The calmest screen in the app.

Center: a single audio-reactive orb — a soft breathing ring that pulses subtly with the voice.
Elegant and minimal, NOT a particle explosion, NOT a sci-fi arc reactor. It idles almost still.

Below the orb: the live transcript — the last few exchanges as large, quiet, centered text. No
chat bubbles. It should read like a conversation, not a messaging app.

Bottom: a mic button (large, accent-colored when listening) and a text input as the secondary path.
A small "hands-free" toggle pill, clearly labelled, with a visible on/off state.

Right side (desktop only, ≥1100px): a slim glance rail — "Today" (3 tasks) and "Latest" (3 events).
On mobile this rail is absent, not squeezed.

When Jarvis pulls up a document/map/image, it appears as a floating glass panel above the transcript
that can be dismissed.

The background is plain page-background. No 3D brain, no particles, no animated mesh.
```

### 3.4 OPS — the businesses

```
Screen: OPS. The businesses. This is the operator's company, one card per business.

Header: "Operations" + a quiet subline "4 businesses · 2 need you".

A responsive grid of business cards. Each card:
  • a small monochrome glyph + business name + one-line tagline
  • a "whose move" chip: "You" (accent) or "Jarvis" (muted)
  • 2–3 live stats specific to that business
  • the single next action as a text link

Cards:
  1. GOVCON OS — "Federal janitorial contracts". Stats: 12 open opportunities · 3 proposals ready ·
     $480k pipeline. Next: "Submit the USACE bid — 3 days left". Whose move: You.
  2. FINANCES — "Money, credit, and lendability". Stats: $2,400 collected MTD (of $10k goal) ·
     14% lendability · 4 to review. Next: "Confirm your CAIVRS status". Whose move: You.
  3. REAL ESTATE — "Units, flips, rentals". Stats: 3 units · 1 flip active · $2,150 rent roll.
     Whose move: Jarvis.
  4. SIDE WORK — "Fiverr · Music · Web Studio". Stats: 0 open orders. Whose move: Jarvis.

Desktop: 2x2 grid of generous cards. Mobile: single column, full-width cards.
The GovCon card is visually primary (largest / first) — it's the main engine.
```

### 3.5 GOVCON OS — Board (the centerpiece)

```
Screen: GOVCON OS — BOARD. The single home for all government contracting. Replaces six separate pages.

Header: "GovCon OS" + a section switcher: [ Board ] [ Find ] [ Subs ] [ Journal ].
Right side of header: a "Capability statement (PDF)" text action and a ⌘K search affordance.

LANE STRIP — directly under the header, a single quiet line stating the doctrine:
"Your lane: janitorial · custodial · grounds · under $150k · Small-Business/SDB set-asides"
Anything outside this lane is marked, never hidden.

YOUR NEXT MOVE — one banner card, the only accent element: the single highest-priority opportunity,
plain English ("USACE janitorial BPA — submit by Friday"), with one button "Walk me through it".

THE BOARD — a kanban with exactly FIVE columns, this vocabulary and no other:
  Found → Scored → Responding → Submitted → Closed
Each column shows a count. Cards are compact and identical in every context:
  • title (2 lines max) + agency
  • a fit rating as 5 small stars
  • a set-aside chip; if the opportunity is OUT OF LANE show a clear ⛔ "out of lane" chip
  • a deadline chip that turns warning-colored at ≤7 days
  • a "whose move" row: "You" or "Jarvis" with a tiny avatar
  • on hover/tap: buttons — Submit step-by-step · Open on SAM ↗ · Won · Lost · Pass
Cards are draggable between columns. Closed column collapses to a count by default.

Below the board: a slim money band — Pipeline value · Projected profit · Waiting on you · Open deals.

Mobile: the 5 columns become a horizontally-swipeable set of stages with a stage-picker at top.
Desktop: all 5 columns visible at 1440px, using the full width.
```

### 3.6 GOVCON OS — Opportunity (the deep drawer)

```
Screen: GOVCON OS — OPPORTUNITY DETAIL. A full-height right-side drawer over the board (full screen
on mobile). This is where an operator decides and acts. It merges what used to be two rival drawers.

Header: title · agency · a deadline countdown ("closes in 3 days") · Open on SAM ↗.

1. FIT — a circular win-probability ring (e.g. "68%") beside 5 star-rated factors:
   Lane fit · Set-aside match · Size · Location · Past performance. Each row is a label + 5 stars.

2. THE 10-STEP LINE — a horizontal progress rail showing exactly where this deal is:
   Scouted → Scored → SOW pulled → Sub outreach → Quotes in → Priced → Proposal → Compliance →
   Submitted → Closed. Completed steps filled, current step accented, future steps hollow.

3. COMPLIANCE MATRIX — a REAL table, not bullets. Columns:
   # | Requirement (the "shall" statement) | Category | Status | Where it's addressed
   Status is ✅ addressed / 🟡 partial / ⛔ gap. Gaps sort to the top and are visually distinct.
   Above the table: "Requirements covered: 67% (2 of 3)" and, if gaps exist, a button
   "Have Jarvis fix these". A gap row's citation cell reads "—" (never a fabricated citation).

4. PRICE-TO-WIN — a horizontal distribution bar showing the market: min · p25 · median · p75 · max
   from comparable awards, with YOUR BID marked as a vertical line on it. Caption:
   "Comparable PA 561720 awards (n=275): median $78k · competitive band $26k–$78k. Your $61k bid
   sits at the 42nd percentile (competitive)." If the sample is too small or too large to be
   reliable, show that sentence INSTEAD of a number — never a confident wrong figure.

5. MONEY — sub quote → + contingency reserve → loaded cost → + markup → your bid → profit.
   Show it as a small vertical waterfall, each step labeled with its dollar value.

6. SUBS — the shortlist for this bid: 3 rows (name, tier: Primary/Backup, status: contacted /
   waiting 3d / responded / ⛔ excluded, quote if in). One "Reach out" button per row.

7. ACTIONS — a sticky footer: [ Walk me through submitting ] (primary) · Red-team this bid ·
   Ask Patricia about it · Won · Lost · Pass.
```

### 3.7 GOVCON OS — Find (quick wins + teaming + map, unified)

```
Screen: GOVCON OS — FIND. Three ways to find new work, ONE screen. Replaces /quickwins, /teaming
and the map overlay.

Header: "Find work" + a lens switcher: [ Quick wins ] [ Teaming ] [ Map ].
A shared filter row: a day-range select (3 / 7 / 14 / 30 days), a "hide closed" toggle, and a
"Scan now" button (this hits a live API, so show a loading state).

LENS 1 — QUICK WINS: a list of one-off / sources-sought jobs. Each row:
  score badge (0-100) · title · agency · "3d left" chip · tag pills (sources-sought / one-time /
  NAICS / set-aside) · a one-line "why this fits you" · actions: Open on SAM ↗ · Attach capability PDF.

LENS 2 — TEAMING: prime contractors who need small-business subs. Each row:
  score badge · prime company name · agency · state · NAICS · the award amount in dollars ·
  a one-line why · actions: "Draft intro" (opens a sheet with an EDITABLE email textarea, a clear
  notice that nothing sends without approval, and Copy / Attach capability buttons) · View award ↗.

LENS 3 — MAP: a US map, one pin per opportunity. Pin color: warning if ≤7 days to deadline,
accent otherwise. Soft bubbles behind it showing federal spend concentration by state, with a
legend (strong fit / due ≤7d / tracking / federal $). Beside the map, a deadline-sorted list
(place · due in Nd · score /100 · open ›). Clicking a pin or a row opens the Opportunity drawer.

Same filter row applies to all three lenses. Same card grammar as the board.
Desktop: map is large with the list as a right rail. Mobile: map on top, list below.
```

### 3.8 GOVCON OS — Subs (the bench)

```
Screen: GOVCON OS — SUBS. The subcontractor bench.

Header: "Subcontractors" + "12 on the bench · 2 waiting on a reply".

A table/list. Each sub row:
  • company name + trade + city
  • a Google rating (stars + review count) — this is how he judges an unknown vendor
  • a status chip: Prospect / Contacted / Waiting 3d / Responded / ⛔ Excluded
  • an exclusion state: "SAM: clear ✓ (checked today)" / "⛔ EXCLUDED — cannot subcontract" /
    "⚠ unverified — confirm at SAM.gov". This must be visible, never buried.
  • actions: Reach out · Open detail

SUB DETAIL (drawer): contact info, Google review excerpts, Jarvis's fit verdict in one sentence,
past quotes, and the outreach history (what was sent, when, whether they replied).

THE LADDER — a small panel per active bid: "Primary: ABC Cleaning — contacted 4 days ago, no reply.
Backup: XYZ Services — activating tomorrow." with a note that a backup only ever drafts an email
for your approval, never sends automatically.

REACH OUT (sheet): shows the drafted email in an EDITABLE textarea before anything is sent, with a
prominent line: "Nothing sends until you approve it."
```

### 3.9 GOVCON OS — Journal

```
Screen: GOVCON OS — JOURNAL. Decisions, wins, losses, debriefs. The learning loop.

Three sections:
1. DECISIONS — a timeline of bid/no-bid calls: date, opportunity, the call (Bid / No-bid), and the
   one-line reason recorded at the time. Quiet, chronological.
2. OUTCOMES — Won / Lost cards. Each shows the opportunity, the value, the date, and a
   "Debrief requested" / "Debrief received" state. Wins use success color sparingly; losses are
   NOT red — they're neutral. Losing is data here, not failure.
3. LESSONS — short text entries extracted from debriefs.

Header stat line: "8 decided · 1 won · 4 lost · 3 debriefs requested".
A standing note in the header: "We request a debrief on every outcome — win or lose."
```

### 3.10 SUBMIT WIZARD

```
Screen: SUBMIT WIZARD. A focused, full-screen, one-question-at-a-time flow. The operator is not a
contracts expert — this must feel like a calm assistant, not a form.

Chrome: a 6-dot progress indicator, a step kicker ("Step 3 of 6 · Safety check"), a big plain-English
question as the heading, one short explanatory subline, and a footer with 1 primary + 1 ghost button.
NOTHING else on screen.

Steps:
  1. Is this one worth bidding?  — the opportunity summary + fit, buttons: "Yes, write it" / "Pass"
  2. (writing…) — a calm loading state: "Patricia is writing your proposal. About a minute."
  3. Read it over — the proposal rendered as a readable document, buttons: "Looks good" / "Change something"
  4. Safety check — TWO cards: (a) the overall verdict with a shield/stop glyph and one sentence;
     (b) "Requirements covered: 67% (2 of 3)" with a list of the specific unanswered requirements
     in plain English. Button: "Have Jarvis fix these" + "Continue".
  5. Where it goes — the destination (email address or portal), the ready-made email (subject + body),
     Copy buttons, and "Proposal as PDF". Plain instructions for a non-expert.
  6. Confirm & submit — the final human gate. A clear statement of what will happen, then one
     deliberate button. This is the only irreversible action in the app; make it feel weighty
     but not scary.

The wizard must be resumable — show where you left off, don't restart at step 1.
```

### 3.11 FINANCES

```
Screen: FINANCES. One place for money. Today this is scattered across five surfaces; unify it.

Header: "Finances" + "Collected $2,400 of $10,000 this month".

1. MONEY IN — a progress bar toward the monthly goal, an "add income" inline form (source, amount,
   note), and the last 8 entries as a quiet list.

2. LENDABILITY — a readiness donut (e.g. 14%) + "1 of 7 packet items ready", then the packet
   checklist: EIN confirmed · D-U-N-S · reporting trade lines · business-credit score · business
   bank account · debt schedule · gov past performance. Each row: a check or hollow circle, the
   label, and a one-line detail. Below: trade lines (vendor, terms, "reports ✓" or "reporting
   unverified" chip, on-time %) and business-credit scores by source.
   A "Financing paths" note panel explaining which options are open.
   A "Needs verification" list for any claim without a source — this is a trust feature: a score
   without a source is never shown as fact.
   A "+" adds: trade line / payment / score / foundation.

3. TAX — upcoming deadlines as a short list, and "4 entries need review" linking to a review screen.
   THIS MUST HAVE A PERMANENT ENTRY POINT (today it's only reachable through a Home link that
   disappears when the count is zero).

4. P&L — revenue, expenses, net for the month. A simple table + a small trend line. (This is NEW —
   the data exists but has never had a screen.)

5. DEBT — the debt schedule: creditor, balance, monthly payment, status chip (paying / charged-off /
   disputed). Neutral presentation. No shame styling.

Desktop: 2 columns. Mobile: stacked, Lendability collapsible.
```

### 3.12 REAL ESTATE

```
Screen: REAL ESTATE. Currently buried in a legacy overlay; give it a real home.

Header: "Real Estate" + "3 units · 1 flip active · $2,150 monthly rent roll".

Tabs: [ Units ] [ Flips ] [ Rentals ] [ Analyzer ]

UNITS: property cards — address, photo placeholder, status chip, monthly rent, occupancy.
FLIPS: per-project budget bars (spent vs budget), timeline, next milestone.
RENTALS: a rent roll table — unit, tenant, rent, Section 8 HAP portion, paid/late chip.
ANALYZER: a deal-analysis form (purchase price, rehab, ARV, rent) → computed cash-on-cash,
cap rate, and a clear buy/pass readout.

Quiet, factual, table-forward. This is a landlord's ledger, not a marketing page.
```

### 3.13 MORE

```
Screen: MORE. A short, honest list. NOT a junk drawer.

Section "Your tools":
  • Focus & time — time tracking and streaks
  • Ideas — ideas waiting on your call
  • Personal — notes, journal, brain dump, people
  • Activity — the full log of everything Jarvis did

Section "Behind the scenes — optional":
  • Floor — see the agents at work
  • HQ — the game floor
  • Command — the wall display (for a TV)

Each row: a small glyph, a label, a one-line description, a chevron. That's all.
Nothing government-related appears here — it all lives in GovCon OS now.
```

---

## §4 — What Stitch must NOT do (paste as a constraint block)

```
- Do not invent metrics, fake charts, or placeholder numbers that look real. Use the values given.
- Do not use neon, glow, gradient fills, or glassmorphism as decoration.
- Do not put government contracting in more than one place.
- Do not use red for a lost contract — losing is data, not an error.
- Do not design a mobile layout and stretch it to desktop; desktop gets its own multi-column layout.
- Do not add a sidebar of decorative icons, a sci-fi HUD, or an "AI" motif.
- Do not show a status as a full-colored card; use a dot or a small chip.
- Do not hide the primary action below the fold.
```

---

## §5 — Implementation notes (for Claude, after Stitch returns)

The generated UI must bind to the existing endpoints — the data contract is fixed:

| Screen | Endpoints |
|---|---|
| Home | `/api/cockpit`, `/api/dashboard`, `/api/operations`, `/api/approve`, `/api/ideas-vault`, `/api/weather`, `/api/deals`, `/api/catchup`, `/api/team` |
| Today | `/api/cockpit`(+`/task/add`,`/task/complete`,`/capture`,`/event`), `/api/calendar` |
| Jarvis | `/api/chat`, `/api/stt`, `/api/tts`, `/api/cockpit` |
| Ops | `/api/businesses`, `/api/business?id=` |
| GovCon Board | `/api/gov-board`, `/api/gov-board/disposition`, `/api/deals` |
| Opportunity | `/api/gov/matrix`, `/api/gov/price-to-win`, `/api/gov/simulate`, `/api/opp-docs`, `/api/compliance-check`, `/api/sub-info` |
| Find | `/api/gov/quickwins`, `/api/gov/teaming`(+`/intro`), `/api/gov/spending`, `/api/operations` |
| Subs | `/api/sub-info`, `/api/sub-reach`(+`-preview`), `/api/gov/sub-ladder` |
| Journal | `/api/gov/journal`, `/api/gov/capture`(+`/outcome`,`/debrief`) |
| Wizard | `/api/gov/wizard`, `/api/pursue`, `/api/redraft`, `/api/compliance-check`, `/api/gov/matrix`, `/api/email-proposal`, `/api/gov/submit/record` |
| Finances | `/api/finance/credit`(+4 posts), `/api/money/log`, `/api/tax/status`(+`/review`), `/api/pl`, `/api/expense` |
| Real Estate | `/api/real-estate` |

**Debt to clear during implementation (from the audit):**
1. Kill 3 of the 4 `/api/gov-board` renderers; keep ONE component used everywhere.
2. Settle on ONE stage vocabulary (the 5 board stages); the 10-step rail lives INSIDE the opportunity.
3. Delete `/quickwins`, `/teaming`, `/dealroom`, the map overlay, and the `ops.js` gov tabs — but first
   port their unique parts (see the must-survive list).
4. Unify the theme: ONE bootstrap + ONE palette. `govcon.css` currently redefines `--ink` as *text*.
5. Fix: app lands on Talk not Home; Command wall auto-opens with no toggle; `orb.js` animates while
   hidden; `talkhome.js` fills hidden containers; the assistant FAB misses `govView`/`bizView`/
   `taxReviewView`; Tax Review has no nav entry; the Executive theme force-migrates away.
6. Build the missing surfaces: P&L, invoices, a real Real Estate home.

**Must survive the merge (unique today, unrecoverable elsewhere):** lane strip + out-of-lane ⛔ ·
disposition buttons · Submit Wizard · sub-reach preview + CRM drawer w/ Google reviews · the
approval-effect confirmation modal (the gate UI) · red-team simulate · Genome · decision journal ·
Deal Room's sub-quote money band · quick-wins tag pills + capability attach · teaming's editable
intro · federal-spend layer · Patricia chat.
```

---

## §6 — U2 PARITY GATE (the only irreversible step — do not eyeball it)

U2 deletes `/quickwins`, `/teaming`, `/dealroom`, the map overlay, the `ops.js` gov tabs, and 3 of the 4
gov-board renderers. **Deleting early destroys behaviour that exists nowhere else.** "Verified at parity" is
this checklist, not a judgement call. Every line must be TRUE in `/govcon-os` before anything is deleted.

**Status 2026-07-17 (night): 15/18 — U2 still BLOCKED on the Subs section.** (Idea Vault: `waiting`.)

| # | Must work in /govcon-os | Ported from | ✔ |
|---|---|---|---|
| 1 | Board renders every column the API returns, no hardcoded stages | govboard.js | ✅ |
| 2 | Lane strip + out-of-lane ⛔ marking | govboard.js | ✅ |
| 3 | Fit stars + whose-move + deadline chips | 4 renderers | ✅ |
| 4 | Won / Lost / Pass / Reopen dispositions | govboard.js | ✅ |
| 5 | Money band w/ honest empty state | /dealroom | ✅ |
| 6 | Opportunity drawer opens from a card | govcon-opp.js | ✅ |
| 7 | Compliance matrix as a real TABLE (req → status → citation) | govcon-opp.js | ✅ |
| 8 | Price-to-win distribution + your-bid marker | govcon-opp.js | ✅ |
| 9 | Money waterfall: quote → contingency → loaded → markup → bid | govcon-opp.js | ✅ |
| 10 | Red-team simulate | govcon-opp.js (footer) | ✅ |
| 11 | Opportunity Genome (win-prob ring + factor rows) | govcon-opp.js | ✅ |
| 12 | Patricia chat on an opportunity | govcon-opp.js links to old /govcon?opp= | 🟡 (linked, not reimplemented) |
| 13 | Quick wins: tag pills + why + capability attach + day select | govcon-find.js | ✅ |
| 14 | Teaming: **editable** intro textarea + View award ↗ | govcon-find.js | ✅ |
| 15 | Map: pins + federal-spend bubbles + deadline list + filters | govcon-find.js | ✅ |
| 16 | Subs: CRM drawer w/ Google reviews + sub-reach **preview** | **govcon-subs.js — NOT BUILT** | ☐ |
| 17 | **The approval-effect confirmation modal** (`ops.js:911`) — the doctrine's gate UI | **govcon-subs.js — NOT BUILT** | ☐ |
| 18 | Decision journal + win/loss + debriefs | govcon-journal.js | ✅ |

**⚠ Only Subs (govcon-subs.js) is left — #16 + #17.** The subagent building it died on the session limit
(resets 11am ET 2026-07-18) before writing the file. Its brief is the Subs spec in this session's history;
rebuild it as `companion/public/govcon-subs.js` registering `window.GovConSections.subs`. **Key finding it
surfaced before dying (saves the rebuild):** `ops.js` NEVER actually reads the GOV_AUTO_SEND state — its
"confirmApprove" modal HEDGES the wording rather than reading a real flag. So the approval-effect modal
(#17) must find where that state is truly exposed (`/api/connectors` or `/api/info` — verify) and, if it
genuinely isn't exposed anywhere, add a tiny read-only route that reports `GOV_AUTO_SEND` so the modal can
tell the truth instead of hedging. That is the doctrine's gate UI — it must never overstate.

**Order of deletion (each step verified before the next):**
1. Repoint the More menu + every internal link to `/govcon-os`; leave the old routes alive but unlinked.
2. Run a week on the new surface. Anything missing shows up here as a real gap, not a guess.
3. Delete the 3 redundant board renderers first (lowest risk — same endpoint, no unique behaviour).
4. Delete `/quickwins`, `/teaming`, `/dealroom`, the map overlay.
5. `ops.js` gov tabs LAST — it holds #12, #16, #17, and Real Estate still lives in that file (U5 must move
   Real Estate out **before** ops.js can be touched at all).

⚠ **`ops.js` is not just gov.** Real Estate (`🏢`, 5 tabs, `/api/real-estate`) has no other home. Deleting
ops.js before U5 lands a Real Estate surface removes the only way to reach the portfolio.
