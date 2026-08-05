// journal.mjs — the log. Short entries, timestamped and placed, living in his Obsidian vault.
//
// Operator, 2026-08-05: *"i need us to create a journal inside jarvis that connects to my second brain
// inside obsidian, i want it to look like tweets. I need time and date and place if possible for each entry.
// for example, today i wanted to save in my log 'i wish it was raining today.' thats too deep for me to post
// on x.com. 'nobody cares.' that was another entry."*
//
// WHAT THIS IS FOR. Those two examples set the whole design. They are four words long, they are not insights,
// and they have no audience. A journal that asks "what did you learn today?" gets nothing; a box that takes
// four words and stamps them gets ten years of him. So: no prompts, no titles, no tags required, no minimum.
//
// 🚨 NOTHING HE WRITES IS EVER FILTERED. The crisis-suppression list exists to stop the system turning his
// worst night into a GOAL — it must never stop him from writing the sentence. Those are opposite jobs and
// confusing them would be the cruellest possible bug: a journal that refuses the entry you most needed to
// make. The filtering happens on the way OUT (the goal importer skips this folder), never on the way in.
//
// WHERE IT LIVES: `<vault>/06 - Journals/Log/YYYY-MM.md`, one file per month, day headings inside. Not the
// daily note — his daily notes are full of Jarvis's own gov briefings, and "i wish it was raining today"
// does not belong underneath a contract deadline. Not one file per entry either; that is 3,000 files a year.
//
// PURE and eval-pinned. The file walk lives in the companion.

const clean = (s) => String(s || '').replace(/\r/g, '').trim();

// ── THE LINE ─────────────────────────────────────────────────────────────────────────────────────
// Readable in Obsidian, and it round-trips. The place is optional because most entries will not have one,
// and an empty `*📍 *` on every line would be noise.
//
//   - **09:42** *📍 Nanticoke* — i wish it was raining today
//   - **14:10** — nobody cares
//
// Split on the FIRST ` — `, so his own dashes inside the text survive intact. That matters: he writes the
// way he talks, and a parser that eats half a sentence at the first punctuation is a parser that loses him.
const LINE = /^-\s+\*\*(\d{1,2}:\d{2})\*\*(?:\s+\*📍\s*([^*]+?)\s*\*)?\s+—\s+([\s\S]*)$/;

export function entryLine({ time = '', place = '', text = '' } = {}) {
  const t = clean(text);
  if (!t) return '';
  const hhmm = /^\d{1,2}:\d{2}$/.test(String(time)) ? String(time) : '';
  const p = clean(place);
  // Newlines would break the one-entry-per-line contract; a hard-wrapped thought is still one thought.
  const flat = t.replace(/\s*\n+\s*/g, ' ');
  return `- **${hhmm || '00:00'}**${p ? ` *📍 ${p}*` : ''} — ${flat}`;
}

export function parseLine(line = '') {
  const m = LINE.exec(String(line || '').trimEnd());
  if (!m) return null;
  return { time: m[1], place: clean(m[2] || ''), text: clean(m[3]) };
}

const DAY = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/;

// PURE: a month file → every entry in it, newest LAST (file order). Anything unparseable is skipped rather
// than guessed at — he may hand-edit this file in Obsidian, and a stray line is not an entry.
export function parseMonth(md = '') {
  const out = [];
  let date = '';
  for (const raw of String(md || '').split('\n')) {
    const d = DAY.exec(raw.trim());
    if (d) { date = d[1]; continue; }
    const e = parseLine(raw);
    if (e && date) out.push({ date, ...e });
  }
  return out;
}

export const monthOf = (date = '') => String(date).slice(0, 7);
export const monthFile = (date = '') => monthOf(date) + '.md';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// PURE: a fresh month file. Front matter so Obsidian's own tooling can see it as a log.
export function newMonth(date = '') {
  const m = monthOf(date);
  const [y, mo] = m.split('-');
  return `---\ntype: log\nmonth: ${m}\n---\n\n# Log — ${MONTHS[Number(mo) - 1] || mo} ${y}\n`;
}

// PURE: put one entry into a month file, creating the day heading if it is the first of that day.
//
// Days go NEWEST FIRST in the file, so opening it in Obsidian lands on today rather than on January. Within
// a day, entries stay in the order he wrote them — the shape of a day is part of what he is recording.
export function insertEntry(md = '', entry = {}) {
  const line = entryLine(entry);
  if (!line) return String(md || '');
  const date = String(entry.date || '');
  let body = String(md || '');
  if (!body.trim()) body = newMonth(date);
  const lines = body.split('\n');
  const head = `## ${date}`;
  const at = lines.findIndex((l) => l.trim() === head);
  if (at >= 0) {
    // Last line of this day's block — before the next `## ` heading, or end of file.
    let end = lines.length;
    for (let i = at + 1; i < lines.length; i++) if (/^##\s+\d{4}-\d{2}-\d{2}\s*$/.test(lines[i].trim())) { end = i; break; }
    while (end > at + 1 && !lines[end - 1].trim()) end -= 1;      // skip the blank run before the next day
    lines.splice(end, 0, line);
    return lines.join('\n');
  }
  // A new day goes directly under the title, above every older day.
  let insertAt = lines.findIndex((l) => /^#\s+/.test(l));
  insertAt = insertAt >= 0 ? insertAt + 1 : lines.length;
  lines.splice(insertAt, 0, '', head, '', line);
  return lines.join('\n').replace(/\n{4,}/g, '\n\n\n');
}

// ── STATS — what he asked to see on the main menu ────────────────────────────────────────────────

const dayKey = (d) => String(d || '').slice(0, 10);
const shift = (iso, days) => {
  const t = Date.parse(iso + 'T00:00:00Z');
  return Number.isFinite(t) ? new Date(t + days * 86400000).toISOString().slice(0, 10) : '';
};

// PURE: the counts, and the streak.
//
// The streak tolerates TODAY being empty: at 9am he has not written yet, and a counter that resets to zero
// every morning would punish him for waking up. It breaks only when a full day passes with nothing.
export function stats(entries = [], today = '') {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && e.date && e.text);
  const days = new Set(list.map((e) => dayKey(e.date)));
  const weekStart = shift(today, -6);
  const out = {
    total: list.length,
    today: list.filter((e) => dayKey(e.date) === today).length,
    week: list.filter((e) => dayKey(e.date) >= weekStart && dayKey(e.date) <= today).length,
    days: days.size,
    streak: 0,
    places: [...new Set(list.map((e) => e.place).filter(Boolean))].length,
  };
  if (!today) return out;
  let cursor = days.has(today) ? today : shift(today, -1);
  while (cursor && days.has(cursor)) { out.streak += 1; cursor = shift(cursor, -1); }
  return out;
}

// ── PLACE ────────────────────────────────────────────────────────────────────────────────────────
// Coordinates come from the browser if he allows it. There is NO reverse geocoding: that would mean sending
// his exact location to a third party, and the whole system is self-hosted precisely so that never happens.
// Instead he names a place once and Jarvis remembers it — which produces better names than any API would
// ("Mom's", "the shop"), and keeps his movements on his own machine.

// ~150m of latitude. Fine enough to tell his house from the next street, coarse enough that arriving home
// from a different direction is still home.
const R = 0.0015;
export const placeKey = (lat, lon) => {
  const a = Number(lat), b = Number(lon);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  return `${(Math.round(a / R) * R).toFixed(4)},${(Math.round(b / R) * R).toFixed(4)}`;
};

// PURE: a name he has already given this spot, or ''.
export function nameFor(places = {}, lat, lon) {
  const k = placeKey(lat, lon);
  if (!k) return '';
  const p = places && places[k];
  return (p && (typeof p === 'string' ? p : p.name)) || '';
}

// PURE: remember a name for a spot. Returns the new map rather than mutating.
export function rememberPlace(places = {}, lat, lon, name = '') {
  const k = placeKey(lat, lon);
  const n = clean(name);
  if (!k || !n) return { ...(places || {}) };
  return { ...(places || {}), [k]: { name: n, at: `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}` } };
}

// PURE: newest first, for the feed. The file stores days newest-first already; this sorts across everything.
export function feed(entries = [], limit = 200) {
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => e && e.date && e.text)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    .slice(0, Math.max(1, limit));
}
