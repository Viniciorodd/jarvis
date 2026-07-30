// timeline.mjs — ONE searchable record of everything Jarvis and the operator did.
//
// Operator, 2026-07-29: *"can we log everything?"* Capture was never the problem — chat turns go to the vault,
// agent runs and approvals to the control-plane event log, failures and spend to their own files. The problem
// is that answering *"what did Jarvis do on Tuesday, and why?"* meant opening four files in three formats.
// A record you cannot query is an archive, not a memory.
//
// So this merges them into one normalized stream. Pure functions here; the I/O lives in the companion, and
// the chat gets a `timeline` tool so he can just ASK instead of reading files — which is the entire point.

const pad = (n) => String(n).padStart(2, '0');

// PURE: one control-plane event → a timeline row. Eval-pinned.
export function fromEvent(e = {}) {
  const action = String(e.action || e.kind || '').trim();
  return {
    ts: e.ts || '',
    kind: e.kind === 'approval.request' ? 'approval' : (e.status === 'error' ? 'error' : 'agent'),
    who: e.actor || e.pod || 'jarvis',
    what: String(e.rationale || action || '').trim(),
    action,
    pod: e.pod || '',
    cost: Number(e.cost_usd) || 0,
  };
}

// PURE: a day's chat-log Markdown → timeline rows. The log is written by the companion as
// "### HH:MM:SS" then "**You:** …" / "**Jarvis:** …" then an optional verified-actions block.
export function fromChatLog(md = '', date = '') {
  if (!md || !date) return [];
  const out = [];
  const blocks = String(md).split(/^###\s+/m).slice(1);
  for (const b of blocks) {
    const time = (b.match(/^(\d{2}:\d{2}:\d{2})/) || [])[1];
    if (!time) continue;
    const ts = date + 'T' + time;
    const you = (b.match(/\*\*You:\*\*\s*([\s\S]*?)(?=\n\s*\n|\*\*Jarvis:\*\*|$)/) || [])[1];
    const jarvis = (b.match(/\*\*Jarvis:\*\*\s*([\s\S]*?)(?=\n\s*\n_actions|\n\s*\n###|$)/) || [])[1];
    const acts = [...b.matchAll(/^\s*-\s*([✅❌⚠️]?\s*.+)$/gm)].map((m) => m[1].trim());
    if (you) out.push({ ts, kind: 'chat', who: 'you', what: clean(you), action: '', pod: '', cost: 0 });
    if (jarvis) out.push({ ts, kind: 'chat', who: 'jarvis', what: clean(jarvis), action: '', pod: '', cost: 0, actions: acts.length ? acts : undefined });
  }
  return out;
}

function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

// PURE: merge every source, newest first. Rows without a timestamp are dropped rather than floated to the
// top with a fake one — an invented time in an audit trail is worse than a missing row.
export function mergeTimeline(...lists) {
  const all = [];
  for (const l of lists) for (const r of (Array.isArray(l) ? l : [])) if (r && r.ts && r.what) all.push(r);
  all.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  return all;
}

// PURE: query it. `q` matches any word (all terms must appear), `kind` filters the stream, `since` is an
// ISO date/prefix. Eval-pinned.
export function searchTimeline(rows = [], { q = '', kind = '', since = '', limit = 40 } = {}) {
  const terms = String(q || '').toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const out = (Array.isArray(rows) ? rows : []).filter((r) => {
    if (kind && r.kind !== kind) return false;
    if (since && String(r.ts) < String(since)) return false;
    if (!terms.length) return true;
    const hay = (r.what + ' ' + (r.who || '') + ' ' + (r.action || '') + ' ' + (r.pod || '')).toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  return limit > 0 ? out.slice(0, limit) : out;
}

// PURE: a compact human/model-readable rendering. One line per row so a model can quote it exactly.
export function renderTimeline(rows = [], { max = 40 } = {}) {
  const list = (Array.isArray(rows) ? rows : []).slice(0, max);
  if (!list.length) return 'Nothing recorded for that.';
  return list.map((r) => {
    const t = String(r.ts).replace('T', ' ').slice(0, 19);
    const tag = r.kind === 'chat' ? (r.who === 'you' ? 'YOU' : 'JARVIS') : r.kind.toUpperCase();
    const cost = r.cost ? ` ($${r.cost.toFixed(4)})` : '';
    return `${t} [${tag}] ${r.what.slice(0, 220)}${cost}`;
  }).join('\n');
}

// PURE: YYYY-MM-DD strings for the last N days, newest first — which chat-log files to read.
export function recentDays(n = 7, now = new Date()) {
  const out = [];
  const base = new Date(now);
  for (let i = 0; i < Math.max(1, n); i++) {
    const d = new Date(base.getTime() - i * 86400000);
    out.push(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()));
  }
  return out;
}
