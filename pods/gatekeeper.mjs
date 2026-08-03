// gatekeeper.mjs — the true cost of yes.
//
// From `PRD — Jarvis Gatekeeper (protect the yes)`. His words:
//   *"People don't see me at a 9-to-5, so they think I'm doing nothing. They ask for favors, I cave, and they
//    take my time and eventually my money. When I want to come up with a reason to say no, I can never find one."*
//
// The reframe that makes it work, and the reason this file is arithmetic rather than advice: he doesn't need
// EXCUSES, he needs the true cost of yes. Excuses are fragile — they get caught and they compound. An
// evidence-backed boundary is unbreakable because it is TRUE. So every number here is computed, and the
// system is forbidden from inventing a conflict (PRD §6 — the system that lies for him would eventually lie
// to him; that is L-014 pointed at his personal life).
//
// NOT a refusal engine. His own example: the lake trip should get a YES — rest is a goal. This scores
// ALIGNMENT, and family gets a warmth-first default, because the point is protecting his capacity to care
// for the people he is building for, not walling them off.
//
// Three mechanics the PRD identified from the real JFK weekend, which no off-the-shelf tool models:
//   1. FAVOR CREEP — the ask that ruins you is never the first one. Score it as it will END UP.
//   2. RECOVERY COST — two days of driving cost four. Nobody counts the wreckage day.
//   3. RECIPROCITY DEBT — a legitimate debt got overdrawn 5×. Track owed → repaid → in credit.

const HOUR_RATE_DEFAULT = 60;      // $10k/mo ÷ working hours (PRD §2b)
const IRS_MILEAGE = 0.70;          // per mile, 2026

// ── 1. CREEP: the markers that predict an ask will grow ──────────────────────────────────────────
// Straight from the JFK case. Each marker is a thing that made that weekend stack: travel, several people,
// no fixed end, "since you're here", official paperwork, an open-ended return.
const CREEP_MARKERS = [
  ['travel', /\b(drive|ride|pick ?up|drop ?off|airport|station|bus|take (me|us|him|her|them)|road|trip)\b/i],
  ['multiple people', /\b(us|them|they|everyone|my (family|kids|parents|friends)|and (his|her|their))\b/i],
  ['open-ended return', /\b(back|return|round ?trip|and then|after that|stay|few days|couple days|weekend)\b/i],
  ['since-you\'re-here', /\b(since you'?re|while you'?re|as long as you|might as well|also|one more|quick)\b/i],
  ['official/paperwork', /\b(dmv|documents?|paperwork|application|immigration|forms?|notary|bank|appointment)\b/i],
  ['no fixed end', /\b(whenever|sometime|flexible|all day|the day|help (me|us) (out|with))\b/i],
];

// PURE: which stacking markers this request carries. Eval-pinned.
export function creepMarkers(text = '') {
  const t = String(text || '');
  return CREEP_MARKERS.filter(([, re]) => re.test(t)).map(([name]) => name);
}

// PURE: creep risk — probability the ask grows, and what it typically grows BY.
// The JFK weekend grew ~6×. We use a deliberately conservative multiplier so the warning is credible.
export function creepRisk(text = '') {
  const markers = creepMarkers(text);
  const n = markers.length;
  const risk = n >= 4 ? 'high' : n >= 2 ? 'medium' : n >= 1 ? 'low' : 'none';
  const multiplier = n >= 4 ? 2.5 : n >= 2 ? 1.6 : n >= 1 ? 1.2 : 1;
  return { markers, count: n, risk, multiplier };
}

// ── 2. RECOVERY: the invisible multiplier ────────────────────────────────────────────────────────
// PRD rule: pre-6am start, >4 hrs driving, or a >12-hour day → +1 recovery day; two in a row → +2.
export function recoveryDays({ startHour = null, drivingHours = 0, totalHours = 0, consecutiveDays = 1 } = {}) {
  const heavy = (startHour != null && startHour < 6) || Number(drivingHours) > 4 || Number(totalHours) > 12;
  if (!heavy) return 0;
  return Number(consecutiveDays) >= 2 ? 2 : 1;
}

// ── 3. THE COST ──────────────────────────────────────────────────────────────────────────────────
// PURE: the whole number. Everything is explicit so the report can show its work — a cost he can't see the
// arithmetic of is just another opinion, and opinions are what he already loses these arguments to.
export function trueCost({
  hours = 0, drivingHours = 0, waitHours = 0, miles = 0,
  tolls = 0, food = 0, fronted = 0,
  startHour = null, consecutiveDays = 1,
  hourRate = HOUR_RATE_DEFAULT, creepMultiplier = 1,
} = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const baseHours = num(hours) + num(drivingHours) + num(waitHours);
  const rec = recoveryDays({ startHour, drivingHours, totalHours: baseHours, consecutiveDays });
  // A recovery day is not a lost 24 hours — it is a degraded working day. Half a day is the honest figure.
  const recoveryHours = rec * 4;
  const totalHours = baseHours + recoveryHours;
  const cash = num(miles) * IRS_MILEAGE + num(tolls) + num(food) + num(fronted);
  const timeValue = totalHours * num(hourRate);
  const expected = Math.round(totalHours * (Number(creepMultiplier) || 1) * 10) / 10;
  return {
    baseHours: Math.round(baseHours * 10) / 10,
    recoveryDays: rec,
    totalHours: Math.round(totalHours * 10) / 10,
    expectedHours: expected,                       // what it becomes if it stacks
    cash: Math.round(cash * 100) / 100,
    timeValue: Math.round(timeValue),
    total: Math.round(cash + timeValue),
  };
}

// ── 4. RECIPROCITY: the debt he doesn't actually owe ─────────────────────────────────────────────
// From §3b, his own words: *"one simple meal shouldn't make me feel like I owe four days. The math doesn't
// add up."* He over-repays instantly and still feels indebted, because the debt was only ever FELT.
// This makes it visible in both directions. It is a PRIVATE MIRROR — never a scoreboard to wave at family.
export function reciprocity(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  const sum = (dir, key) => list.filter((e) => e && e.direction === dir).reduce((s, e) => s + (Number(e[key]) || 0), 0);
  const receivedH = sum('received', 'hours'), receivedC = sum('received', 'dollars');
  const givenH = sum('given', 'hours'), givenC = sum('given', 'dollars');
  const netHours = Math.round((givenH - receivedH) * 10) / 10;
  const netDollars = Math.round((givenC - receivedC) * 100) / 100;
  const settled = netHours >= 0 && netDollars >= 0;
  return {
    receivedHours: receivedH, receivedDollars: receivedC,
    givenHours: givenH, givenDollars: givenC,
    netHours, netDollars, settled,
    // Warm, never accusatory (PRD §3b guardrail).
    line: settled
      ? `You're ${netHours > 0 ? netHours + ' hours' : ''}${netHours > 0 && netDollars > 0 ? ' and ' : ''}${netDollars > 0 ? '$' + netDollars : ''} in credit here. You've been generous — you're free to choose.`.replace(/\s+/g, ' ').trim()
      : `You're still carrying about ${Math.abs(netHours)} hours of what they've given you. Repaying is fair.`,
  };
}

// PURE: is this "repayment" wildly out of proportion to what was received? The guard that stops legitimate
// gratitude turning into an open tab. A 30× exchange is not repayment, it is a new favor.
export function proportionality({ askHours = 0, owedHours = 0 } = {}) {
  const a = Number(askHours) || 0, o = Number(owedHours) || 0;
  if (a <= 0) return { ratio: 0, disproportionate: false };
  if (o <= 0) return { ratio: Infinity, disproportionate: true, note: 'There is no debt here — this is a new favor.' };
  const ratio = Math.round((a / o) * 10) / 10;
  return {
    ratio,
    disproportionate: ratio >= 3,
    note: ratio >= 3 ? `This ask costs ${a}h against ~${o}h received — about ${ratio}×. That isn't repayment, it's a new favor.` : '',
  };
}

// ── 5. VERDICT — never just "no" ─────────────────────────────────────────────────────────────────
// Four outcomes (PRD §3). DEFER is the default when it's close, because the cave happens in the moment —
// buying two hours converts a reflex into a decision.
export function verdict({ cost = {}, creep = {}, alignment = 'neutral', tier = 'friend', yesBudgetLeftHours = null, proportion = null } = {}) {
  const hours = Number(cost.totalHours) || 0;
  const inner = tier === 'inner';

  // Rest and relationships ARE goals. The lake trip gets a yes.
  if (alignment === 'serves') {
    return { verdict: 'yes', why: 'This serves something you actually want — rest and the people you\'re building for count as goals.' };
  }
  if (alignment === 'violates') {
    return { verdict: 'no', why: 'This runs against a boundary you already set for yourself.' };
  }
  if (proportion && proportion.disproportionate) {
    return { verdict: 'counter', why: proportion.note };
  }
  if (creep.risk === 'high') {
    return { verdict: 'counter', why: `This has ${creep.count} of the markers that made the JFK weekend stack — agree to a fixed scope, not an open one.` };
  }
  if (yesBudgetLeftHours != null && hours > Number(yesBudgetLeftHours)) {
    return { verdict: 'counter', why: `That's ${hours}h against ${yesBudgetLeftHours}h left in your helping budget this month.` };
  }
  // Family default is warmth-first: a small ask from the inner circle is simply a yes.
  if (inner && hours <= 3) return { verdict: 'yes', why: 'Small ask, inner circle. This is what the capacity is for.' };
  if (hours >= 8) return { verdict: 'no', why: `${hours} hours is most of a working day, plus what it costs you the day after.` };
  if (hours >= 4) return { verdict: 'defer', why: 'Big enough that you should not answer in the moment. Buy two hours.' };
  return { verdict: 'defer', why: 'Nothing here forces an answer right now — take the buffer.' };
}

// ── 6. THE SCRIPT — the part that actually solves it ─────────────────────────────────────────────
// In his voice (short lines, warm, direct, no over-explaining) and following his own sales doctrine applied
// to his life: ONE reason, not three. Stacked justifications invite debate. Say it once, then stop.
export function script({ verdict: v = 'defer', who = '', reason = '', counter = '' } = {}) {
  const name = String(who || '').trim();
  const hi = name ? `${name} — ` : '';
  const one = String(reason || '').trim();
  switch (v) {
    case 'yes':
      return `${hi}yeah, I got you. Let's do it.`;
    case 'counter': {
      // The counter comes from a model and has to slot into a sentence. A one-word fragment ("uber") reads
      // as broken English in the one message he actually sends, so anything that isn't a usable verb phrase
      // falls back. A clumsy script is worse than a generic one — he won't send either, but the generic one
      // doesn't embarrass him.
      const c = String(counter || '').trim().replace(/\.$/, '');
      const usable = c.length >= 8 && /\s/.test(c) && /^[a-z]/i.test(c);
      return `${hi}I can't do the whole thing, but I can ${usable ? c : 'do part of it'}. That work?`;
    }
    case 'no':
      return `${hi}I can't this time.${one ? ' ' + one : ''} I hope it goes smooth.`;
    case 'defer':
    default:
      // The single sentence that breaks the cave reflex (PRD §4). Always available, always first.
      return `${hi}let me check what I've got going and get back to you tonight.`;
  }
}
