// Evals for the proactive-behavior rails: the kill switch (pause.mjs) and held-notices catch-up
// (catchup.mjs). Pure functions only — no disk, no network. These lock Trillion Tier 5/6 behavior:
// quiet by default, nothing lost while away, one tap stops everything.

import { pauseActive } from '../pods/pause.mjs';
import { catchupItems, line } from '../pods/catchup.mjs';

const NOW = new Date('2026-07-04T12:00:00Z').getTime();
const ts = (min) => new Date(NOW - min * 60000).toISOString();

export default {
  agent: 'proactive-rails',
  cases: [
    // ── kill switch ───────────────────────────────────────────────────────────────────────────────
    { name: 'pause: off by default; on = everything holds',
      run: () => {
        const off = pauseActive({ paused: false }, NOW);
        const on = pauseActive({ paused: true }, NOW);
        const empty = pauseActive(null, NOW);
        return { pass: off === false && on === true && empty === false, detail: `${off}/${on}/${empty}` };
      } },

    { name: 'pause: auto-resumes when `until` passes (a forgotten pause can\'t kill Jarvis forever)',
      run: () => {
        const future = pauseActive({ paused: true, until: new Date(NOW + 3600000).toISOString() }, NOW);
        const past = pauseActive({ paused: true, until: new Date(NOW - 1000).toISOString() }, NOW);
        return { pass: future === true && past === false, detail: `future=${future} past=${past}` };
      } },

    // ── held notices / catch-up ───────────────────────────────────────────────────────────────────
    { name: 'catchup: only events AFTER last-seen are held (nothing nags twice)',
      run: () => {
        const ev = [
          { ts: ts(10), action: 'deal.priced', rationale: 'new one' },
          { ts: ts(120), action: 'deal.priced', rationale: 'old one' },
        ];
        const items = catchupItems(ev, ts(60));
        return { pass: items.length === 1 && items[0].text === 'new one', detail: items.map((i) => i.text).join(',') };
      } },

    { name: 'catchup: surfaces approvals as needs-you, errors as error; drops rest/trace noise',
      run: () => {
        const ev = [
          { ts: ts(5), kind: 'approval.request', action: 'send', rationale: 'Send outreach for X' },
          { ts: ts(6), action: 'inbox.triage.skip', status: 'error', rationale: 'IMAP failed' },
          { ts: ts(7), action: 'rest', rationale: 'idle' },
          { ts: ts(8), action: 'bid.score', rationale: 'scored 62' },
        ];
        const items = catchupItems(ev, null);
        const kinds = items.map((i) => i.kind).join(',');
        return { pass: items.length === 2 && kinds === 'needs-you,error', detail: kinds };
      } },

    { name: 'catchup: newest first, capped',
      run: () => {
        const ev = Array.from({ length: 30 }, (_, i) => ({ ts: ts(i + 1), action: 'deal.priced', rationale: 'r' + i }));
        const items = catchupItems(ev, null, { cap: 10 });
        return { pass: items.length === 10 && items[0].text === 'r0' && items[9].text === 'r9', detail: `${items.length}, first=${items[0].text}` };
      } },

    { name: 'catchup: quiet by default — no surfaced kinds → empty (no panel)',
      run: () => {
        const items = catchupItems([{ ts: ts(1), action: 'scan.start', rationale: 'x' }, { ts: ts(2), kind: 'trace', action: 'bid.score' }], null);
        return { pass: items.length === 0, detail: String(items.length) };
      } },

    { name: 'catchup line: brief + direct (rationale verbatim, truncated at 150; fallback humanized)',
      run: () => {
        const short = line({ rationale: 'Priced X: bid $4,956 (18% over $4,200 — profit $756)' });
        const long = line({ rationale: 'y'.repeat(200) });
        const fb = line({ action: 'proposal.draft' });
        return { pass: /profit \$756/.test(short) && long.length <= 150 && long.endsWith('…') && fb === 'proposal draft', detail: `${long.length} chars, fb=${fb}` };
      } },
  ],
};
