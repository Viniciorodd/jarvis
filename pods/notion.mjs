// Notion sync — pushes the company brain (opportunities, subcontractors, daily log, lessons) into the
// Notion databases under "JARVIS — Company Brain". Uses NOTION_API_KEY (the Jarvis internal integration);
// DB ids live in notion-dbs.json (not secret) and can be overridden via NOTION_DB_* env vars.
//
// To go live: share the "JARVIS — Company Brain" page with the Jarvis integration in Notion
// (••• → Connections → add Jarvis). Until then every call degrades gracefully — it logs + skips, never throws.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(HERE, 'notion-dbs.json'), 'utf8')); } catch { return {}; } })();
const DB = {
  opportunities: env('NOTION_DB_OPPORTUNITIES', cfg.opportunities || ''),
  subs: env('NOTION_DB_SUBS', cfg.subs || ''),
  daily: env('NOTION_DB_DAILY', cfg.daily || ''),
  lessons: env('NOTION_DB_LESSONS', cfg.lessons || ''),
};

async function notion(pathname, body, method = 'POST') {
  const key = env('NOTION_API_KEY');
  if (!key) return { skip: 'no NOTION_API_KEY' };
  try {
    const r = await fetch('https://api.notion.com/v1' + pathname, {
      method, signal: AbortSignal.timeout(9000),
      headers: { Authorization: 'Bearer ' + key, 'Notion-Version': '2022-06-28', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { error: d.message || ('HTTP ' + r.status) };
    return d;
  } catch (e) { return { error: e.message }; }
}

const rt = (s) => [{ text: { content: String(s == null ? '' : s).slice(0, 1900) } }];
const dateProp = (v) => { if (!v) return undefined; const d = new Date(v); return isNaN(d) ? undefined : { date: { start: d.toISOString().slice(0, 10) } }; };
const clean = (props) => Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined));

// Upsert by a unique rich_text property: query → PATCH existing or POST new. Returns the result or {skip}.
async function upsert(dbId, uniqueProp, uniqueVal, props) {
  if (!dbId) return { skip: 'no db id' };
  const q = await notion(`/databases/${dbId}/query`, { filter: { property: uniqueProp, rich_text: { equals: String(uniqueVal) } }, page_size: 1 });
  if (q.skip || q.error) return q;
  const hit = (q.results || [])[0];
  if (hit) return notion(`/pages/${hit.id}`, { properties: clean(props) }, 'PATCH');
  return notion('/pages', { parent: { database_id: dbId }, properties: clean(props) });
}

export async function syncOpportunity(op = {}, sc = {}) {
  const rec = ['bid', 'watch', 'no-bid'].includes(sc.recommendation) ? sc.recommendation : 'watch';
  return upsert(DB.opportunities, 'Notice ID', op.noticeId || op.title, {
    'Title': { title: rt(op.title) },
    'Notice ID': { rich_text: rt(op.noticeId) },
    'Agency': { rich_text: rt(op.agency) },
    'NAICS': { rich_text: rt(op.naics) },
    'Set-Aside': { rich_text: rt(op.setAside) },
    'Score': { number: Number(sc.match_score) || 0 },
    'Recommendation': { select: { name: rec } },
    'Place': { rich_text: rt(op.place) },
    'State': { rich_text: rt(op.placeState) },
    'Deadline': dateProp(op.deadline),
    'Link': op.url ? { url: op.url } : undefined,
  });
}

export async function syncSub(s = {}) {
  const status = ['prospect', 'contactable', 'quoted'].includes(s.status) ? s.status : 'prospect';
  return upsert(DB.subs, 'Name', s.name, {
    'Name': { title: rt(s.name) },
    'Trade': { rich_text: rt(s.trade) },
    'Location': { rich_text: rt(s.location) },
    'Contact Email': s.contact_email ? { email: s.contact_email } : undefined,
    'Phone': s.phone ? { phone_number: String(s.phone) } : undefined,
    'Website': s.website ? { url: s.website } : undefined,
    'Status': { select: { name: status } },
    'Quote': { rich_text: rt(s.quote) },
    'Past Performance': { rich_text: rt(s.past_performance_notes || s.past_performance) },
  });
}

export async function logDaily({ day, date, summary, moneyIn = 0, aiSpend = 0, actions = 0, needsYou = 0 } = {}) {
  return upsert(DB.daily, 'Day', day || (date || '').slice(0, 10), {
    'Day': { title: rt(day || (date || new Date().toISOString()).slice(0, 10)) },
    'Date': dateProp(date || new Date().toISOString()),
    'Summary': { rich_text: rt(summary) },
    'Money In': { number: Number(moneyIn) || 0 },
    'AI Spend': { number: Number(aiSpend) || 0 },
    'Actions': { number: Number(actions) || 0 },
    'Needs You': { number: Number(needsYou) || 0 },
  });
}

if (process.argv[1] && process.argv[1].endsWith('notion.mjs')) {
  syncOpportunity({ noticeId: 'TEST-1', title: 'Notion sync test — Custodial', agency: 'Test', naics: '561720', setAside: 'Total Small Business', place: 'Tampa', placeState: 'FL', deadline: '2026-07-15', url: 'https://sam.gov' }, { match_score: 88, recommendation: 'bid' })
    .then((r) => console.log('opportunities:', JSON.stringify(r).slice(0, 300)))
    .catch((e) => { console.error(e); process.exitCode = 1; });
}
