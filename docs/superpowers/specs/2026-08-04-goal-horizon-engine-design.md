# Spec — The Horizon Engine (goals, reverse-engineered from reality)

**Date:** 2026-08-04 · **Status:** design, NOT built · **Supersedes the model in:** `pods/goal-registry.mjs`
**Related:** `PRD — Goal Visualizer & Reverse-Engineering Engine` · `🎯 Goal Registry — 10 years, every source`
**Product intent:** the operator intends to sell this as software. Design it so the engine is separable from
his data — see §10.

---

## 1. What he actually asked for, in his words

> *"the whole point of the system is for me to have long term vision and long term goals that will take 10 20
> years and then see the reverse engineering to get there, what neeeeeds to happen before i get there."*

> *"right now i just see another to-do list, another tracker, not what i described."*

> *"when i said that we need to show the connection of things is that if i want a new lambo, and i also want to
> buy a business doing $1m usd per year, maybe those two goals can be related because if i buy the business, i
> could probably lease the lambo too.. so which other goals can be accomplished along side other."*

> *"I like graph views connecting from the bottom up, and then we have to look at my current reality, and
> generate tasks and to dos based on my reality so that i could get to the business purchase."*

Earlier, and still binding:

> *"having written goals sometimes feels like writing something and putting it on a shelf and never seeing
> them again… if you're not constantly thinking about a goal, seeing it, you're not pursuing it."*

---

## 2. Why what shipped is not that

`pods/goal-registry.mjs` + `/goals` (2026-08-03) model goals as **things that need actions**, rank actions by
how many goals they unblock, and render a flat list plus a hub-and-spoke graph.

It is a good filter. It is not a horizon engine. Three specific failures against his description:

| He asked for | What shipped | Why it misses |
|---|---|---|
| 10–20 year vision, reverse-engineered | A ranked list of 23 actions | There is **no time axis at all**. A 20-year goal and a this-week task are the same kind of node. |
| "which goals can be accomplished alongside others" | Goals that share a prerequisite | **Wrong relation.** The Lambo is not a sibling of the business — it is a *consequence* of it. |
| Bottom-up graph from current reality | Force-directed hub | A hairball has no direction, so it cannot show a climb. And **nothing anchors to his actual numbers**. |
| Tasks generated from reality | Static `req[]` from a hand-built file | The chain never consults what is true today, so it never changes as his situation changes. |

He is right that it reads as a tracker. A tracker tells you what is on the list. He wants to see the
**ladder** — and the ladder has to start at the rung he is standing on.

---

## 3. The reframe: goals connect through CAPABILITIES, not through tasks

This is the whole design, and it comes directly out of his Lambo example.

Decoded, what he said is:

- **"Buy a business doing $1M/yr"** — once achieved — **produces** durable capability: owner earnings of
  roughly $150–250k/yr, business credit, collateral, an operator track record.
- **"Lease a Lamborghini"** — **requires** capability: roughly $4k/mo of sustained discretionary cash, plus a
  credit threshold.
- The business's *production* exceeds the Lambo's *requirement*. Therefore **the Lambo comes with the
  business.** It is not a second ten-year pursuit. It is a byproduct.

That is what "accomplished alongside" means, and no amount of shared-prerequisite maths will ever produce it.
Shared prerequisites answer *"what do these two have in common?"* Capabilities answer *"what does this one
hand me for free?"* — which is the question he actually asked.

### The three edge types

```
requires   goal → capability @ threshold      "a $1M business needs $200k down + 2 filed years + 680 FICO"
produces   goal → capability @ level          "a $1M business yields ~$200k/yr owner earnings + collateral"
affords    goal ⇒ goal                        DERIVED, NEVER STORED
```

`affords(A, B)` holds when **A's production covers every one of B's requirements that reality does not already
cover.** It is recomputed whenever anything changes, exactly as `unlocks` is today, and for the same reason:
a stored derived edge is a stale edge.

This one relation is the product. It is what turns a wish list into *"do this one thing and these four others
come with it."*

### Capability ledger (the vocabulary both sides speak)

A small, closed set — closed on purpose, because free-text capabilities would drift into unmatchable strings,
which is precisely the failure mode of the string-matching engine this replaces.

| Capability | Unit | Where his real value comes from |
|---|---|---|
| `monthly_net` | $/mo | money dashboard · tax pod |
| `liquid_capital` | $ | accounts |
| `credit_score` | FICO | lendability desk |
| `business_credit` | tier | lendability desk |
| `filed_years` | count | tax pod (**already a modelled blocker — `a_taxes`**) |
| `collateral` | $ | real-estate portfolio |
| `debt_load` | $/mo | debt tracker |
| `free_hours` | hrs/wk | focus pod |
| `past_performance` | count | gov pipeline |
| `legal_clear` | bool | the Charles matter |
| `operating_entity` | bool | Rodgate LLC |

---

## 4. Current reality is layer 0, and it is LIVE

The bottom rung is not typed in. Jarvis already knows most of it, and that is the differentiator against every
vision-board app on the market: **their bottom row is a form; his is a feed.**

```
reality() → { monthly_net: 3350, filed_years: 0, credit_score: …, debt_load: …, free_hours: … }
```

Rules that must hold:

- **Every value is sourced and dated.** A capability with no source renders as *unknown*, never as zero.
  Zero is a claim; unknown is the truth. (Standing rule after L-012, and the registry's *"Nothing inferred
  is asserted."*)
- **Unknown blocks a promise, not the view.** If `credit_score` is unknown, the engine says the gap is
  unknown and names what to check. It does not quietly assume the good case, and it does not assume the bad
  one either.
- Reality changes → the whole ladder recomputes. That is the anti-shelf mechanism working: the picture is
  different next month because *he* is different next month.

---

## 5. Bottom-up layout

The y-axis is **time-to-reach**, not force. He asked for bottom-up and he is right: a climb should look like
a climb.

```
   ▲  10–20 yr    the ranch · generational wealth · the hospital · mother never worries
   │   3–10 yr    holdco · $10M net worth · the $1M business
   │   1–3 yr     first gov award · debt cleared · 2 filed years · REDOS earning
   │   0–12 mo    sends going out daily · first award · occupancy
   ●  TODAY       $3,350/mo · 1 unit · 2 proposals sent · 0 filed years   ← live, from his own data
```

Layer assignment is **derived from the capability gap**, not hand-typed: how far his reality is from the
requirement, at his current rate of change. A goal whose gap is large and whose rate is small sits high. This
means the ladder re-layers itself as he moves — which is the entire point of not making it a static tracker.

Rendering: layered DAG (Sugiyama-style — assign layers, order within layer to reduce crossings, straighten).
Same "no CDN" constraint as today; this is more code than the spring layout but not much more.

---

## 6. Task generation, bounded by reality

Pick a target — *"buy a business doing $1M/yr"* — and the engine walks DOWN, not up:

1. Diff the goal's requirements against reality → the unmet set.
2. Take the **lowest** unmet capability that nothing else blocks.
3. Emit concrete, dated, startable to-dos for that one.
4. Show what the ladder looks like after it is met, including any `affords` edges that light up.

For the $1M business, against his real position today, that is roughly:

- `filed_years: 0 → 2` — **the true gate**, and it is already in his registry as `a_taxes`. Nothing about the
  business purchase is real until this moves. Two years is a *calendar* constraint, not an effort one, which
  is exactly the kind of fact a to-do list hides and a horizon engine must show.
- `monthly_net: $3,350 → $10k+` — SBA 7(a) DSCR and the down payment both trace back here, and this traces
  back to sending.
- `liquid_capital → ~$100–200k` for 10% down plus working capital.

And then the payoff he described: once `monthly_net` clears, **the Lambo's requirement is already covered** —
so it renders as afforded, with no separate plan, no separate effort, and no guilt attached to it.

### Guardrails on generation (non-negotiable)

- Never emit an action that trips `violatesBoundary()` — trading, flips, new ventures, set-aside claims,
  >$10 unasked, public traction claims. Already built; must gate every generated task.
- Never generate for a `dream`-tier goal unless he promotes it. The engine is a filter first.
- 🚨 The **crisis-content suppression list** stays in front of every import path. Non-negotiable, permanently.
- Tone rules hold: no gap number on a heavy day, no "behind", no scoreboard.
- A generated task is a **proposal**. It lands in the candidate queue for his yes — code disposes, and he
  disposes of code.

---

## 7. Data model changes

Additive to his curated `goals.json` — it stays hand-editable, and we still never rewrite it.

```
Goal    + horizon: 'now'|'1y'|'3y'|'10y'|'20y'     his intent, asked once, never inferred silently
        + requires: [{cap, op, value}]              replaces the coarse req[] over time
        + produces: [{cap, value, confidence}]      NEW — the half that makes `affords` possible
Cap     id · label · unit · source · asOf           the closed ledger from §3
Reality {cap: {value, source, asOf}}                derived live; never stored as truth
```

`req[] → action.id` stays valid and keeps working. `produces` is the new information, and most of it does not
exist yet — see §9.

---

## 8. Build phases

| # | Deliverable | Notes |
|---|---|---|
| 1 | Capability ledger + `reality()` sourced from the live pods | pure + eval-pinned; unknown ≠ zero |
| 2 | `requires`/`produces` on goals; derived `affords` | the core; the Lambo case is the eval |
| 3 | Bottom-up layered graph | replaces the force layout on `/goals` |
| 4 | Gap → task generation, boundary-gated | proposals only, into the candidate queue |
| 5 | Re-layer on reality change + "what changed since last month" | the anti-shelf loop |

---

## 9. Open questions — these need HIM, and the engine is guesswork without them

1. **Horizons.** 91 goals have no target date. Ten years of writing tells us when he *wrote* a goal, never
   when he wants it. This cannot be inferred without asserting something false.
2. **`produces` values.** What a $1M/yr business actually yields him is a real financial estimate, not a
   number I should invent. Same for every goal that produces anything.
3. **Reality values not already in Jarvis.** Credit score and liquid capital are not wired yet.
4. **Does `affords` need his confirmation before it renders?** Saying "the Lambo comes free with the business"
   is a strong claim. Recommendation: render it as *afforded — unconfirmed*, consistent with everything else.

---

## 10. Product notes (he intends to sell this)

> *"remember i want to make this into a software later on to sell it"*

- **The moat is §3 + §4**, not the graph. Vision-board apps are a crowded, low-LTV category; a capability
  engine whose bottom row is wired to the user's real financial position is not a vision-board app. The PRD
  scored the SaaS 1/2 on "Differentiated" — this model is the thing that would raise it.
- **Build the engine data-agnostic.** `goals.json` is his; the engine must take any registry. Keep the pure
  modules free of vault paths (`pods/goal-registry.mjs` already is; keep it that way).
- **The capability ledger is the schema a customer would fill.** Closed vocabulary = the product's API.
- ⚠ **The park gate still stands.** His own boundary: *"no new ventures / no FOMO"*, *"nothing starts while
  gov is #1 and REDOS is unfinished."* The PRD says it best — building a goal app instead of sending
  proposals would be the single most ironic instance of the exact pattern this registry proved. **Track 1
  (personal, inside Jarvis) is in scope now. Track 2 (the product) stays parked until REDOS earns.** This
  spec exists so that when the gate opens, the design is already written and dated.

---

## 11. What must not regress

- 🚨 `isCrisisContent()` in front of every import path. His journals contain *"I want to die."*
- The six hard boundaries, enforced in code.
- Tiers: dream-tier is surfaced, never planned.
- Compassion clause + Hard Day Protocol on every new surface.
- Nothing inferred is asserted — horizons, `produces` values, and `affords` all render unconfirmed until he
  says otherwise.
