// today-view.mjs — turning the vault's raw task list into the short, readable "what's mine today" list.
//
// Operator, 2026-07-29: *"my today and home are still useless on my pc."* Measured that morning: 140 tasks in
// the Today panel, 0 of them due today, rendered with their raw Markdown showing (`**bold**`, `[[wikilinks]]`)
// and one corrupted emoji. A 140-item undifferentiated list is not a to-do list — it is the backlog, and it
// costs him the whole screen to learn that nothing on it is scheduled.
//
// His stated need (memory: operator-needs-clarity) is *simplicity + knowing what's his to do*. So this module
// does exactly two things, both PURE and eval-pinned:
//   1. CLEAN the text so a human can read it (Markdown is a storage format, not a display format).
//   2. RANK it and cap the list, so the top of the screen is what actually matters today.
//
// What it deliberately does NOT do: hide a task because it looks finished. The backlog register marks work
// done in prose, and fuzzy-matching that against vault text would eventually hide a REAL task — which is far
// worse than showing a stale one. Nothing is dropped; the full list stays one click away.

const PRIORITY_RANK = { highest: 0, high: 1, medium: 2, normal: 3, low: 4 };

// PURE: vault Markdown → something readable on a glance screen. Eval-pinned.
export function cleanTaskText(s = '') {
  if (s == null) return '';                                  // a default only covers undefined; String(null)='null'
  let t = String(s);
  // A lone surrogate renders as the black-diamond replacement glyph — one was live on his Home screen.
  t = t.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '').replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1');
  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');      // [[target|label]] → label
  t = t.replace(/\[\[([^\]]+)\]\]/g, '$1');                  // [[target]]       → target
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');           // [text](url)      → text
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1');
  t = t.replace(/(^|\s)\*([^*\s][^*]*)\*/g, '$1$2');         // *italic* (not a bare bullet asterisk)
  t = t.replace(/`([^`]+)`/g, '$1');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

// PURE: a short label for WHY a task is on today's list — shown as the badge. Eval-pinned.
export function taskReason(task = {}, today = '') {
  if (task.due && task.due < today) return 'overdue';
  if (task.due === today) return 'due today';
  if (task.scheduled === today) return 'scheduled today';
  if (task.priority === 'highest' || task.priority === 'high') return task.priority + ' priority';
  return '';
}

// PURE: lower sorts first. Dates beat priority, because a date is a commitment and a priority is an opinion.
export function taskScore(task = {}, today = '') {
  if (task.due && task.due < today) return 0;                // overdue — a promise already broken
  if (task.due === today) return 1;
  if (task.scheduled === today) return 2;
  if (task.due && task.due > today) return 3;                // upcoming, dated
  return 10 + (PRIORITY_RANK[task.priority] ?? 3);           // undated backlog, by priority
}

// PURE: the Today list — cleaned, de-duplicated, ranked, capped. Returns { items, total, hidden }.
// `total` and `hidden` are reported so the UI can say how much it is NOT showing; a list that silently
// truncates reads as "this is everything", which is the same lie in a different costume.
export function rankToday(tasks = [], { today = '', limit = 7 } = {}) {
  const open = (Array.isArray(tasks) ? tasks : []).filter((t) => t && !t.done);
  const seen = new Set();
  const cleaned = [];
  for (const t of open) {
    const text = cleanTaskText(t.text);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;                             // the same task written in two vault files
    seen.add(key);
    cleaned.push({ ...t, text, reason: taskReason(t, today), score: taskScore(t, today) });
  }
  cleaned.sort((a, b) => a.score - b.score || a.text.localeCompare(b.text));
  const items = limit > 0 ? cleaned.slice(0, limit) : cleaned;
  return { items, total: cleaned.length, hidden: Math.max(0, cleaned.length - items.length) };
}
