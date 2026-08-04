# CLAUDE.md — Rodgate Group website

## ⚠️ This project has a published design system. It outranks generic design skills.

`src/styles/ds/` holds the **Rodgate Group Design System** ("Keystone Ledger") token files,
exported verbatim from the published system. **Never edit them — re-export instead.**
`src/styles/tokens.css` adds only this site's component classes, on top of those tokens.

Do **not** invoke `ui-ux-pro-max` to pick a palette, font pairing, or component style for this
repo. That skill exists to choose a design direction; this project already has one, chosen and
documented. Using it here would reintroduce exactly the register the system was built to replace.
Use it only if asked to design a *new* surface that the system does not cover — and even then,
the tokens below win on colour, type, spacing, radii, and motion.

Full system readme: `src/styles/ds/DESIGN-SYSTEM-README.md`.

## The strategic idea (read before changing anything visual)

Rodgate is a small company that has to look like a **safe award**. The system behaves like a
**government records document, not a website**. The buyer is a federal or state contracting
officer: they evaluate on responsibility and risk, they work in printed and photocopied
documents, and **trendy reads as risky to them**.

Nothing may depend on colour, gradient, or screen rendering to be legible. Every surface has to
survive 1-colour black, 1-colour white, and fax-quality reproduction — that is where it is judged.

## Hard rules — do not "improve" these

- **Flat colour only.** No gradients, photography, illustration, pattern, texture, or
  `backdrop-filter`. The dark hero is flat `--surface-inverse` with a 3px bronze rule.
- **Radii 2–4px.** Nothing pill-shaped except status dots and the switch. Documents use 0.
- **Motion is functional only.** 80/120/180/260ms, `--ease-standard`. Hover changes colour;
  press nudges 1px down. **No scroll-reveal, no parallax, no card tilt, no bounce, no count-up.**
- **Cards do not lift, tilt, scale, or rotate.** On hover the border darkens. That is all.
- **Bronze** = links, eyebrows, rules, and **exactly one button per view**. Never body copy.
- **At most two background tones per page** (paper + one of white / sunken / inverse slate).
- **No emoji on any surface a contracting officer sees.** Icons are Lucide, stroke 1.75, line
  only — never filled, never in a coloured circle or rounded tile.
- **Sentence case** in prose and headlines. UPPERCASE + `--tracking-caps` only for eyebrows,
  labels, buttons, table headers, and the wordmark. Never uppercase a full sentence.
- **Codes and identifiers are always monospaced and exact** — `Z1SWBFEK7EM4`, `18S75`, `561720`.
  Never prettified, never abbreviated.
- Wordmark is always **RODGATE**, never "RodGate".

## Facts — legal constraint, not style

`src/data/company.js` is the **single source of truth**. It mirrors the vault's Canonical Facts
table (`00 - System/🧠 Lessons Ledger.md`). Never re-compose a fact from memory; edit that file
and re-audit against the table.

Rodgate holds: **Small Business · Small Disadvantaged (self-certified) · Minority-Owned ·
Hispanic American Owned**. It does **not** hold and must **never** be shown as 8(a), HUBZone,
SDVOSB, or WOSB. This is a legal constraint.

Never overstate past performance. A bracketed placeholder is correct; generic filler prose is not.

## Voice

Short sentences. Line breaks between thoughts. Address one person as "you"; the company is "we"
or "Rodgate" — never "Rodgate Group is pleased to…". Diagnose before you pitch. Sell the outcome,
not the thing ("Facilities kept to standard", not "premium janitorial solutions"). Price once,
then stop justifying. Tone: direct · steady · accountable · plainspoken · earned.

Run `stop-slop` on any marketing or landing copy before it ships.

## Workflow

- Bugs → `superpowers:systematic-debugging` before proposing a fix.
- Before claiming done → verify with evidence (a build, a rendered check), not assertion.
- Before installing any external code → repo security audit, logged CLEAN verdict required.

## Build

```bash
npm install && npm run build   # static output → dist/
npm run preview                # serve dist/ at :4321
```

Deploys to Netlify (site `rodgate-group`). See `README.md` for the go-live checklist.
