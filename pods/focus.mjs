// focus.mjs — time & focus tracker. Replaces Forest: log a session by voice ("I focused 90 minutes on
// gov proposals") OR import your Forest history, then see totals + patterns by day / week / month /
// quarter / year, by tag. This is your TIME, not money — no gates, just data. Pure parsers + aggregation
// are eval-pinned; the machine ledger is focus/<year>.jsonl, one line per session.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, 'focus');
const ledgerFile = (year) => path.join(DIR, `${year}.jsonl`);

// ── PURE: split one CSV line respecting quoted fields (Forest notes may contain commas). Eval-pinned. ──
export function splitCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// ── PURE: normalize a Forest timestamp (`...-0500` → `...-05:00`) so Date parses it. ────────────────
function normTs(s) { return String(s || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'); }
const minutesBetween = (a, b) => { const d = (new Date(normTs(b)) - new Date(normTs(a))) / 60000; return d > 0 && d < 24 * 60 ? Math.round(d) : 0; };

// ── PURE: parse a Forest export CSV → sessions [{start,end,minutes,tag,note,success,date}]. Eval-pinned. ──
export function parseForestCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const iS = idx('start time'), iE = idx('end time'), iT = idx('tag'), iN = idx('note'), iOk = idx('is success');
  if (iS < 0 || iE < 0) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    const start = f[iS], end = f[iE];
    if (!start || !end) continue;
    const minutes = minutesBetween(start, end);
    if (!minutes) continue;
    const tag = (f[iT] || '').trim(); const note = (f[iN] || '').trim();
    out.push({
      start: normTs(start), end: normTs(end), minutes,
      tag: (!tag || /^unset$/i.test(tag)) ? 'unset' : tag.toLowerCase(),
      note, success: iOk < 0 ? true : /true|1|yes/i.test(f[iOk] || ''),
      date: String(start).slice(0, 10), source: 'forest',
    });
  }
  return out;
}

// ── PURE: extract an EXPLICIT date (+ optional start time) from a typed/pasted log so a session can be
// BACKDATED to when it actually happened, not stamped "now". Handles: ISO 2026-07-13, US 7/13[/2026],
// month names (July 13[, 2026] / 13 Jul), and relative (yesterday / last night / today / N days ago).
// Time: "at 2am", "2:30 PM", "14:30". Returns { date:'YYYY-MM-DD'|null, start:ISO|null, matched }. Eval-pinned.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const _pad = (n) => String(n).padStart(2, '0');
const _ymd = (y, m, d) => `${y}-${_pad(m)}-${_pad(d)}`;
export function parseFocusDate(text, now = new Date()) {
  const t = String(text || '');
  const Y = now.getFullYear();
  const shift = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return _ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  let date = null, matched = null;
  let mm;
  if (/\bthe day before yesterday\b/i.test(t)) { date = shift(2); matched = 'the day before yesterday'; }
  else if (/\b(yesterday|last night)\b/i.test(t)) { date = shift(1); matched = 'yesterday'; }
  else if ((mm = t.match(/\b(\d+)\s*days?\s*ago\b/i))) { date = shift(parseInt(mm[1], 10)); matched = mm[0]; }
  else if (/\b(today|this (?:morning|afternoon|evening)|tonight)\b/i.test(t)) { date = shift(0); matched = 'today'; }
  if (!date && (mm = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/))) { date = _ymd(+mm[1], +mm[2], +mm[3]); matched = mm[0]; }
  if (!date && (mm = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) { let y = mm[3] ? +mm[3] : Y; if (y < 100) y += 2000; date = _ymd(y, +mm[1], +mm[2]); matched = mm[0]; }
  if (!date && (mm = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i))) { date = _ymd(mm[3] ? +mm[3] : Y, MONTHS[mm[1].toLowerCase().slice(0, 3)], +mm[2]); matched = mm[0]; }
  if (!date && (mm = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s*(20\d{2}))?/i))) { date = _ymd(mm[3] ? +mm[3] : Y, MONTHS[mm[2].toLowerCase().slice(0, 3)], +mm[1]); matched = mm[0]; }
  let start = null;
  if (date) {
    const tm = t.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i) || t.match(/\bat\s+(\d{1,2}):(\d{2})\b/);
    if (tm) {
      let hh = parseInt(tm[1], 10); const min = tm[2] ? parseInt(tm[2], 10) : 0; const ap = (tm[3] || '').toLowerCase();
      if (ap.startsWith('p') && hh < 12) hh += 12; if (ap.startsWith('a') && hh === 12) hh = 0;
      if (hh >= 0 && hh < 24 && min < 60) start = `${date}T${_pad(hh)}:${_pad(min)}:00`;
    }
  }
  return { date, start, matched };
}

// ── PURE: parse a spoken/typed focus log. "I focused 90 minutes on gov" / "2 hours deep work on the
// proposal" / "studied 45 min" / "7/13 at 2am 30 min of reading" (backdated). Returns
// { ok, minutes, tag, note, date, start } or { ok:false }. Eval-pinned. ─────────────────────────────────
const FOCUS_VERB = /\b(focus(?:ed|ing)?|deep[- ]?work|worked?|studied|study|read(?:ing)?|journal(?:ing|ed)?|grind(?:ed|ing)?|session|productive)\b/i;
export function parseFocusUtterance(text, now = new Date()) {
  const t = String(text || '').trim();
  if (!t || /\?\s*$/.test(t)) return { ok: false };
  if (!FOCUS_VERB.test(t) && !/\b\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)\b/i.test(t)) return { ok: false };
  let minutes = 0;
  const hm = t.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b(?:\s*(?:and\s*)?(\d+)\s*(?:m|min|mins|minutes?))?/i);
  if (hm) minutes = Math.round(parseFloat(hm[1]) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0));
  else { const mm = t.match(/\b(\d+)\s*(?:m|min|mins|minutes?)\b/i); if (mm) minutes = parseInt(mm[1], 10); }
  if (!(minutes > 0) || minutes > 24 * 60) return { ok: false };
  const when = parseFocusDate(t, now);
  let tag = '', note = '';
  const act = t.match(/\b(?:on|of|doing|reading|studying|journaling)\s+(.+)$/i);
  if (act) { note = act[1].replace(/[.!?,\s]+$/, '').trim(); tag = note.split(/\s+/).slice(0, 3).join(' ').toLowerCase(); }
  else if (/\breading\b/i.test(t)) { tag = 'reading'; note = 'reading'; }
  else if (/\bjournal/i.test(t)) { tag = 'journal'; note = 'journaling'; }
  return { ok: true, minutes, tag: tag || 'focus', note, date: when.date || '', start: when.start || '' };
}

// ── IO ──────────────────────────────────────────────────────────────────────────────────────────────
export function logFocus({ minutes, tag = 'focus', note = '', start = '', end = '', success = true, source = 'voice', date = '' } = {}) {
  const m = Number(minutes);
  if (!(m > 0)) return { ok: false, error: 'minutes must be > 0' };
  const day = (date || start || new Date().toISOString()).slice(0, 10);
  const rec = { id: crypto.randomUUID(), ts: new Date().toISOString(), date: day, minutes: Math.round(m), tag: String(tag || 'focus').toLowerCase().slice(0, 40), note: String(note).slice(0, 200), success: success !== false, start: start || '', end: end || '', source };
  try { fs.mkdirSync(DIR, { recursive: true }); fs.appendFileSync(ledgerFile(day.slice(0, 4)), JSON.stringify(rec) + '\n'); }
  catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, session: rec };
}

export function readFocus({ years = null, since = '', until = '' } = {}) {
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => /^\d{4}\.jsonl$/.test(f)); } catch { return []; }
  if (years) files = files.filter((f) => years.includes(f.slice(0, 4)));
  const out = [];
  for (const f of files) {
    let raw; try { raw = fs.readFileSync(path.join(DIR, f), 'utf8'); } catch { continue; }
    for (const line of raw.split('\n')) { if (!line.trim()) continue; try { const s = JSON.parse(line); if ((!since || s.date >= since) && (!until || s.date <= until)) out.push(s); } catch { /* */ } }
  }
  return out;
}

// Import Forest sessions, deduped by start-time (idempotent — re-import adds nothing). Returns counts.
export function importForest(csvText) {
  const sessions = parseForestCsv(csvText);
  const seen = new Set(readFocus({}).map((s) => s.start).filter(Boolean));
  let added = 0;
  for (const s of sessions) {
    if (s.start && seen.has(s.start)) continue;
    const r = logFocus({ ...s, source: 'forest' });
    if (r.ok) { added++; seen.add(s.start); }
  }
  return { parsed: sessions.length, added, skipped: sessions.length - added };
}

// ── PURE: bucket key for a date under a grouping. Eval-pinned. ──────────────────────────────────────
export function bucketKey(dateStr, grouping = 'day') {
  const d = String(dateStr || '').slice(0, 10);
  const [y, m] = d.split('-');
  if (grouping === 'year') return y;
  if (grouping === 'month') return `${y}-${m}`;
  if (grouping === 'quarter') return `${y}-Q${Math.floor((parseInt(m, 10) - 1) / 3) + 1}`;
  if (grouping === 'week') {
    const dt = new Date(d + 'T00:00:00Z');
    const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day + 3);
    const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((dt - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return d; // day
}

// ── PURE: aggregate sessions → totals + a time series + by-tag + patterns. Eval-pinned. ─────────────
export function summarize(sessions = [], { grouping = 'day' } = {}) {
  let totalMin = 0, ok = 0, longestMin = 0, longestDate = '', longestTag = '';
  const byBucket = {}, byTag = {}, byDow = [0, 0, 0, 0, 0, 0, 0], days = new Set();
  const byHour = new Array(24).fill(0), byDate = {};
  for (const s of sessions) {
    const m = Number(s.minutes) || 0; totalMin += m; if (s.success !== false) ok++;
    const b = bucketKey(s.date, grouping); byBucket[b] = (byBucket[b] || 0) + m;
    byTag[s.tag || 'focus'] = (byTag[s.tag || 'focus'] || 0) + m;
    days.add(s.date); byDate[s.date] = (byDate[s.date] || 0) + m;
    const dow = new Date((s.date || '') + 'T00:00:00Z').getUTCDay(); if (dow >= 0 && dow <= 6) byDow[dow] += m;
    // time-of-day ("when do you focus"): hour as WRITTEN in the start stamp (preserves the logged-local hour).
    if (s.start) { const h = parseInt(String(s.start).slice(11, 13), 10); if (h >= 0 && h < 24) byHour[h] += m; }
    if (m > longestMin) { longestMin = m; longestDate = s.date; longestTag = s.tag || 'focus'; }
  }
  // records — the single biggest session + the single most-focused day.
  let bestDayMin = 0, bestDayDate = '';
  for (const [d, mm] of Object.entries(byDate)) { if (mm > bestDayMin) { bestDayMin = mm; bestDayDate = d; } }
  const series = Object.keys(byBucket).sort().map((k) => ({ bucket: k, minutes: byBucket[k], hours: Math.round(byBucket[k] / 6) / 10 }));
  const topTags = Object.entries(byTag).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, minutes]) => ({ tag, minutes, hours: Math.round(minutes / 6) / 10 }));
  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const bestDow = byDow.indexOf(Math.max(...byDow));
  // the timeline: the most recent sessions by when they actually happened (start||date), newest first.
  const recent = [...sessions]
    .sort((a, b) => String(b.start || b.date || '').localeCompare(String(a.start || a.date || '')))
    .slice(0, 40)
    .map((s) => ({ date: s.date, start: s.start || '', minutes: s.minutes, tag: s.tag, note: s.note || '', source: s.source || '' }));
  return {
    sessions: sessions.length,
    totalMinutes: totalMin, totalHours: Math.round(totalMin / 6) / 10,
    activeDays: days.size, avgPerActiveDay: days.size ? Math.round(totalMin / days.size) : 0,
    successRate: sessions.length ? Math.round((ok / sessions.length) * 100) : 0,
    grouping, series, topTags, recent,
    byDayOfWeek: dowNames.map((n, i) => ({ day: n, minutes: byDow[i] })),
    byHour: byHour.map((minutes, hour) => ({ hour, minutes })),
    bestDayOfWeek: totalMin ? dowNames[bestDow] : null,
    records: {
      longestSessionMin: longestMin, longestSessionDate: longestDate, longestSessionTag: longestTag,
      bestDayMinutes: bestDayMin, bestDayDate,
      avgSessionMin: sessions.length ? Math.round(totalMin / sessions.length) : 0,
    },
    streak: currentStreak([...days]),
  };
}

// PURE: consecutive days (ending at the most recent active day) with ≥1 session. Eval-pinned.
export function currentStreak(dayList = []) {
  if (!dayList.length) return 0;
  const set = new Set(dayList);
  let d = new Date([...dayList].sort().pop() + 'T00:00:00Z'), streak = 0;
  while (set.has(d.toISOString().slice(0, 10))) { streak++; d.setUTCDate(d.getUTCDate() - 1); }
  return streak;
}

// PURE: sessions for one specific day, ordered by time (for the day drill-down: when + what + source).
export function sessionsOn(sessions = [], day = '') {
  return sessions.filter((s) => s.date === day)
    .sort((a, b) => String(a.start || a.ts || '').localeCompare(String(b.start || b.ts || '')))
    .map((s) => ({ date: s.date, start: s.start || '', end: s.end || '', minutes: s.minutes, tag: s.tag, note: s.note || '', source: s.source || '', ts: s.ts || '' }));
}

// Convenience for the voice/chat + typed-log path. Honors a backdate parsed from the text ("Jul 13, 2am,
// 30 min reading" logs ON Jul 13, not today). source: 'voice' from chat, 'manual' from the dashboard box.
export function captureFocus(text, source = 'manual') {
  const p = parseFocusUtterance(text);
  if (!p.ok) return { ok: false };
  const today = new Date().toISOString().slice(0, 10);
  const backdated = !!p.date && p.date !== today;
  const r = logFocus({ minutes: p.minutes, tag: p.tag, note: p.note, date: p.date || '', start: p.start || '', source: backdated ? 'manual' : source });
  if (!r.ok) return { ok: false, error: r.error };
  const h = Math.floor(p.minutes / 60), mm = p.minutes % 60;
  const dur = h ? `${h}h${mm ? ' ' + mm + 'm' : ''}` : `${mm}m`;
  const onNote = p.note ? ' on ' + p.note : '';
  if (backdated) {
    const nice = new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const atT = p.start ? ' at ' + p.start.slice(11, 16) : '';
    return { ok: true, session: r.session, backdated: true, spoken: `📅 Logged ${dur}${onNote} on ${nice}${atT} (backdated) ✓` };
  }
  const todayTotal = summarize(readFocus({ since: today })).totalMinutes;
  const th = Math.floor(todayTotal / 60), tm = todayTotal % 60;
  return { ok: true, session: r.session, spoken: `Logged ${dur}${onNote}. 🌳 ${th ? th + 'h ' : ''}${tm}m focused today.` };
}

if (process.argv[1] && process.argv[1].endsWith('focus.mjs')) {
  const arg = process.argv.slice(2).join(' ');
  if (arg) console.log(JSON.stringify(captureFocus(arg), null, 2));
  else console.log(JSON.stringify(summarize(readFocus({}), { grouping: 'month' }), null, 2));
}
