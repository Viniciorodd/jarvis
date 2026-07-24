// Amendment & deadline-change radar — the complement to deadlines.mjs (which reminds when a pursued bid is
// CLOSING SOON). This detects when a solicitation CHANGED across scans: the deadline moved, an attachment was
// revised/added, or the notice bumped to a new "Amendment 000N". Miss an amendment and your bid is
// non-responsive or late — an automatic loss. Deterministic (doctrine §1): what changed is decided in CODE
// over the gov.snapshot event stream, never by an LLM. Idempotent: an alert IS an event
// (gov.amendment.flagged), so the same change never re-pings. Only PURSUED bids alert (noise control).
import fs from 'node:fs';
import { CP_URL, emit, mirror, notify } from '../lib.mjs';

// small, stable, order-free hash (djb2 → base36) — local so this module doesn't pull in attachments.mjs's deps.
function djb2(s) { let h = 5381; s = String(s || ''); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }

// PURE: a deterministic, ORDER-INDEPENDENT signature of an attachment set. Includes each file's byte size so a
// same-URL content swap (SAM replacing a file in place) changes the signature. Empty set → ''. Eval-pinned.
export function attSignature(files = []) {
  const parts = (Array.isArray(files) ? files : [])
    .filter((f) => f && (f.hash || f.url))
    .map((f) => `${f.hash || djb2(f.url)}:${Number(f.bytes) || 0}`)
    .sort();
  return parts.length ? djb2(parts.join('|')) : '';
}

// PURE: the highest "Amendment 000N" number anywhere in the solicitation text (0 if none). Eval-pinned.
export function amendmentLevel(text = '') {
  let max = 0;
  for (const m of String(text || '').matchAll(/amendment\s+0*(\d+)/ig)) { const n = Number(m[1]); if (n > max) max = n; }
  return max;
}

// PURE: the notices we're actually PURSUING (so a change is actionable) — latest bid.score is 'bid', OR a
// proposal was drafted, OR the caller passes an open submit-gate noticeId. Eval-pinned.
export function pursuedSet(events = [], { pendingSubmitNotices = [] } = {}) {
  const latestBid = new Map();
  const drafted = new Set();
  for (const e of events) {
    const p = e.payload || {};
    if (e.action === 'bid.score' && p.noticeId) latestBid.set(p.noticeId, p.recommendation);
    else if (e.action === 'proposal.draft' && p.noticeId) drafted.add(p.noticeId);
  }
  const s = new Set();
  for (const [id, rec] of latestBid) if (rec === 'bid') s.add(id);
  for (const id of drafted) s.add(id);
  for (const id of pendingSubmitNotices) if (id) s.add(id);
  return s;
}

// PURE (eval-pinned): compare each PURSUED notice's two most-recent gov.snapshot payloads and report what
// changed. Idempotent against gov.amendment.flagged (same latest signature is never re-flagged). Returns
// [{ noticeId, title, url, changes:['deadline'|'attachments'|'amendment'], prev, latest }].
export function detectAmendments(events = [], { pursued, pendingSubmitNotices = [] } = {}) {
  const pset = pursued || pursuedSet(events, { pendingSubmitNotices });
  const snaps = new Map();
  for (const e of events) {
    if (e.action !== 'gov.snapshot') continue;
    const p = e.payload || {};
    if (!p.noticeId) continue;
    if (!snaps.has(p.noticeId)) snaps.set(p.noticeId, []);
    snaps.get(p.noticeId).push(p);
  }
  const sigOf = (id, s) => `${id}|${s.deadline || ''}|${s.attSig || ''}|${Number(s.amendmentN) || 0}`;
  const flagged = new Set();
  for (const e of events) {
    if (e.action !== 'gov.amendment.flagged') continue;
    const p = e.payload || {};
    if (p.noticeId) flagged.add(sigOf(p.noticeId, p));
  }
  const out = [];
  for (const [noticeId, arr] of snaps) {
    if (arr.length < 2 || !pset.has(noticeId)) continue;
    const latest = arr[arr.length - 1], prev = arr[arr.length - 2];
    const changes = [];
    if (prev.deadline && latest.deadline && prev.deadline !== latest.deadline) changes.push('deadline');
    if (latest.attSig && prev.attSig !== latest.attSig) changes.push('attachments');
    if ((Number(latest.amendmentN) || 0) > (Number(prev.amendmentN) || 0)) changes.push('amendment');
    if (!changes.length) continue;
    if (flagged.has(sigOf(noticeId, latest))) continue;   // already alerted for this exact change
    out.push({ noticeId, title: latest.title || '', url: latest.url || '', changes, prev, latest });
  }
  return out;
}

// human phrasing for one change set
function changeText(c) {
  return c.changes.map((k) => k === 'deadline'
    ? `deadline changed (was ${String(c.prev.deadline).slice(0, 10)}, now ${String(c.latest.deadline).slice(0, 10)})`
    : k === 'attachments' ? 'attachments changed (a file was revised or added)'
      : `bumped to Amendment ${String(c.latest.amendmentN).padStart(4, '0')}`).join('; ');
}

// Read the gov event store, find changed PURSUED bids, alert once each, record the flag (idempotency + audit),
// and invalidate the stale attachment cache so the next scan re-ingests and the matrix rebuilds fresh.
export async function runAmendmentRadar({ pendingSubmitNotices = [] } = {}) {
  let events = [];
  try {
    const r = await fetch(CP_URL + '/events?pod=gov', { signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    events = Array.isArray(d) ? d : (d.events || []);
  } catch (e) {
    await emit({ kind: 'trace', actor: 'SAM-SCOUT', pod: 'gov', action: 'amendment.skip', status: 'error', rationale: 'cannot read events: ' + e.message });
    return { ok: false, note: e.message };
  }
  const changes = detectAmendments(events, { pendingSubmitNotices });
  for (const c of changes) {
    await notify({
      pod: 'Gov War Room',
      title: `⚠️ Amendment — ${String(c.title || '').slice(0, 80)}`,
      detail: `${changeText(c)}. Re-open the bid and re-run the compliance matrix — the requirements may have moved.${c.url ? '\n' + c.url : ''}`,
      verb: 'Re-check bid', xp: 25,
    });
    await emit({ kind: 'action', actor: 'SAM-SCOUT', pod: 'gov', action: 'gov.amendment.flagged', status: 'done', rationale: `Amendment on ${String(c.title || '').slice(0, 80)}: ${c.changes.join('/')}`, payload: { noticeId: c.noticeId, deadline: c.latest.deadline, attSig: c.latest.attSig, amendmentN: c.latest.amendmentN, changes: c.changes } });
    if (c.changes.includes('attachments')) {
      // stale-matrix guard: drop the cached attachment dir so the next scan re-downloads the revised files.
      try { const { attDir } = await import('./attachments.mjs'); fs.rmSync(attDir({ noticeId: c.noticeId }), { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }
  await mirror('SAM-SCOUT', changes.length ? 'need' : 'idle', changes.length ? `${changes.length} solicitation amendment(s) — re-check your bids` : 'No new amendments on your bids');
  return { ok: true, flagged: changes.length, changes };
}

if (process.argv[1] && process.argv[1].endsWith('amendments.mjs')) {
  runAmendmentRadar().then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
