// Google (Gmail + Calendar) — READ-ONLY. Lets the companion read/summarize the operator's inbox and
// agenda. Least privilege: gmail.readonly + calendar.readonly only — she can READ, never send or change.
// Dependency-free (raw fetch + a stored refresh token). Run scripts/google-auth.mjs once to connect.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ENV_FILE = path.join(__dirname, '..', '.env');
function env(k) {
  if (process.env[k]) return process.env[k];
  try { const m = fs.readFileSync(ENV_FILE, 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); if (m) return m[1].trim(); } catch { /* */ }
  return '';
}

function googleConfigured() { return !!(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET') && env('GOOGLE_REFRESH_TOKEN')); }

let cache = { token: '', exp: 0 };
async function getAccessToken() {
  if (cache.token && Date.now() < cache.exp) return cache.token;
  const body = new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), refresh_token: env('GOOGLE_REFRESH_TOKEN'), grant_type: 'refresh_token' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) throw new Error('Google token refresh failed (' + r.status + ') — reconnect with scripts/google-auth.mjs');
  const d = await r.json();
  cache = { token: d.access_token, exp: Date.now() + ((d.expires_in || 3600) - 60) * 1000 };
  return cache.token;
}

// Recent emails (default: unread in inbox). Returns [{from, subject, date, snippet}].
async function gmailRecent({ max = 8, query = 'is:unread in:inbox' } = {}) {
  const tok = await getAccessToken();
  const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(query)}`, { headers: { authorization: 'Bearer ' + tok } });
  if (!list.ok) throw new Error('Gmail list failed (' + list.status + ')');
  const ids = ((await list.json()).messages || []).map((m) => m.id);
  const out = [];
  for (const id of ids) {
    const mr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers: { authorization: 'Bearer ' + tok } });
    if (!mr.ok) continue;
    const m = await mr.json();
    const h = Object.fromEntries(((m.payload && m.payload.headers) || []).map((x) => [x.name.toLowerCase(), x.value]));
    out.push({ from: h.from || '', subject: h.subject || '(no subject)', date: h.date || '', snippet: (m.snippet || '').slice(0, 140) });
  }
  return out;
}

// Upcoming calendar events. Returns [{start, summary, location}].
async function calendarUpcoming({ days = 7, max = 10 } = {}) {
  const tok = await getAccessToken();
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86400000).toISOString();
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=${max}`, { headers: { authorization: 'Bearer ' + tok } });
  if (!r.ok) throw new Error('Calendar fetch failed (' + r.status + ')');
  return ((await r.json()).items || []).map((e) => ({ start: (e.start && (e.start.dateTime || e.start.date)) || '', summary: e.summary || '(busy)', location: e.location || '' }));
}

// Open Google Tasks (incomplete only). Returns [{title, due, notes}]. Needs the tasks.readonly scope —
// if this 403s, re-run scripts/google-auth.mjs once to grant Tasks access.
async function tasksRecent({ max = 15 } = {}) {
  const tok = await getAccessToken();
  const r = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&maxResults=${max}`, { headers: { authorization: 'Bearer ' + tok } });
  if (!r.ok) throw new Error('Tasks fetch failed (' + r.status + ') — re-run scripts/google-auth.mjs to grant Tasks access');
  return ((await r.json()).items || []).filter((t) => t.title).map((t) => ({ title: t.title, due: t.due || '', notes: (t.notes || '').slice(0, 120) }));
}

module.exports = { googleConfigured, gmailRecent, calendarUpcoming, tasksRecent };
