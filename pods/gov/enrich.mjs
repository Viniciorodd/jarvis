// Email-finder enrichment — Hector's missing link. Discovery (discover.mjs) gives a sub's WEBSITE + phone
// but no email, while outreach (connector.mjs) and reply-matching (replies.mjs) BOTH key on contact_email.
// This fills it: fetch the sub's site + a couple of its contact/about pages, pull emails out of mailto:
// links and the page text, score them, and write the best one back to the CRM. Free + read-only (no key
// needed); if HUNTER_API_KEY is set it's used only as a fallback when scraping finds nothing. Degrades
// gracefully everywhere. Outreach stays HITL-gated downstream — this only makes a sub reachable.

import { env, emit, mirror } from './lib.mjs';
import { loadSubs, saveSubs } from './connector.mjs';

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
// addresses we never want to reach out to (bots, asset filenames, form placeholders, builder defaults)
const JUNK = /(no-?reply|donotreply|do-not-reply|example\.|sentry\.|wixpress|godaddy|\.(png|jpe?g|gif|svg|webp|ico|css|js)(\?|$)|@2x\.|@3x\.|^(email|name|user|your-?email|youremail|firstname)@)/i;
// role inboxes a procurement lead would prefer, best-first
const ROLE_RANK = ['info', 'contact', 'sales', 'office', 'admin', 'hello', 'estimating', 'estimates', 'bids', 'service', 'support'];

export function domainOf(website) {
  try { return new URL(/^https?:\/\//.test(website) ? website : 'https://' + website).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}

// PURE: pull candidate emails out of HTML — mailto: links first (highest signal), then any address in the
// text — and drop the junk. Eval-tested.
export function extractEmails(html, _domain = '') {
  const set = new Set();
  const src = String(html || '');
  for (const m of src.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    let e; try { e = decodeURIComponent(m[1]); } catch { e = m[1]; }
    e = e.trim().toLowerCase();
    if (e.includes('@')) set.add(e);
  }
  for (const m of src.matchAll(EMAIL_RE)) set.add(m[0].toLowerCase());
  return [...set].filter((e) => !JUNK.test(e));
}

// PURE: choose the best contact email for a domain. Prefer the site's own domain, then a role inbox by
// rank, then the shortest. Eval-tested — this is the decision Hector relies on to reach the right person.
export function pickBestEmail(emails, domain = '') {
  const list = [...new Set((emails || []).map((e) => String(e).toLowerCase().trim()))]
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !JUNK.test(e));
  if (!list.length) return '';
  const d = String(domain || '').replace(/^www\./, '').toLowerCase();
  const onDomain = d ? list.filter((e) => e.endsWith('@' + d) || e.endsWith('.' + d)) : [];
  const pool = onDomain.length ? onDomain : list;
  const rank = (e) => { const i = ROLE_RANK.indexOf(e.split('@')[0]); return i < 0 ? ROLE_RANK.length : i; };
  return pool.slice().sort((a, b) => rank(a) - rank(b) || a.length - b.length)[0];
}

async function fetchText(url, ms = 8000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; RodgateBot/1.0; +procurement contact lookup)' } });
    clearTimeout(t);
    if (!r.ok) return '';
    const ct = r.headers.get('content-type') || '';
    if (ct && !/text|html|xml/i.test(ct)) return '';
    return (await r.text()).slice(0, 400000);
  } catch { return ''; }
}

// likely contact/about pages linked from the homepage, so we follow at most a couple of extra fetches
function contactLinks(html, base) {
  const out = new Set();
  for (const m of String(html).matchAll(/href=["']([^"'#]+)["']/gi)) {
    if (/(contact|about|connect|reach|get-in-touch|team)/i.test(m[1])) {
      try { out.add(new URL(m[1], base).href); } catch { /* skip bad href */ }
    }
  }
  return [...out].slice(0, 3);
}

async function viaHunter(domain) {
  const key = env('HUNTER_API_KEY');
  if (!key || !domain) return '';
  try {
    const r = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=5&api_key=${key}`);
    const d = await r.json();
    return pickBestEmail(((d.data && d.data.emails) || []).map((e) => e.value), domain);
  } catch { return ''; }
}

// Fetch a site + a couple of its contact pages → best email. Free; Hunter.io is tried only if the scrape
// comes up empty (and only when HUNTER_API_KEY is set).
export async function findEmailForSite(website) {
  const domain = domainOf(website);
  if (!domain) return { email: '', domain: '', source: 'no-website' };
  const base = /^https?:\/\//.test(website) ? website : 'https://' + domain;
  const home = await fetchText(base);
  let emails = extractEmails(home, domain);
  if (!pickBestEmail(emails, domain)) {
    for (const link of contactLinks(home, base)) {
      emails = emails.concat(extractEmails(await fetchText(link), domain));
      if (pickBestEmail(emails, domain)) break;
    }
  }
  let email = pickBestEmail(emails, domain);
  let source = email ? 'website' : '';
  if (!email) { email = await viaHunter(domain); if (email) source = 'hunter'; }
  return { email, domain, source: source || 'not-found' };
}

// Enrich CRM rows that have a website but no contact_email (or a specific set of ids). Read-only on the web;
// writes only contact_email + status/notes back to subs.json. Outreach stays gated downstream.
export async function enrichSubs({ ids = null, all = false, limit = 8 } = {}) {
  const subs = loadSubs();
  const want = (s) => (ids ? ids.includes(s.id) : all ? !s.contact_email : (s.website && !s.contact_email));
  const targets = subs.filter(want).filter((s) => s.website).slice(0, limit);
  await mirror('CONNECT-01', 'work', targets.length ? `Finding contact emails for ${targets.length} sub(s)…` : 'No subs need an email lookup');
  const found = [];
  for (const s of targets) {
    const r = await findEmailForSite(s.website);
    if (r.email) {
      s.contact_email = r.email;
      if (s.status === 'prospect') s.status = 'contactable';
      s.notes = `email via ${r.source} (${new Date().toISOString().slice(0, 10)})`;
      found.push({ name: s.name, email: r.email, source: r.source });
      await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'sub.email.found', reversible: true, rationale: `${s.name}: ${r.email} (${r.source})`, payload: { sub: s.id, email: r.email, source: r.source } });
    } else {
      s.notes = `no email found on ${r.domain || 'site'} — add one manually or set HUNTER_API_KEY`;
    }
  }
  if (targets.length) saveSubs(subs);
  // mirror the enriched subs into the Notion CRM (fire-and-forget, graceful)
  if (targets.length) import('../notion.mjs').then(async (N) => { for (const s of targets) await N.syncSub(s); }).catch(() => { /* notion optional */ });
  await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'subs.enriched', rationale: `Found ${found.length}/${targets.length} contact email(s)`, payload: { found } });
  await mirror('CONNECT-01', found.length ? 'need' : 'idle', found.length ? `Found ${found.length} contact email(s) — subs now reachable for outreach` : (targets.length ? `No emails found for ${targets.length} site(s) — add manually` : 'No subs needed enrichment'));
  return { checked: targets.length, found };
}

if (process.argv[1] && process.argv[1].endsWith('enrich.mjs')) {
  const arg = process.argv[2];
  const opts = arg === '--all' ? { all: true } : arg ? { ids: [arg] } : {};
  enrichSubs(opts).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
