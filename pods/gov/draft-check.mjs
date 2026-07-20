// draft-check.mjs — never let a draft that can't send reach the operator's approval gate.
//
// THE BUG (operator log, 2026-07-18): a "Send janitorial outreach for Mount Dora" gate reached the approval
// stage; the operator approved it; the executor THEN failed — "no To:/Subject: header, not a sendable email".
// The send step was honest (it reported the real failure, didn't fake a send), but the check fired one step
// TOO LATE: the operator spent an approval on something that could never succeed. (The gate was a stale one
// from before connector.mjs started writing a real To:/Subject: header — but a stale/regression gate must
// still never sit in the queue as "Approve = SENDS".)
//
// THE FIX: validate a send gate's draft with the EXACT parser the executor uses (parseEmailFile), so
// "validatable" === "sendable" with zero drift. checkGateDraft is pure + eval-pinned. pruneUnsendableGates
// sweeps the pending queue and auto-PASSES the unsendable ones (a gate that can never send is not a real
// decision) while re-queuing a "draft incomplete — add a recipient + re-draft" task so the intent isn't lost.
// Deterministic; it NEVER sends anything.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';
import { parseEmailFile } from './sender.mjs';

// PURE: a gov send/email gate that points at a draft FILE (the exact set the executor may touch).
export function isSendGateWithFile(g) {
  return !!g && g.pod === 'gov'
    && ['send', 'email'].includes(String(g.action || '').toLowerCase())
    && !!(g.payload && g.payload.file);
}

// PURE (eval-pinned): given a gate + its draft file's raw content (null if missing/unreadable), is it a
// sendable email? Non-send gates + non-file gates are `relevant:false` and left alone.
export function checkGateDraft(g, raw) {
  if (!isSendGateWithFile(g)) return { relevant: false, sendable: true, reason: '' };
  if (raw == null) return { relevant: true, sendable: false, reason: 'draft file missing or unreadable' };
  const p = parseEmailFile(raw);
  return { relevant: true, sendable: !!p.ok, reason: p.ok ? '' : p.reason };
}

// IO: sweep pending send gates; auto-pass the unsendable ones + re-queue a fix task. { dir } overrides ROOT
// for tests; { store } is the control-plane store (pendingApprovals + appendEvent). Never throws.
export async function pruneUnsendableGates({ store, dir } = {}) {
  if (!store || typeof store.pendingApprovals !== 'function') return { ok: false, note: 'no store', pruned: 0 };
  const root = dir || ROOT;
  let pending = [];
  try { pending = store.pendingApprovals() || []; } catch { pending = []; }
  const relevant = pending.filter(isSendGateWithFile);
  const pruned = [];
  for (const g of relevant) {
    let raw = null;
    try { raw = fs.readFileSync(path.join(root, String(g.payload.file).replace(/\\/g, '/')), 'utf8'); } catch { raw = null; }
    const c = checkGateDraft(g, raw);
    if (c.sendable) continue;
    try {
      store.appendEvent({ kind: 'approval.decision', actor: 'system', pod: 'gov', action: 'pass', ref: g.id, payload: { decision: 'pass', note: `auto-pruned: unsendable draft — ${c.reason}` } });
      store.appendEvent({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'draft.incomplete', status: 'need', reversible: true, rationale: `An outreach draft${g.payload.trade ? ' (' + g.payload.trade + ')' : ''} couldn't be sent (${c.reason}) — add a recipient email + re-draft before it can go out.`, payload: { noticeId: g.payload.noticeId, file: g.payload.file, reason: c.reason } });
    } catch { /* best-effort */ }
    pruned.push({ id: g.id, file: g.payload.file, reason: c.reason });
  }
  return { ok: true, checked: relevant.length, pruned: pruned.length, items: pruned };
}
