// run.mjs — the loop, end to end. Master PRD §7 phase 5.
//
// Two commands, and they are deliberately separate processes:
//
//   --propose   build the next batch, write it into the brand ledger, send the card, open the window
//   --publish   the window has closed (or he approved) — publish what the ledger cleared
//
// Separate because the kill window has to be REAL. If one process built the batch, slept 20 minutes and
// published, then `/kill` would have nothing to talk to and the window would be theatre. Splitting them
// means the decision is written down between the two, and the second process reads it.
//
// ── EVERY GATE IS THE BRAND POD'S, NOT A NEW ONE ────────────────────────────────────────────────────
// This module writes ledger events and calls `runOnce`. It does not decide anything about compliance,
// caps, approval or the kill switch — those are already coded in pods/brand/{publish,policy,store}.mjs
// and re-implementing them here is exactly how two guards diverge (Master PRD §9).
//
// The order a post travels: draft → queue → approve → schedule → (runOnce) → publish.
// The `approve` event carries WHO approved, and in notify mode that is recorded honestly as the
// operator's standing authorisation with the batch id, not as a fake per-post tap.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, packStatus } from './library.mjs';
import { buildBatch, batchDecision, killWindow, cardText, readMode, DEFAULT_WINDOW_MIN } from './batch.mjs';
import { publish as blueskyPublish } from '../brand/publish/bluesky.mjs';
import { getSecret } from '../../control-plane/vault.mjs';
import { append, load } from '../brand/store.mjs';
import { runOnce } from '../brand/publish.mjs';
import { notifyTelegram } from '../lib.mjs';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const STATE_FILE = path.join(ROOT, 'control-plane', 'data', 'social-batch.json');
export const VERIFIED_FILE = path.join(ROOT, 'control-plane', 'data', 'social-verified-figures.json');

// He asked to lead with his personal account and to leave REDOSHQ until there are sales. Bluesky is the
// only platform with a working adapter, so it is the only one wired — the others build variants and sit
// in the ledger rather than silently disappearing.
export const LIVE_PLATFORMS = ['bluesky'];

const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)); };

export const readState = () => readJson(STATE_FILE, null);
export const readVerified = () => readJson(VERIFIED_FILE, {});

/** PURE: which pack posts the ledger says already went out. */
export function publishedPackNumbers(records = []) {
  const out = new Set();
  for (const r of (records || [])) {
    if (r && r.status === 'published' && r.source && typeof r.source.packPost === 'number') out.add(r.source.packPost);
  }
  return [...out];
}

/** PURE: the ledger id for one pack post on one platform. Stable, so a re-run cannot double-post. */
export const recordId = (batchId, n, platform) => `social-${batchId}-p${n}-${platform}`;

/**
 * Build the next batch, write it to the ledger as approved+scheduled, and send the card.
 *
 * Returns the state it wrote. Nothing publishes here — `runOnce` is not called.
 */
export async function propose({ now = new Date().toISOString(), send = true, platforms = LIVE_PLATFORMS } = {}) {
  const mode = readMode();
  const pack = loadPack();
  const { records } = load();
  const done = publishedPackNumbers(records);
  const batch = buildBatch(pack, done, { verified: readVerified() });

  if (!batch.items.length) {
    const s = packStatus(pack, done);
    return { ok: false, why: s.exhausted ? 'pack exhausted — every post has gone out' : 'nothing ready to post', status: s, held: batch.held };
  }

  const batchId = now.replace(/[-:.TZ]/g, '').slice(0, 14);
  const written = [];

  for (const item of batch.items) {
    for (const platform of platforms) {
      const post = item.posts[platform];
      if (!post) continue;
      const id = recordId(batchId, item.n, platform);
      const common = { id, platform, body: post.text, source: { packPost: item.n, title: item.title, batchId } };
      // draft → queue → approve → schedule. Each is a real ledger event; the store refuses any
      // out-of-order transition, so a bug here shows up as a rejected event rather than a surprise post.
      append({ ...common, type: 'draft', ts: now });
      append({ id, type: 'queue', ts: now });
      // ⚠ The store reads the approver from `by`, not `approvedBy`. Getting this wrong made every post
      // skip with "no approver in the history" — the gate failing closed, which is the right direction.
      // In notify mode the approver is his standing authorisation, recorded verbatim with the batch id
      // so the ledger never claims a per-post tap that did not happen.
      append({ id, type: 'approve', ts: now,
        by: mode === 'notify' ? `operator (standing authorisation 2026-08-07, batch ${batchId})` : '',
        note: mode === 'notify' ? 'notify mode — publishes unless killed inside the window' : 'awaiting explicit approval' });
      append({ id, type: 'schedule', ts: now, scheduledFor: now });
      written.push({ id, n: item.n, platform });
    }
  }

  const w = killWindow(now, { mode });
  const state = { batchId, mode, sentAt: now, closesAt: w.closesAt, decision: null,
    items: written, held: batch.held, broken: batch.broken };
  writeJson(STATE_FILE, state);

  const text = cardText(batch, { mode, closesAt: w.closesAt });
  if (send) notifyTelegram(text);
  return { ok: true, state, card: text };
}

/**
 * Publish the pending batch if the decision (or the closed window) allows it.
 *
 * `dryRun` defaults TRUE, matching the rest of the brand pod. A caller that wants a real send has to
 * say so — a misconfigured cron then posts nothing rather than posting wrongly.
 */
export async function publishPending({ now = new Date().toISOString(), dryRun = true, adapters = null } = {}) {
  const state = readState();
  if (!state) return { ok: false, why: 'no batch pending' };

  const d = batchDecision({ mode: state.mode, decision: state.decision, sentAt: state.sentAt, now, windowMin: DEFAULT_WINDOW_MIN });
  if (!d.go) return { ok: false, why: d.why, state: d.state };

  // The Bluesky adapter is the brand pod's — it already carries the verified read-back and the
  // grapheme count, and a second copy is how two adapters diverge. It holds no credential of its own,
  // so they are read here through the vault broker as SOCIAL-01, whose ACL is scoped to exactly these
  // two names. A vault refusal means no adapter, which means the loop skips rather than posts.
  const use = adapters || blueskyAdapters();
  const res = await runOnce({ adapters: use, dryRun, now, verifiedFigures: Object.values(readVerified()).flat() });

  writeJson(STATE_FILE, { ...state, ranAt: now, result: { published: res.published.length, failed: res.failed.length, halted: res.halted } });

  if (!dryRun && (res.published.length || res.failed.length || res.halted)) {
    const lines = [res.halted ? 'HALTED: ' + res.halted : `Posted ${res.published.length}.`];
    for (const p of res.published) lines.push(`  ${p.platform} ${p.url}`);
    for (const f of res.failed) lines.push(`  FAILED ${f.id}: ${f.reason}`);
    notifyTelegram(lines.join('\n'));
  }
  return { ok: true, ...res, decision: d };
}

/** The live adapter set. Returns {} if the vault cannot supply credentials — skip, never post blind. */
export function blueskyAdapters({ agent = 'SOCIAL-01' } = {}) {
  let handle, password;
  try {
    handle = getSecret(agent, 'BLUESKY_HANDLE');
    password = getSecret(agent, 'BLUESKY_APP_PASSWORD');
  } catch { return {}; }
  if (!handle || !password) return {};
  return { bluesky: ({ text }) => blueskyPublish({ text, handle, password }) };
}

/** Record his decision on the pending batch. Called by the Telegram callback / `/kill`. */
export function decide(decision, { now = new Date().toISOString() } = {}) {
  const state = readState();
  if (!state) return { ok: false, why: 'no batch pending' };
  if (!['approve', 'kill'].includes(decision)) return { ok: false, why: `unknown decision "${decision}"` };
  writeJson(STATE_FILE, { ...state, decision, decidedAt: now });
  return { ok: true, decision, batchId: state.batchId };
}

/** Confirm a pack post's figures so it stops being held. This is the ONE thing autonomy cannot do. */
export function confirmFigures(packPost, figures = []) {
  const v = readVerified();
  const key = String(Number(packPost));
  v[key] = [...new Set([...(v[key] || []), ...figures.map((f) => String(f).trim())])];
  writeJson(VERIFIED_FILE, v);
  return v[key];
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('run.mjs')) {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  const main = async () => {
    if (has('--propose')) {
      const r = await propose({ send: !has('--no-send') });
      console.log(r.ok ? r.card : `nothing proposed: ${r.why}`);
      if (r.ok) console.log(`\n[state] ${STATE_FILE}\n[window] closes ${r.state.closesAt || 'n/a'} (${r.state.mode})`);
      return;
    }
    if (has('--publish')) {
      const r = await publishPending({ dryRun: !has('--live') });
      console.log(JSON.stringify(r, null, 2));
      if (!has('--live')) console.log('\n(dry run — pass --live to actually post)');
      return;
    }
    if (has('--approve') || has('--kill')) { console.log(JSON.stringify(decide(has('--kill') ? 'kill' : 'approve'))); return; }
    if (has('--confirm')) {
      const n = args[args.indexOf('--confirm') + 1];
      const figs = args.slice(args.indexOf('--confirm') + 2).filter((a) => !a.startsWith('--'));
      console.log(JSON.stringify({ post: n, verified: confirmFigures(n, figs) }));
      return;
    }
    // Default: show where things stand, and touch nothing.
    const pack = loadPack();
    const { records } = load();
    const done = publishedPackNumbers(records);
    const b = buildBatch(pack, done, { verified: readVerified() });
    console.log(cardText(b, { mode: readMode() }));
    const st = readState();
    if (st) console.log(`\npending batch ${st.batchId} — decision: ${st.decision || 'none'}, window closes ${st.closesAt || 'n/a'}`);
    console.log('\n  --propose [--no-send]   build the next batch and send the card');
    console.log('  --publish [--live]      publish it if the window closed or he approved');
    console.log('  --approve | --kill      record his decision');
    console.log('  --confirm <n> <figs…>   confirm a post\'s numbers so it stops being held');
  };
  main().catch((e) => { console.error(e); process.exit(1); });
}
