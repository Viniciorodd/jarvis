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

// ── PURE: parse a spoken/typed focus log. "I focused 90 minutes on gov" / "2 hours deep work on the
// proposal" / "studied 45 min". Returns { ok, minutes, tag, note } or { ok:false }. Eval-pinned. ────────
const FOCUS_VERB = /\b(focus(?:ed|ing)?|deep[- ]?work|worked?|studied|study|grind(?:ed|ing)?|session|productive)\b/i;
export function parseFocusUtterance(text) {
  const t = String(text || '').trim();
  if (!t || /\?\s*$/.test(t)) return { ok: false };
  if (!FOCUS_VERB.test(t) && !/\b\d+\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)\b/i.test(t)) return { ok: false };
  let minutes = 0;
  const hm = t.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b(?:\s*(?:and\s*)?(\d+)\s*(?:m|min|mins|minutes?))?/i);
  if (hm) minutes = Math.round(parseFloat(hm[1]) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0));
  else { const mm = t.match(/\b(\d+)\s*(?:m|min|mins|minutes?)\b/i); if (mm) minutes = parseInt(mm[1], 10); }
  if (!(minutes > 0) || minutes > 24 * 60) return { ok: false };
  let tag = '', note = '';
  const on = t.match(/\bon\s+(.+)$/i);
  if (on) { note = on[1].replace(/[.!?,\s]+$/, '').trim(); tag = note.split(/\s+/).slice(0, 3).join(' ').toLowerCase(); }
  return { ok: true, minutes, tag: tag || 'focus', note };
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
  let totalMin = 0, ok = 0;
  const byBucket = {}, byTag = {}, byDow = [0, 0, 0, 0, 0, 0, 0], days = new Set();
  for (const s of sessions) {
    const m = Number(s.minutes) || 0; totalMin += m; if (s.success !== false) ok++;
    const b = bucketKey(s.date, grouping); byBucket[b] = (byBucket[b] || 0) + m;
    byTag[s.tag || 'focus'] = (byTag[s.tag || 'focus'] || 0) + m;
    days.add(s.date);
    const dow = new Date((s.date || '') + 'T00:00:00Z').getUTCDay(); if (dow >= 0 && dow <= 6) byDow[dow] += m;
  }
  const series = Object.keys(byBucket).sort().map((k) => ({ bucket: k, minutes: byBucket[k], hours: Math.round(byBucket[k] / 6) / 10 }));
  const topTags = Object.entries(byTag).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, minutes]) => ({ tag, minutes, hours: Math.round(minutes / 6) / 10 }));
  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const bestDow = byDow.indexOf(Math.max(...byDow));
  return {
    sessions: sessions.length,
    totalMinutes: totalMin, totalHours: Math.round(totalMin / 6) / 10,
    activeDays: days.size, avgPerActiveDay: days.size ? Math.round(totalMin / days.size) : 0,
    successRate: sessions.length ? Math.round((ok / sessions.length) * 100) : 0,
    grouping, series, topTags,
    byDayOfWeek: dowNames.map((n, i) => ({ day: n, minutes: byDow[i] })),
    bestDayOfWeek: totalMin ? dowNames[bestDow] : null,
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

// Convenience for the voice/chat path.
export function captureFocus(text) {
  const p = parseFocusUtterance(text);
  if (!p.ok) return { ok: false };
  const r = logFocus({ minutes: p.minutes, tag: p.tag, note: p.note, source: 'voice' });
  if (!r.ok) return { ok: false, error: r.error };
  const h = Math.floor(p.minutes / 60), mm = p.minutes % 60;
  const dur = h ? `${h}h${mm ? ' ' + mm + 'm' : ''}` : `${mm}m`;
  const todayTotal = summarize(readFocus({ since: new Date().toISOString().slice(0, 10) })).totalMinutes;
  const th = Math.floor(todayTotal / 60), tm = todayTotal % 60;
  return { ok: true, session: r.session, spoken: `Logged ${dur} of focus${p.note ? ' on ' + p.note : ''}. 🌳 ${th ? th + 'h ' : ''}${tm}m focused today.` };
}

if (process.argv[1] && process.argv[1].endsWith('focus.mjs')) {
  const arg = process.argv.slice(2).join(' ');
  if (arg) console.log(JSON.stringify(captureFocus(arg), null, 2));
  else console.log(JSON.stringify(summarize(readFocus({}), { grouping: 'month' }), null, 2));
}
