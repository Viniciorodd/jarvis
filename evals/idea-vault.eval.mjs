// Regression suite for the Idea Vault (pods/idea-vault.mjs). Pins the fold-by-id ledger semantics,
// the resurface staleness math, seed idempotency, and the rendered vault note — the "never lose an
// idea again" guarantees. Every IO case runs in its own temp dir; the real ledger is never touched.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addIdea, updateIdea, readIdeas, listIdeas, resurfaceQueue, touchIdea,
  seedIfEmpty, renderMarkdown, SEED, REVISIT_DAYS,
} from '../pods/idea-vault.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'idea-vault-eval-'));
const NOW = '2026-07-12T12:00:00.000Z';
const daysAgo = (d) => new Date(Date.parse(NOW) - d * 864e5).toISOString();

export default {
  agent: 'idea-vault',
  cases: [
    { name: 'fold-by-id: latest full-state line wins; ledger stays append-only', run: () => {
      const dir = tmp();
      const a = addIdea({ title: 'Idea A', status: 'new' }, { dir });
      updateIdea(a.idea.id, { status: 'active', note: 'started it' }, { dir });
      const folded = readIdeas({ dir });
      const lines = fs.readFileSync(path.join(dir, 'ideas.jsonl'), 'utf8').split('\n').filter((l) => l.trim());
      const i = folded[0];
      return ok(folded.length === 1 && lines.length === 2 && i.status === 'active'
        && i.log.length === 1 && i.log[0].note === 'started it',
        JSON.stringify({ folded: folded.length, lines: lines.length, status: i && i.status }));
    } },
    { name: 'resurfaceQueue: staleness math, stalest-first order, done/dropped excluded', run: () => {
      const ideas = [
        { id: 'a', title: 'A', status: 'active', revisitDays: 7, lastTouched: daysAgo(20) },  // due, 20d
        { id: 'b', title: 'B', status: 'parked', revisitDays: 30, lastTouched: daysAgo(10) }, // not due
        { id: 'c', title: 'C', status: 'done', revisitDays: 7, lastTouched: daysAgo(100) },   // never
        { id: 'd', title: 'D', status: 'dropped', lastTouched: daysAgo(100) },                // never
        { id: 'e', title: 'E', status: 'new', revisitDays: 7, lastTouched: daysAgo(8) },      // due, 8d
      ];
      const q = resurfaceQueue(ideas, NOW);
      return ok(q.length === 2 && q[0].id === 'a' && q[0].staleDays === 20 && q[1].id === 'e' && q[1].staleDays === 8,
        JSON.stringify(q.map((i) => [i.id, i.staleDays])));
    } },
    { name: 'seedIfEmpty is idempotent by title — re-running adds nothing', run: () => {
      const dir = tmp();
      const first = seedIfEmpty(SEED, { dir });
      const second = seedIfEmpty(SEED, { dir });
      const all = readIdeas({ dir });
      return ok(first.added === SEED.length && second.added === 0 && second.skipped === SEED.length
        && all.length === SEED.length,
        JSON.stringify({ first, second, count: all.length }));
    } },
    { name: 'touchIdea keeps an idea alive — it leaves the due queue and the note lands in the log', run: () => {
      const dir = tmp();
      const a = addIdea({ title: 'Stale one', status: 'active', lastTouched: daysAgo(15) }, { dir });
      const before = resurfaceQueue(readIdeas({ dir }), NOW);
      const t = touchIdea(a.idea.id, 'still on it', { dir });
      const after = resurfaceQueue(readIdeas({ dir }), NOW);
      return ok(before.length === 1 && t.ok && after.length === 0
        && t.idea.log.slice(-1)[0].note === 'still on it',
        JSON.stringify({ before: before.length, after: after.length }));
    } },
    { name: 'default revisitDays by status: new 7, active 7, waiting 14, parked 30', run: () => {
      const dir = tmp();
      const got = {};
      for (const status of ['new', 'active', 'waiting', 'parked'])
        got[status] = addIdea({ title: `t-${status}`, status }, { dir }).idea.revisitDays;
      return ok(got.new === 7 && got.active === 7 && got.waiting === 14 && got.parked === 30
        && REVISIT_DAYS.done === undefined && REVISIT_DAYS.dropped === undefined, JSON.stringify(got));
    } },
    { name: 'status change resets revisitDays to the new status default (unless set explicitly)', run: () => {
      const dir = tmp();
      const a = addIdea({ title: 'Mover', status: 'waiting' }, { dir });
      const parked = updateIdea(a.idea.id, { status: 'parked' }, { dir });
      const custom = updateIdea(a.idea.id, { status: 'active', revisitDays: 3 }, { dir });
      return ok(a.idea.revisitDays === 14 && parked.idea.revisitDays === 30 && custom.idea.revisitDays === 3,
        JSON.stringify({ start: a.idea.revisitDays, parked: parked.idea.revisitDays, custom: custom.idea.revisitDays }));
    } },
    { name: 'renderMarkdown: active group first, staleness flag shown, done/dropped one-liners at the bottom', run: () => {
      const ideas = [
        { id: 'a', title: 'Stale active idea', detail: 'd1', tags: ['gov'], status: 'active', revisitDays: 7, lastTouched: daysAgo(12), log: [] },
        { id: 'p', title: 'Fresh parked idea', detail: 'd2', tags: [], status: 'parked', revisitDays: 30, lastTouched: daysAgo(1), log: [] },
        { id: 'z', title: 'Shipped idea', detail: 'd3', tags: [], status: 'done', lastTouched: daysAgo(5), log: [] },
      ];
      const md = renderMarkdown(ideas, new Date(NOW));
      const iActive = md.indexOf('🔥 Active'), iParked = md.indexOf('🧊 Parked'), iClosed = md.indexOf('Done & dropped');
      return ok(iActive > -1 && iParked > iActive && iClosed > iParked
        && md.includes('resurfacing — 12d untouched')
        && md.includes('~~Shipped idea~~')
        && !md.includes('resurfacing — 1d'), // fresh parked idea carries no flag
        JSON.stringify({ iActive, iParked, iClosed, flagged: md.includes('resurfacing — 12d untouched') }));
    } },
    { name: 'listIdeas filters by status; updateIdea rejects unknown ids', run: () => {
      const dir = tmp();
      addIdea({ title: 'One', status: 'active' }, { dir });
      addIdea({ title: 'Two', status: 'parked' }, { dir });
      const active = listIdeas({ status: 'active', dir });
      const bad = updateIdea('nope-not-real', { status: 'done' }, { dir });
      return ok(active.length === 1 && active[0].title === 'One' && bad.ok === false && !!bad.error,
        JSON.stringify({ active: active.length, bad }));
    } },
  ],
};
