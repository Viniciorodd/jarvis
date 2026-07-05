// vault-sync.mjs — THE VAULT IS THE SOURCE OF TRUTH (three-place rule, law since 2026-07-04). The
// Pipeline board READS status from `04 - Projects/Gov Contracting/Proposals/Proposals.md` — never the
// other way around. A proposal listed under "## Sent" shows as Submitted on the board even if nobody
// ever clicked anything in Jarvis; the board is a status card, not a system of record.
// Pure parser eval-pinned; the companion overlays this onto govBoardData.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const VAULT = (process.env.VAULT_DIR || path.join(os.homedir(), 'Documents', 'Second Brain'));
export const PROPOSALS_MD = path.join(VAULT, '04 - Projects', 'Gov Contracting', 'Proposals', 'Proposals.md');

// ── PURE: parse Proposals.md → { sent: [{id, line}], staged: [{id, line}] }. IDs come from the
// wiki-link naming law: [[SS — <Notice ID> — <short title>]]. Bullets without a link (e.g. a
// hand-written "West Point rates reply" note) are kept with id '' so nothing silently vanishes.
export function parseProposals(md) {
  const out = { sent: [], staged: [] };
  let section = null;
  for (const raw of String(md || '').split('\n')) {
    const line = raw.trim();
    if (/^##\s/.test(line)) {
      section = /^##\s*sent/i.test(line) ? 'sent' : /^##\s*(staged|responding)/i.test(line) ? 'staged' : null;
      continue;
    }
    if (!section || !line.startsWith('-')) continue;
    const m = line.match(/\[\[SS\s*—\s*([^—\]]+?)\s*—/);
    out[section].push({ id: m ? m[1].trim() : '', line: line.replace(/^-\s*/, '').slice(0, 160) });
  }
  return out;
}

// ── PURE: does a board notice ID match a vault ID? Vault files may carry the full SAM hash, a hash
// prefix (≥8 chars, for readable filenames), or a solicitation number — match generously but never
// on fragments so short they could collide. Eval-pinned.
export function matchNotice(noticeId, vaultId) {
  const n = String(noticeId || '').toLowerCase().trim();
  const v = String(vaultId || '').toLowerCase().trim();
  if (!n || !v) return false;
  if (n === v) return true;
  if (v.length >= 8 && n.startsWith(v)) return true;
  if (n.length >= 8 && v.startsWith(n)) return true;
  return false;
}

// Read the vault and answer: which of these board notices has the vault already marked SENT?
// Returns { <noticeId>: { vault: true, line } } — the companion merges this into `submissions`.
export function vaultSubmissions(noticeIds = []) {
  let md = '';
  try { md = fs.readFileSync(PROPOSALS_MD, 'utf8'); } catch { return {}; } // no vault on this machine → no-op
  const { sent } = parseProposals(md);
  const out = {};
  for (const id of noticeIds) {
    const hit = sent.find((s) => s.id && matchNotice(id, s.id));
    if (hit) out[id] = { vault: true, method: 'vault', line: hit.line, date: '' };
  }
  return out;
}
