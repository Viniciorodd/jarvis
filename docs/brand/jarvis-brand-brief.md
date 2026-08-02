# JARVIS — Brand Design Brief

**Paste this whole file into Claude (or any design tool) and ask for the brand system.**
Everything below is real: taken from the running product, its actual design tokens, and the founder's own
words about what it's for. Where something is undecided, it says so — don't invent around it.

---

## 1. What Jarvis actually is

A **personal AI operations system** that runs a one-person enterprise. Not a chatbot, not a note app.

It scans federal contract opportunities, shreds solicitations into compliance matrices, sources and verifies
subcontractors, sends outreach, prices bids off real quotes, tracks the pipeline, handles taxes and money,
manages a 6,000-note Obsidian vault as its memory, and answers by voice with a camera it can look through.
It runs 18 named AI agents, each with an on/off switch and an autonomy tier its owner controls.

It is **self-hosted** — a NAS in the founder's house, a PC, and a phone. No third party holds a key or sees
a prompt. That independence is not a feature bullet; it's the point.

**One line:** *the system he hands work to.*

---

## 2. Who it's for

**Audience of one, then a few.**

Primary: the founder — a solo operator building a government-contracting business with no staff and no
safety net, who needs the machine to keep working while he's 200 miles away at a meeting.

Eventually: other solo operators who want the same thing. Not an enterprise SaaS buyer. Someone who would
rather own the machine than rent it.

**The feeling to design for:** *"I'm not alone in this."* Capability at your back. A calm, competent
presence that has been paying attention while you were away — not a product demanding engagement.

His actual words about why it exists: to build real wealth solo, for his future generations, for his partner
Ana, and to help others do the same. That weight should be felt in the restraint of the design, not stated.

---

## 3. What already exists — the live design tokens

These are pulled from the running interface. **Treat them as a starting point with real equity, not a
constraint.** If a stronger system exists, propose it and say why — but explain what's gained.

| Role | Value | Where it's used |
|---|---|---|
| Background | `#04070f` — near-black, slightly blue | every surface |
| Accent / signal | `#5abeb4` — teal | active state, agent presence, the orb, panel edges |
| Text | `#e8e6e1` — warm off-white | body copy |
| Muted | `#7d8b96` — cool slate | secondary text |
| Alert | `#e2857a` — soft coral | errors, the kill switch |

**Existing visual language worth keeping or evolving:**
- A **pulsing orb** that reacts to real audio levels — his voice and hers. It is the closest thing to a face.
- **Holographic panels** — translucent, blurred backdrop, thin teal border, a scanline sheen on the top
  edge. Data "materialises" and can be dragged, resized, waved away.
- A **◆ diamond** used as the mark today. It is a placeholder, not a considered logo.
- Type is currently **Inter**. Fine, unopinionated, not a decision anyone made.

---

## 4. What to produce

1. **Logo / mark** — must work as: a 16px favicon, a tray icon on Windows, a wordmark in the app header, and
   an app icon on an iPhone home screen. It sits on near-black almost always, so design for dark first and
   prove it survives light.
2. **The presence mark** — Jarvis is *listening, thinking, speaking, or idle*. Propose how the identity
   expresses those four states. This is more important than the static logo; it is what he looks at all day.
3. **Colour system** — evolve or replace §3. Include exact values, states (hover/active/disabled), and
   semantic roles (success, warning, danger, "waiting on you").
4. **Typography** — a display/UI face and a mono for data, numbers and code. Must be free-licensed and
   web-loadable. Numbers must be **tabular** — this UI is full of dollar figures and counts that align.
5. **Motion principles** — how things arrive and leave. There is already a "materialise" animation
   (~400ms, blur→sharp, slight rise). Define the rules, don't just decorate.
6. **Iconography direction** — currently Tabler icons. Keep, replace, or define usage.
7. **Voice-and-tone for the interface itself** — see §5, it is unusually specific.

---

## 5. Tone — the part most systems get wrong

Jarvis has a hard rule: **it never claims something it hasn't verified.** This is enforced in code, not
suggested in a prompt. It shaped the whole product and must shape the writing.

- **Never celebratory.** No "Great job!", no confetti, no "You're crushing it." He is running a business
  with real money at stake.
- **Says the hard thing plainly.** "Nothing went out." "I couldn't reach the server." "There is no screen
  for that." An honest failure is worth more than a smooth success message.
- **Never fills silence.** If nothing happened today, the end-of-day report doesn't send. A notification he
  ignores is worse than none.
- **Calm, brief, specific.** Numbers over adjectives. "30 waiting on you" not "you have several items."
- British-butler cosplay is the obvious trap. **Avoid it.** No "Certainly, sir." The reference point is
  competence, not theatre.

**Tone words:** calm · exact · unhurried · candid · present.
**Not:** perky, chatty, playful, motivational, mysterious, "magical."

---

## 6. Constraints

- **Dark-first, always.** It runs at 6am and at 2am. Light mode is secondary and may be dropped.
- **Legible while glanced at from across a room** — it lives on a desktop the founder walks past.
- **Phone and desktop.** Same identity, and the phone is where approvals actually get tapped.
- **It is not a company yet.** No investor gloss, no fake enterprise trust badges, no stock-photo people.
- Do not use the Iron Man / Marvel visual language. The name is a homage; the design must stand alone and
  must not create a trademark problem.
- The founder's other brand is **Rodgate** (a federal janitorial contractor, conservative and institutional
  by necessity). Jarvis is the **opposite pole** — private, technical, alive. They should not match. A
  faint family resemblance is acceptable; matching them would damage both.

---

## 7. Deliverable format

- Rationale first — 3–5 sentences on the strategic idea, before any visuals.
- **2–3 genuinely distinct directions**, named. Not variations of one.
- For the recommended direction: full tokens, type specs, logo lockups, the four presence states, and motion
  rules.
- State anything you'd advise **against**, and why.

**If a fact you need isn't here, ask rather than assume.** The product's core promise is that it doesn't
make things up; a brief for it shouldn't either.
