// teaming.mjs — the "teaming radar": Rodgate as the SUB reaching UP to primes. Primes holding federal
// contracts over ~$750k must carry a small-business subcontracting plan — they NEED small subs like us.
// The signal: recent LARGE awards in our lane → the awardee is a prime who now needs custodial/grounds
// help. This scans USASpending.gov (free, no key) for those awards, ranks the primes, and drafts a short
// teaming intro to attach a capability statement to. DOCTRINE: this only DRAFTS — every send stays gated
// ("draft at scale, approve from your phone"). classify + introLetter are PURE + eval-pinned.

import { COMPANY } from './company.mjs';

// NAICS where big primes hold facilities/janitorial/base-ops contracts that get subbed out to firms like us.
export const TEAMING_NAICS = ['561210', '561720', '561730', '561612', '561990', '561740'];
const NEAR_STATES = ['PA', 'NJ', 'FL', 'NY', 'DE', 'MD', 'VA', 'CT'];

// PURE: is this award a prime worth reaching out to? Eval-pinned.
export function classifyTeamingTarget(award = {}, { minAward = 750000 } = {}) {
  const recipient = String(award.recipient || award['Recipient Name'] || '').trim();
  const amount = Number(award.amount || award['Award Amount'] || 0);
  const naics = String(award.naics || award.naics_code || award['naics_code'] || '').trim();
  const state = String(award.state || award['Place of Performance State Code'] || '').trim().toUpperCase();
  if (!recipient) return { ok: false, reason: 'no recipient' };
  if (/rodgate/i.test(recipient)) return { ok: false, reason: 'that is us' };
  if (!(amount >= minAward)) return { ok: false, reason: `award $${amount} below the $${minAward} sub-plan threshold` };
  const reasons = [`$${(amount / 1e6).toFixed(1)}M award — over the $750k subcontracting-plan threshold`];
  const near = NEAR_STATES.includes(state);
  if (near) reasons.push(`work in ${state} (your service area)`);
  if (TEAMING_NAICS.includes(naics)) reasons.push(`NAICS ${naics} — your lane`);
  let score = 0;
  if (amount >= 5e6) score += 3; else if (amount >= 2e6) score += 2; else score += 1;
  if (near) score += 2;
  if (TEAMING_NAICS.includes(naics)) score += 1;
  return { ok: true, score, amount, recipient, state, naics, why: reasons.join(' · ') };
}

// PURE: a short, professional teaming intro (markdown) — Rodgate introducing itself as a janitorial/grounds
// subcontractor on the prime's award. Never sent automatically. Eval-pinned.
export function introLetter(prime = {}, { agency = '', award = '' } = {}) {
  const c = COMPANY;
  const name = String(prime.recipient || prime['Recipient Name'] || 'your team').trim();
  const amt = Number(prime.amount || prime['Award Amount'] || 0);
  const ref = award || (amt ? `your recent $${(amt / 1e6).toFixed(1)}M award${agency ? ' with ' + agency : ''}` : 'your recent federal award');
  return [
    `Subject: Small-business janitorial & grounds subcontractor — ${c.legalName}`,
    ``,
    `Hello ${name} team,`,
    ``,
    `Congratulations on ${ref}. I'm ${c.contact.name}, Managing Member of ${c.legalName} (DBA ${c.dba}) — a ${c.socioEconomic[1]}, ${c.socioEconomic[2]} small business specializing in custodial, janitorial, carpet & floor care, and grounds maintenance across ${c.serviceArea.join(', ')}.`,
    ``,
    `As you build out your subcontracting plan, we'd welcome the chance to support the facilities/custodial scope. We're SAM.gov registered (UEI ${c.uei}, CAGE ${c.cage}), owner-managed for fast response, and can scale crews to the site.`,
    ``,
    `I've attached our capability statement. Could we set up a brief call to see where we might fit?`,
    ``,
    `Thank you,`,
    `${c.contact.name} · ${c.contact.role}`,
    `${c.legalName} · ${c.contact.email} · ${c.contact.phone}`,
  ].join('\n');
}

const iso = (d) => d.toISOString().slice(0, 10);

// Live USASpending fetch → classify → ranked teaming targets. Free, no key. Best-effort.
export async function scanTeaming({ minAward = 750000, days = 120, limit = 40 } = {}) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const body = {
    filters: {
      time_period: [{ start_date: iso(from), end_date: iso(to) }],
      naics_codes: TEAMING_NAICS,
      award_type_codes: ['A', 'B', 'C', 'D'],
    },
    fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Place of Performance State Code', 'Start Date', 'naics_code'],
    sort: 'Award Amount', order: 'desc', limit: 100,
  };
  let data;
  try {
    const r = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return { ok: false, error: `USASpending HTTP ${r.status}`, leads: [], count: 0 };
    data = await r.json();
  } catch (e) { return { ok: false, error: e.message, leads: [], count: 0 }; }
  const seen = new Set();
  const leads = [];
  for (const a of data.results || []) {
    const c = classifyTeamingTarget(a, { minAward });
    if (!c.ok) continue;
    const key = c.recipient.toLowerCase();
    if (seen.has(key)) continue; seen.add(key); // one row per prime (their biggest award)
    leads.push({
      recipient: c.recipient, amount: c.amount, agency: a['Awarding Agency'] || '', state: c.state,
      naics: c.naics, awardId: a['Award ID'] || '', start: a['Start Date'] || '',
      score: c.score, why: c.why,
    });
  }
  leads.sort((a, b) => b.score - a.score || b.amount - a.amount);
  return { ok: true, count: leads.length, leads: leads.slice(0, limit) };
}

if (process.argv[1] && process.argv[1].endsWith('teaming.mjs')) {
  scanTeaming({}).then((r) => {
    if (!r.ok) { console.error('teaming:', r.error); process.exit(1); }
    console.log(`\nTeaming radar: ${r.count} primes who may need small-biz subs\n`);
    for (const l of r.leads.slice(0, 15)) console.log(`[${l.score}] ${l.recipient} — $${(l.amount / 1e6).toFixed(1)}M · ${l.agency} · ${l.state}\n   ${l.why}\n`);
  });
}
