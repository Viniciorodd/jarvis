# Rodgate Group — Design System

**Rodgate, LLC** (DBA **Rodgate Group**) is an owner-managed janitorial and facilities support
contractor in Nanticoke, Pennsylvania, bidding federal, state, and local government work in PA, NJ,
and FL. This repository is its brand system: tokens, components, document templates, and the rules
for using them.

The buyer is a **federal or state contracting officer**. They evaluate on responsibility and risk,
they work in printed and photocopied documents, and trendy reads as risky to them. Every decision
below follows from that.

---

## Strategic idea

Rodgate is a small company that has to look like a *safe award*. The system therefore behaves like a
**records document, not a website**: a near-black quarry slate, one restrained bronze accent, warm
paper neutrals, generous rules instead of shadows, and typography borrowed from official records
rather than from software marketing. The name supplies the mark — **"gate"**, drawn as a keystone
with an arch opening, which is also Pennsylvania's own emblem. Nothing in the system depends on
colour, gradient, or screen rendering to be legible: every asset survives 1-colour black, 1-colour
white, and fax-quality reproduction, because that is where it is actually judged.

### The three directions considered

1. **Keystone Ledger — recommended, and what this system is.** Slate + bronze + stone paper.
   Archivo / Source Serif 4 / IBM Plex Mono. Reads as a government records document. Distinctive in a
   stack of blue proposals without being loud.
2. **Field Standard — not built.** Industrial and utilitarian: safety-adjacent ochre, condensed
   grotesque, heavy black rules, stencil-influenced numbering. Strong for crews and vehicles; too
   close to a construction contractor for a proposal cover, and the ochre fails AA at body size.
3. **Commonwealth Serif — not built.** All-serif, engraved, near-monochrome, closer to a law firm or
   a bank. Extremely credible, but it reads *older and larger* than the company is and sets an
   expectation of scale Rodgate would have to defend.

### What I advise against

- **Heavy navy/royal blue.** The default of every govcon shop; it disappears in a stack of proposals.
- **Cleaning-industry clichés** — sparkles, bubbles, mops, swooshes, shining stars, bright greens.
  They read residential; Rodgate bids federal facilities.
- **The current site's register** (`jarvis/site/index.html`): Old Glory red/blue, star glyphs, emoji
  service icons, a Three.js globe, scroll-reveal and card-tilt. It is energetic and it undercuts the
  "safe award" read. The UI kit in `ui_kits/website/` keeps that site's *facts* and replaces its *look*.
- **Claiming anything beyond the real set-aside list.** Small Business, Small Disadvantaged
  (self-certified), Minority-Owned, Hispanic American Owned. Not 8(a), SDVOSB, WOSB, or HUBZone.
  This is a legal constraint, encoded in component docs, not a stylistic preference.

---

## Sources

| Source | What was taken |
|---|---|
| `jarvis/docs/brand/rodgate-brand-brief.md` (attached codebase, read-only) | The brief in full: verified company facts, audience, voice, constraints |
| `jarvis/site/index.html` | The live predecessor site (rodgate-llc.netlify.app). Content carried over; visual language deliberately replaced |
| `jarvis/docs/brand/jarvis-brand-brief.md` | The founder's *internal* Jarvis product, dark-mode `#04070f` / `#5abeb4`. Explicitly **not** a parent of this system |
| SAM registration facts quoted in the brief | UEI Z1SWBFEK7EM4 · CAGE 18S75 · NAICS 561720 / 561210 / 561990 |

There was **no existing logo file, icon set, photography, or font binary** anywhere in the sources.
See *Logo status* and *Iconography* below for what that means.

---

## CONTENT FUNDAMENTALS

The voice is documented, not invented — it comes from the founder's own corpus and sales doctrine.

**Register.** Professional/GovCon: the same directness as his public writing, formality up, **no emoji
at all**, no claim that cannot be backed. Public/marketing writing may be warmer, but on any surface a
contracting officer sees, it is flat and factual.

**Rules.**
- Short sentences. Line breaks between thoughts rather than long paragraphs.
- Address one person as **"you"**. The company is **"we"** or **"Rodgate"** — never "Rodgate Group is
  pleased to…".
- **Diagnose before you pitch.** Open on the reader's problem, not the service.
- **Sell the outcome**, not the thing. "Facilities kept to standard," not "premium janitorial solutions."
- **Price once, then stop justifying.**
- Answer the top 2–3 objections before they are raised.
- Never overstate certifications or past performance. A bracketed placeholder is correct; generic
  filler prose is not. (See the Past Performance block in the capability statement.)

**Casing.** Sentence case in prose and headlines. UPPERCASE with `--tracking-caps` only for eyebrows,
labels, buttons, table headers, and the wordmark. Never uppercase a full sentence.

**Numbers and codes.** Always monospaced, always exact: `Z1SWBFEK7EM4`, `18S75`, `561720`. Never
prettified, never abbreviated.

**Examples.**

> ✅ "Owner-managed. Crews sized to the requirement. Registered in SAM with an active All Awards
> registration through February 2027."
>
> ✅ "Tell us the buildings, the square footage, and the frequency. You get a price and a staffing
> plan — once, in writing."
>
> ❌ "World-class, innovative facility solutions delivering unparalleled excellence to our valued
> partners. ✨"

**Tone words:** direct · steady · accountable · plainspoken · earned.
**Not:** clever, edgy, corporate-vague, salesy, "innovative", "world-class".

---

## VISUAL FOUNDATIONS

**Colour.** Three families and nothing else.

| Role | Token | HEX | RGB | CMYK (coated, approx.) |
|---|---|---|---|---|
| Primary — Quarry Slate | `--slate-700` | `#2B3A42` | 43 · 58 · 66 | 78 · 58 · 47 · 32 |
| Text — Slate 900 | `--slate-900` | `#12181B` | 18 · 24 · 27 | 76 · 63 · 57 · 61 |
| Accent — Keystone Bronze | `--bronze-600` | `#8A6220` | 138 · 98 · 32 | 33 · 55 · 100 · 20 |
| Paper — Stone 50 | `--stone-50` | `#F4F2EC` | 244 · 242 · 236 | 3 · 3 · 7 · 0 |
| Card — White | `--white` | `#FFFFFF` | 255 · 255 · 255 | 0 · 0 · 0 · 0 |

CMYK values are conversions, not measured press values — confirm at first print run.
Semantics (`--green-600 #2E6B4B`, `--amber-600 #8A5B10`, `--red-600 #9B2A22`, `--info-600 #2B5566`)
are muted on purpose: a status colour should never out-shout the bronze.

Every text pairing clears WCAG AA at body size; most clear AAA. Bronze is for links, eyebrows, rules,
and exactly one button per page — never for body copy. In 1-colour work, slate becomes 100% black and
bronze becomes 60% black.

**Type.** Both text faces are free/open and Google-hosted, with Word/Docs-safe fallbacks.

| Role | Face | Fallback stack |
|---|---|---|
| Display, headings, UI, labels | **Archivo** 400/500/600/700 | Arial, Helvetica, sans-serif |
| Body prose, documents | **Source Serif 4** 400/600/700 | Georgia, Cambria, Times New Roman, serif |
| Codes, identifiers, data | **IBM Plex Mono** 400/500 | Consolas, Courier New, monospace |

Scale is a 1.200 minor third off a 15px UI base (`--text-2xs` 11 → `--text-6xl` 64). Headlines run
`--tracking-tight`; eyebrows and labels run `--tracking-caps` (+0.12em); the wordmark runs
`--tracking-mark` (+0.18em). Measure is capped at 68ch.

**Spacing + layout.** 4px grid, tokens `--space-1`…`--space-32`. Content container 1120px, narrow
column 720px, gutter 24px. Print margin 0.75in. Sections separate by space and rule weight, not by
alternating loud background colours — at most two background tones on a page (paper + one of white /
sunken / inverse slate).

**Corner radii.** Deliberately small: 2px, 3px, 4px. Nothing is pill-shaped except status dots and the
switch. Documents use 0.

**Cards.** White on paper, 1px `--border-hairline`, 4px radius, `--shadow-1`. One card per row may
carry a 3px bronze top edge (`accentEdge`) to lead a section. Cards do not lift, tilt, scale, or
rotate — on hover the border darkens and that is all.

**Borders + rules.** Three weights carry the whole structure: 3px slate (document headers, dialog
tops), 3px bronze at 44px wide (section openers), 1px hairline (table rows, card edges).

**Shadows.** Three levels, cool grey (`rgba(18,24,27,…)`), never black, never large. No inner shadows,
no glows. Elevation is the exception, not the layout tool.

**Backgrounds.** Flat colour only. **No gradients, no photography, no illustration, no pattern, no
texture, no full-bleed hero image.** The dark hero is flat `--slate-800` with a 3px bronze bottom rule.
This is a deliberate constraint: the brand has no photo library, and stock imagery of smiling cleaners
would undo the credibility the rest of the system is buying.

**Transparency + blur.** Effectively none. The only translucency in the system is
`rgba(255,255,255,.03)` panel fill and `rgba(255,255,255,.16)` borders on slate surfaces, plus a
`rgba(18,24,27,.52)` dialog scrim. No backdrop-filter anywhere — it does not print and it reads as SaaS.

**Motion.** Functional only. 80/120/180/260ms with `cubic-bezier(.2,0,.2,1)`. Hover changes colour;
press nudges 1px down; dialogs fade. **No scroll-reveal, no parallax, no card tilt, no bounce, no
count-up numbers** — all four of which the predecessor site used and none of which survive here.

**States.** Hover = darker fill (`slate-700 → slate-800`, `bronze-600 → bronze-700`) or a stone tint on
quiet controls. Press = 1px translate. Focus = 2px bronze outline at 2px offset, or a 3px
`rgba(138,98,32,.16)` ring on fields. Disabled = 42% opacity, never a colour change.

**Imagery.** None in the system today. If photography is ever added, the rule is: real crews, real
sites, cool-neutral grade, no stock smiles, no motion blur, no colour pops.

---

## ICONOGRAPHY

The sources contain **no icon system** — the predecessor site used emoji (🧹 🌿 🚛 🏢) as service icons
and a "★" as a list bullet. Neither is carried forward: emoji are explicitly out of the professional
register, and the star belongs to the patriotic direction being replaced.

**Substitution (flagged):** the system uses **Lucide** from CDN
(`https://unpkg.com/lucide@0.544.0/dist/umd/lucide.js`), stroke width **1.75**, 22px in cards and
15–16px inline. Lucide is open-licensed, geometric, and unfussy — it matches the type without
decorating it. *This is a substitution, not something found in the sources.* If Rodgate would rather
own its glyphs, say so and they can be drawn to the mark's geometry instead.

**Rules.** Icons are line only, never filled, never in a coloured circle or rounded tile. They inherit
`currentColor`, sit at slate or bronze, and never appear at more than one weight in a view. Emoji are
never used on any surface a contracting officer sees. Unicode characters (·, —, ★) are typographic
only: the middot separates codes, the em dash sets off clauses, and the star is not used at all.

---

## Logo status

The sources contained **no logo file**. The mark in `assets/` is therefore an **original proposal**,
not a recovered asset: a keystone tapering downward with an arch opening cut from its base — "gate"
in the name, keystone for Pennsylvania, an aperture rather than a picture of a service. It is one
closed path, so it holds at 16px, survives 1-colour and fax, and embroiders in two threads. The
wordmark is set in Archivo 700 at +0.18em, always "RODGATE", never "RodGate".

**This is a proposal awaiting the founder's decision.** If it is not the direction, the entire system
still stands — every other asset works with a plain-type wordmark.

Files: `assets/logo-mark.svg` (slate), `-black.svg`, `-white.svg`, `-bronze.svg`.
Lockups are composed in code by the `Logo` component.

---

## Index

### Root
| File | What it is |
|---|---|
| `styles.css` | The single entry point consumers link. `@import`s only. |
| `thumbnail.html` | Homepage tile for this system. |
| `readme.md` | This document. |
| `SKILL.md` | Agent Skill front-matter, for use in Claude Code. |

### Tokens — `tokens/`
`typography.css` (families, scale, weights, tracking) · `colors.css` (ramps + semantic aliases) ·
`spacing.css` (4px grid, radii, layout) · `elevation.css` (three shadow levels) ·
`motion.css` (durations, easing) · `base.css` (element resets, link styling, print rules).

### Components
| Group | Components |
|---|---|
| `components/brand/` | **Logo** |
| `components/core/` | **Button**, **IconButton**, **Badge**, **Tag**, **Card**, **SectionHeading** |
| `components/forms/` | **Input** (+ **Textarea**), **Select**, **Checkbox**, **Radio** (+ **RadioGroup**), **Switch** |
| `components/data/` | **SpecTable**, **StatBlock** |
| `components/navigation/` | **Tabs** |
| `components/feedback/` | **Dialog**, **Toast**, **Tooltip** |

No source defined a component inventory, so this is the standard primitive set sized to the brand's
real surfaces. **Intentional additions:** `Logo` (the lockup must not be re-typeset by hand),
`SectionHeading` (the eyebrow + bronze-rule opener recurs on every surface), `SpecTable` and
`StatBlock` (the verified-facts table is the single most-read element in the whole brand and must be
impossible to get wrong).

### Foundations — `guidelines/`
21 specimen cards covering the slate ramp, the bronze ramp, stone neutrals, semantics, measured text
pairings, B&W survivability, the four type roles and their pairing, spacing, radii, rule weights,
elevation, motion, logo lockups, clear space, misuse, and voice.

### UI kits — `ui_kits/`
| Kit | Screens |
|---|---|
| `website/` | Home · Services · Capability statement · Contact (click-through) |
| `documents/` | Proposal cover · Capability statement · Letterhead · Email signature (US Letter at 96dpi) |
| `applications/` | Business card · Uniform embroidery mark · Vehicle decal · Job-site sign |

### Assets — `assets/`
Keystone mark in slate, black, white, and bronze. No photography, no illustration, no icon binaries
(Lucide loads from CDN).
