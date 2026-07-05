// Evals for the proactive-behavior rails: the kill switch (pause.mjs) and held-notices catch-up
// (catchup.mjs). Pure functions only — no disk, no network. These lock Trillion Tier 5/6 behavior:
// quiet by default, nothing lost while away, one tap stops everything.

import { pauseActive } from '../pods/pause.mjs';
import { catchupItems, line } from '../pods/catchup.mjs';
import { skillsFromEvents, labelFor, ago } from '../pods/skills.mjs';
import { isGovAlert, alertText } from '../pods/gov/inbox-watch.mjs';
import { parseProposals, matchNotice } from '../pods/gov/vault-sync.mjs';

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

    // ── skills rail: the real capability set, lighting up as it runs ─────────────────────────────
    { name: 'skills: groups by pod+action, counts invocations, newest timestamp wins',
      run: () => {
        const ev = [
          { ts: ts(30), pod: 'gov', action: 'bid.score', actor: 'GOV-ANALYST' },
          { ts: ts(1), pod: 'gov', action: 'bid.score', actor: 'GOV-ANALYST' },
          { ts: ts(5), pod: 'fiverr', action: 'thumbnail', actor: 'STUDIO-01' },
        ];
        const s = skillsFromEvents(ev, NOW);
        const bid = s.find((x) => x.action === 'bid.score');
        return { pass: s.length === 2 && bid.count === 2 && bid.lastTs === new Date(ts(1)).getTime() && s[0].action === 'bid.score', detail: s.map((x) => `${x.action}×${x.count}`).join(',') };
      } },

    { name: 'skills: live (<2m) pulses, recent (<15m) bright, noise + meta never shown',
      run: () => {
        const ev = [
          { ts: ts(1), pod: 'gov', action: 'sow.pull' },
          { ts: ts(10), pod: 'gov', action: 'proposal.draft' },
          { ts: ts(200), pod: 'gov', action: 'scan.done' },
          { ts: ts(1), pod: 'exec', action: 'rest' },
          { ts: ts(1), pod: 'exec', action: 'proactive.pause', kind: 'meta' },
        ];
        const s = skillsFromEvents(ev, NOW);
        const flags = s.map((x) => `${x.action}:${x.live ? 'L' : x.recent ? 'R' : '-'}`).join(',');
        return { pass: s.length === 3 && flags === 'sow.pull:L,proposal.draft:R,scan.done:-', detail: flags };
      } },

    { name: 'skills: friendly labels from the dictionary; unknown actions humanized',
      run: () => {
        const a = labelFor('deal.priced'), b = labelFor('foo.bar_baz');
        return { pass: a === 'Price the bid (markup)' && b === 'Foo bar baz', detail: `${a} / ${b}` };
      } },

    { name: 'skills: age stamps read like a human ("now", "5m", "3h", "2d")',
      run: () => {
        const r = [ago(NOW - 10000, NOW), ago(NOW - 5 * 60000, NOW), ago(NOW - 3 * 3600000, NOW), ago(NOW - 2 * 86400000, NOW)].join(',');
        return { pass: r === 'now,5m,3h,2d', detail: r };
      } },

    // ── gov inbox watch: the 4-day-miss fix ───────────────────────────────────────────────────────
    { name: 'gov-watch: .mil and .gov (incl. state .gov) senders alert; gmail does not; test tag does',
      run: () => {
        const mil = isGovAlert({ from: 'duron.j.smith.civ@army.mil' });
        const gov = isGovAlert({ from: 'buyer@gsa.gov' });
        const st = isGovAlert({ from: 'officer@pa.gov' });
        const no = isGovAlert({ from: 'newsletter@shopgov.com' });     // .com that CONTAINS "gov" — no
        const g2 = isGovAlert({ from: 'vinicio@gmail.com' });
        const tt = isGovAlert({ from: 'vinicio@gmail.com', subject: 'hello [TEST-GOV-WATCH] ping' });
        return { pass: mil && gov && st && !no && !g2 && tt, detail: `${mil}/${gov}/${st}/${no}/${g2}/${tt}` };
      } },

    { name: 'gov-watch: the push is brief, names the sender, and demands a same-day reply',
      run: () => {
        const t = alertText({ from: 'duron@army.mil', fromName: 'Duron', subject: 'W911SD — solicitation posted' });
        return { pass: /🚨 GOV MAIL/.test(t) && /Duron <duron@army.mil>/.test(t) && /reply TODAY/.test(t), detail: t.split('\n')[0] };
      } },

    // ── vault-sync: Proposals.md is the source of truth the board READS ──────────────────────────
    { name: 'vault-sync: parses Sent/Staged sections; SS-link IDs extracted; plain bullets kept',
      run: () => {
        const md = [
          '# Proposals', '',
          '## Sent',
          '- [[SS — W15QKN-26-Q-A144 — Salem VA Custodial (99th RD)]] — SENT 7/5 ✅',
          '- [[SS — W911SD06102026 — West Point Cleaning & Haul-Away]] — sent 6/14',
          '',
          '## Staged / Responding',
          '- **West Point rates reply to Duron** — ON HOLD',
          '- [[SS — 50cdb2a2 — Janitorial & Carpet Cleaning (USACE)]] — due 7/13',
        ].join('\n');
        const p = parseProposals(md);
        return {
          pass: p.sent.length === 2 && p.sent[0].id === 'W15QKN-26-Q-A144' && p.sent[1].id === 'W911SD06102026'
            && p.staged.length === 2 && p.staged[0].id === '' && p.staged[1].id === '50cdb2a2',
          detail: `sent=[${p.sent.map((x) => x.id)}] staged=[${p.staged.map((x) => x.id || '(note)')}]`,
        };
      } },

    { name: 'vault-sync: notice matching — exact + ≥8-char prefixes both ways; short fragments never',
      run: () => {
        const a = matchNotice('50cdb2a2ed1840dba7b4bb33208bb623', '50cdb2a2'); // vault holds the prefix
        const b = matchNotice('W911SD06102026', 'W911SD06102026');             // exact
        const c = matchNotice('50cdb2a2ed1840dba7b4bb33208bb623', '50cd');     // too short — collision risk
        const d = matchNotice('', 'x') || matchNotice('x', '');
        return { pass: a && b && !c && !d, detail: `${a}/${b}/${c}/${d}` };
      } },
  ],
};
