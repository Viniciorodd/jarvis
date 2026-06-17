// Sub discovery — Hector finds LOCAL businesses that can perform a contract and drops them in the CRM
// (pods/gov/subs.json, which you can open + edit). Two sources: Google Places (local businesses by trade)
// and SAM.gov (registered federal contractors by NAICS). Each degrades gracefully if its key is missing.
// Discovered rows are "prospect" with no email yet — add a contact email (or a future enrichment step)
// before Hector reaches out.

import { env, emit, mirror } from './lib.mjs';
import { loadSubs, saveSubs } from './connector.mjs';

const TRADE_NAICS = { janitorial: '561720', grounds: '561730', facilities: '561210', hvac: '238220', electrical: '238210', pest: '561710', guard: '561612' };
const stateOf = (loc) => (String(loc).match(/,\s*([A-Za-z]{2})\b/) || [])[1] || (String(loc).match(/\b([A-Za-z]{2})\b\s*$/) || [])[1] || '';

// Places API (New) — Text Search. Returns website + phone in one call via the field mask (a direct email
// still needs a paid finder; website/phone is the fast path to it). Requires "Places API (New)" enabled.
async function viaPlaces({ trade, location }) {
  const key = env('GOOGLE_PLACES_API_KEY');
  if (!key) return { skipped: 'no GOOGLE_PLACES_API_KEY' };
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber' },
      body: JSON.stringify({ textQuery: `${trade} services near ${location}`, maxResultCount: 10 }),
    });
    const d = await r.json();
    if (d.error) return { error: 'Places: ' + (d.error.message || d.error.status || r.status) };
    return { results: (d.places || []).map((p) => ({ name: (p.displayName && p.displayName.text) || '', location: p.formattedAddress || location, website: p.websiteUri || '', phone: p.nationalPhoneNumber || '', source: 'google-places' })) };
  } catch (e) { return { error: 'Places: ' + e.message }; }
}

async function viaSam({ naics, state }) {
  const key = env('SAM_API_KEY');
  if (!key) return { skipped: 'no SAM_API_KEY' };
  if (!naics) return { skipped: 'no NAICS for trade' };
  try {
    const url = `https://api.sam.gov/entity-information/v4/entities?api_key=${key}&primaryNaics=${naics}&registrationStatus=A${state ? `&physicalAddressProvinceOrStateCode=${state}` : ''}&includeSections=entityRegistration,coreData`;
    const r = await fetch(url);
    if (!r.ok) return { error: 'SAM ' + r.status };
    const d = await r.json();
    return { results: (d.entityData || []).slice(0, 10).map((e) => ({ name: (e.entityRegistration && e.entityRegistration.legalBusinessName) || 'unknown', location: [e.coreData && e.coreData.physicalAddress && e.coreData.physicalAddress.city, e.coreData && e.coreData.physicalAddress && e.coreData.physicalAddress.stateOrProvinceCode].filter(Boolean).join(', ') || state, source: 'sam.gov', uei: e.entityRegistration && e.entityRegistration.ueiSAM })) };
  } catch (e) { return { error: 'SAM: ' + e.message }; }
}

export async function discoverSubs({ trade = 'janitorial', location = '', naics = '', enrich = false } = {}) {
  naics = naics || TRADE_NAICS[trade] || '';
  const state = stateOf(location);
  await mirror('CONNECT-01', 'work', `Discovering ${trade} subs near ${location || state || 'region'}…`);
  const [places, sam] = await Promise.all([viaPlaces({ trade, location }), viaSam({ naics, state })]);
  const found = [...(places.results || []), ...(sam.results || [])];

  const existing = loadSubs();
  const known = new Set(existing.map((s) => String(s.name).toLowerCase().trim()));
  const added = [];
  for (const f of found) {
    const key = String(f.name).toLowerCase().trim();
    if (!key || key === 'unknown' || known.has(key)) continue;
    known.add(key);
    added.push({ id: 'SUB-' + key.replace(/[^a-z0-9]+/g, '-').slice(0, 22) + '-' + Math.random().toString(36).slice(2, 6), name: f.name, trade, location: f.location || location, contact_name: '', contact_email: '', phone: f.phone || '', website: f.website || '', capabilities: [], past_performance: 0, quote: '', status: 'prospect', source: f.source, uei: f.uei || '', place_id: f.place_id || '', notes: f.website ? `auto-discovered — get email from ${f.website}` : 'auto-discovered — add a contact email to reach out', last_contacted: null });
  }
  if (added.length) saveSubs([...existing, ...added]);

  const notes = [places.skipped && `Places ${places.skipped}`, places.error, sam.skipped && `SAM ${sam.skipped}`, sam.error].filter(Boolean);
  await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'subs.discovered', rationale: `Discovered ${added.length} new ${trade} candidate(s) near ${location || state}${notes.length ? ' (' + notes.join('; ') + ')' : ''}`, payload: { trade, location, added: added.map((a) => a.name) } });
  await mirror('CONNECT-01', added.length ? 'need' : 'idle', added.length ? `Found ${added.length} ${trade} candidate(s) — added to the CRM (add emails to reach out)` : `No new ${trade} candidates${notes.length ? ' — ' + notes.join('; ') : ''}`);

  // Optionally chase down a contact email for each new row right away (the natural "find subs" flow).
  let enriched = null;
  if (added.length && enrich) {
    try { const { enrichSubs } = await import('./enrich.mjs'); enriched = await enrichSubs({ ids: added.map((a) => a.id) }); }
    catch { /* enrichment is best-effort; rows still land in the CRM */ }
  }
  return { added: added.length, names: added.map((a) => a.name), notes, enriched };
}

if (process.argv[1] && process.argv[1].endsWith('discover.mjs')) {
  const args = process.argv.slice(2).filter((a) => a !== '--enrich');
  const enrich = process.argv.includes('--enrich');
  const trade = args[0] || 'janitorial';
  const location = args.slice(1).join(' ') || 'Wilkes-Barre, PA';
  discoverSubs({ trade, location, enrich }).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
