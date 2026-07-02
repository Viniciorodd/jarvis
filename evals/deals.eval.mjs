// Evals for the gov MIDDLEMAN pipeline core: pricing math (money in CODE — directive #1), the deal
// state machine (the linear line the operator asked for), the SOW-url detection that fixes scoring
// blind, and the inbox presort. Pure functions only — no network, no disk.

import { parseMoney, parseQuote, middlemanPrice, pricingLine } from '../pods/gov/pricing.mjs';
import { STAGES, stageIndex, advanceState, dealGaps, whoseMove } from '../pods/gov/deals.mjs';
import { isDescriptionUrl, htmlToText } from '../pods/gov/sow.mjs';
import { presort, foldClassification, digestText } from '../pods/inbox/triage.mjs';

export default {
  agent: 'gov-deals',
  cases: [
    // ── pricing: the middleman money math ─────────────────────────────────────────────────────────
    { name: 'parseMoney: "$4,200/mo" → 4200; "5k" → 5000; garbage → null',
      run: () => {
        const a = parseMoney('$4,200/mo'), b = parseMoney('roughly 5k'), c = parseMoney('call us');
        return { pass: a === 4200 && b === 5000 && c === null, detail: `${a} / ${b} / ${c}` };
      } },

    { name: 'parseQuote detects the billing period (month/year/hour/total)',
      run: () => {
        const m = parseQuote('$4,200/mo'), y = parseQuote('$48,000 annually'), t = parseQuote('$12,500');
        return { pass: m.period === 'month' && y.period === 'year' && t.period === 'total', detail: `${m.period}/${y.period}/${t.period}` };
      } },

    { name: 'middlemanPrice: quote × (1+markup) = bid; profit is the spread (default 18%)',
      run: () => {
        const p = middlemanPrice({ quote: 10000, markupPct: 18 });
        return { pass: p.bid === 11800 && p.profit === 1800 && p.subQuote === 10000, detail: JSON.stringify(p) };
      } },

    { name: 'middlemanPrice clamps markup to the 5–60% sanity band (a typo can\'t sink a bid)',
      run: () => {
        const hi = middlemanPrice({ quote: 1000, markupPct: 400 });
        const lo = middlemanPrice({ quote: 1000, markupPct: 0.5 });
        return { pass: hi.markupPct === 60 && lo.markupPct === 5, detail: `${hi.markupPct}% / ${lo.markupPct}%` };
      } },

    { name: 'middlemanPrice: no usable quote → null (never invent a price)',
      run: () => { const p = middlemanPrice({ quote: 'TBD' }); return { pass: p === null, detail: String(p) }; } },

    { name: 'pricingLine renders the human-readable money line',
      run: () => {
        const s = pricingLine(middlemanPrice({ quote: 4200, markupPct: 18 }), 'month');
        return { pass: /4,200\/mo/.test(s) && /18%/.test(s) && /4,956\/mo/.test(s), detail: s };
      } },

    // ── deal state machine: the linear line ───────────────────────────────────────────────────────
    { name: 'stages are the middleman line, in order (scouted → … → submitted → closed)',
      run: () => {
        const ok = stageIndex('scouted') === 0 && stageIndex('outreach_sent') > stageIndex('outreach_drafted')
          && stageIndex('priced') > stageIndex('quotes_in') && stageIndex('closed') === STAGES.length - 1;
        return { pass: ok, detail: STAGES.join(' → ') };
      } },

    { name: 'advanceState only moves FORWARD (history append-only; no going back)',
      run: () => {
        let d = { noticeId: 'X', stage: 'scored', history: [] };
        d = advanceState(d, 'quotes_in', 'q');
        const back = advanceState(d, 'scouted');
        return { pass: d.stage === 'quotes_in' && back.stage === 'quotes_in' && d.history.length === 1, detail: `${d.stage}, back→${back.stage}` };
      } },

    { name: 'dealGaps: a bare scored deal lists EVERYTHING in the air (sow/outreach/quotes/pricing/proposal)',
      run: () => {
        const g = dealGaps({ stage: 'scored', subNeeded: true }).map((x) => x.key);
        const want = ['sow', 'outreach', 'quotes', 'pricing', 'proposal'];
        return { pass: want.every((k) => g.includes(k)), detail: g.join(',') };
      } },

    { name: 'dealGaps: outreach drafted but NOT sent is its own loud gap (the "not reaching out" fix)',
      run: () => {
        const g = dealGaps({ stage: 'outreach_drafted', subNeeded: true, outreach: [{ file: 'x.md', sentAt: null }] });
        return { pass: g.some((x) => x.key === 'outreach_sent') && !g.some((x) => x.key === 'outreach'), detail: g.map((x) => x.key).join(',') };
      } },

    { name: 'dealGaps: no-sub-needed deal only asks for SOW + proposal',
      run: () => {
        const g = dealGaps({ stage: 'scored', subNeeded: false }).map((x) => x.key);
        return { pass: g.includes('sow') && g.includes('proposal') && !g.includes('quotes'), detail: g.join(',') };
      } },

    { name: 'dealGaps: a submitted deal has NOTHING hanging',
      run: () => { const g = dealGaps({ stage: 'submitted', subNeeded: true }); return { pass: g.length === 0, detail: String(g.length) }; } },

    { name: 'whoseMove: unsent outreach → YOU; sent-awaiting-quotes → SUB; submitted → AGENCY',
      run: () => {
        const you = whoseMove({ stage: 'outreach_drafted', subNeeded: true, outreach: [{ file: 'x', sentAt: null }] });
        const sub = whoseMove({ stage: 'outreach_sent', subNeeded: true, sow: { pulled: true }, outreach: [{ file: 'x', sentAt: 'now' }], quotes: [] });
        const agy = whoseMove({ stage: 'submitted' });
        return { pass: you.who === 'you' && sub.who === 'sub' && agy.who === 'agency', detail: `${you.who}/${sub.who}/${agy.who}` };
      } },

    // ── SOW: the scoring-blind fix ────────────────────────────────────────────────────────────────
    { name: 'isDescriptionUrl: SAM v2 sends a URL where prose should be — detect it',
      run: () => {
        const a = isDescriptionUrl('https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc');
        const b = isDescriptionUrl('Recurring janitorial services for admin buildings');
        return { pass: a === true && b === false, detail: `${a}/${b}` };
      } },

    { name: 'htmlToText strips tags/entities into readable SOW text',
      run: () => {
        const t = htmlToText('<p>Contractor shall provide <b>custodial services</b> &amp; supplies.</p><li>Daily</li>');
        return { pass: /Contractor shall provide custodial services & supplies\./.test(t) && /• Daily/.test(t), detail: t };
      } },

    // ── inbox presort: no tokens on obvious noise ─────────────────────────────────────────────────
    { name: 'presort: noreply@ → notification; unsubscribe+promo hints → promo; a real person → model decides',
      run: () => {
        const n = presort({ from: 'no-reply@bank.com', subject: 'Statement ready' });
        const p = presort({ from: 'deals@store.com', subject: 'FLASH SALE 40% off', hasUnsubscribe: true });
        const h = presort({ from: 'john@client.com', subject: 'About the contract' });
        return { pass: n === 'notification' && p === 'promo' && h === null, detail: `${n}/${p}/${h}` };
      } },

    { name: 'foldClassification defaults bad model rows safely (never crashes the digest)',
      run: () => {
        const out = foldClassification([{ from: 'a@b.c', subject: 'S' }], [{ category: 'nonsense', urgency: 99 }]);
        return { pass: out[0].category === 'notification' && out[0].urgency === 3, detail: JSON.stringify(out[0]) };
      } },

    { name: 'digestText leads with what needs a reply and counts the noise',
      run: () => {
        const t = digestText('personal', [
          { category: 'needs_reply', from: 'boss@x.com', fromName: 'Boss', line: 'Sign the form', urgency: 3 },
          { category: 'promo', from: 'p@x.com' }, { category: 'notification', from: 'n@x.com' },
        ]);
        return { pass: /Needs your reply \(1\)/.test(t) && /Boss: Sign the form/.test(t) && /Noise: 2/.test(t), detail: t.split('\n')[0] };
      } },
  ],
};
