// SAM EXCLUSIONS check (Hector / CONNECT-01) — the "Stage 3 exclusion gate" from the GovCon Master
// Reference. FAR forbids awarding a subcontract to a party that is DEBARRED / SUSPENDED / EXCLUDED, and
// SAM's Exclusions list is a SEPARATE dataset from Entity Registration: a sub can be actively registered
// (passes discover.mjs) yet still be excluded. Bidding with an excluded sub = disqualification + False
// Claims Act exposure. So before Hector raises an outreach/send gate for a sub, we check this list.
//
// Endpoint targeted: SAM Exclusions API — https://api.sam.gov/entity-information/v4/exclusions
//   (same api.sam.gov base + the vault-scoped SAM_API_KEY the discover pod already uses). We query by
//   ueiSAM when the sub has one (exact), else by exclusionName. The response shape has drifted across
//   SAM versions (excludedParties / excludationsData / exclusionData / results, and per-record fields are
//   sometimes flat, sometimes nested under exclusionDetails / exclusionIdentification / exclusionActions),
//   so parseExclusions is DEFENSIVE across shapes and — critically — re-matches every returned record
//   against the sub itself, so even a too-broad API response can't produce a false "clear" or false hit.
//
// Design (doctrine §11): parseExclusions is PURE + eval-pinned (fixture JSON, no network). checkSubExclusion
// is best-effort — it NEVER throws, degrades to { unverified:true } when there's no key / the API is down,
// so the caller can HARD-GATE on "unverified" instead of silently assuming the sub is clear.
//
// CLI: node pods/gov/exclusions.mjs "<sub name>"

import { secret } from './lib.mjs';

// PURE: collapse a business/person name for comparison — lowercase, punctuation + whitespace → single
// spaces. Case/space/punct-insensitive per the match spec (we deliberately DON'T strip LLC/Inc etc. — that
// would over-match distinct entities; the contains-rule below handles a "…LLC" vs bare-name difference).
export function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// PURE: does a sub's name match an exclusion record's name? Exact normalized equality, OR a STRONG
// contains-match (one legal/DBA name fully contains the other) with a length guard so a tiny token can't
// trigger a false hit. Used only when the sub has no UEI to match on.
export function nameMatches(subName, recName) {
  const a = normName(subName), b = normName(recName);
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 5 && (long === short || long.includes(short + ' ') || long.includes(' ' + short) || long.startsWith(short + ' ') || long.endsWith(' ' + short) || long.includes(short));
}

function firstDefined(...vals) { for (const v of vals) if (v !== undefined && v !== null && v !== '') return v; return undefined; }

// Pull the array of exclusion records out of whatever shape the API returned (defensive across versions).
function recordsOf(apiJson) {
  if (!apiJson) return [];
  if (Array.isArray(apiJson)) return apiJson;
  if (typeof apiJson !== 'object') return [];
  for (const k of ['excludedParties', 'excludationsData', 'exclusionData', 'exclusionDetails', 'results', 'entityData', 'records', 'data']) {
    if (Array.isArray(apiJson[k])) return apiJson[k];
  }
  if (apiJson._embedded && Array.isArray(apiJson._embedded.results)) return apiJson._embedded.results;
  return [];
}

// Normalize one raw exclusion record (flat OR nested) into a flat shape we can reason about.
function normRecord(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const det = rec.exclusionDetails || {};
  const idn = rec.exclusionIdentification || {};
  const act = rec.exclusionActions || {};
  const a0 = (Array.isArray(act.listOfActions) && act.listOfActions[0]) || {};
  const personName = [rec.prefix, rec.firstName, rec.middleName, rec.lastName, rec.suffix].filter(Boolean).join(' ').trim();
  const name = firstDefined(rec.exclusionName, rec.name, rec.legalBusinessName, idn.exclusionName, idn.entityName, idn.legalBusinessName, det.exclusionName, personName) || '';
  const classification = firstDefined(rec.classificationType, rec.classification, idn.classificationType, det.classificationType) || '';
  const exclusionType = firstDefined(rec.exclusionType, det.exclusionType, rec.exclusionProgram, det.exclusionProgram) || '';
  const ueiSAM = firstDefined(rec.ueiSAM, rec.uei, idn.ueiSAM, idn.uei, det.ueiSAM) || '';
  const activeDate = firstDefined(rec.activateDate, rec.activeDate, a0.activateDate, a0.activeDate, rec.creationDate) || '';
  const terminationDate = firstDefined(rec.terminationDate, a0.terminationDate) || '';
  const status = firstDefined(rec.recordStatus, rec.status, (a0.recordStatus && (a0.recordStatus.status || a0.recordStatus)), (rec.recordStatus && rec.recordStatus.status)) || '';
  return { name: String(name).trim(), classification: String(classification), exclusionType: String(exclusionType), ueiSAM: String(ueiSAM).trim(), activeDate: String(activeDate), terminationDate: String(terminationDate), status: String(status) };
}

// Only ACTIVE exclusions disqualify a sub. Active = status not "inactive"/"expired" AND (no termination
// date, an "Indefinite" termination, an unparseable date [conservative → treat as active], or a
// termination date still in the FUTURE relative to `now`).
function isActive(rec, nowMs) {
  if (/inactive|expired|terminated/i.test(rec.status)) return false;
  const td = rec.terminationDate;
  if (!td || /indefinite|none|n\/?a/i.test(td)) return true;
  const t = Date.parse(td);
  if (Number.isNaN(t)) return true;
  return t > nowMs;
}

// PURE (eval-pinned): given the SAM Exclusions API JSON + the sub, return which ACTIVE exclusions match.
// Match rule: if the sub has a ueiSAM → exact UEI equality only (avoids a same-name/different-entity false
// hit). Otherwise → normalized name match. No network.
export function parseExclusions(apiJson, sub = {}) {
  const nowMs = Date.now();
  const checkedAt = new Date(nowMs).toISOString();
  const subUei = String(sub.ueiSAM || sub.uei || '').trim().toUpperCase();
  const subName = sub.name || sub.legalBusinessName || '';
  const recs = recordsOf(apiJson).map(normRecord).filter(Boolean);
  const matches = [];
  for (const r of recs) {
    if (!isActive(r, nowMs)) continue;
    const hit = subUei
      ? (r.ueiSAM && r.ueiSAM.toUpperCase() === subUei)
      : nameMatches(subName, r.name);
    if (!hit) continue;
    matches.push({ name: r.name, classification: r.classification, exclusionType: r.exclusionType, ueiSAM: r.ueiSAM || undefined, activeDate: r.activeDate || undefined, terminationDate: r.terminationDate || undefined });
  }
  const who = subName || subUei || 'sub';
  const reason = matches.length
    ? `⛔ SAM EXCLUSIONS hit for ${who}: ${matches.map((m) => `${m.name}${m.exclusionType ? ` (${m.exclusionType})` : m.classification ? ` (${m.classification})` : ''}`).join('; ')}`
    : `no active SAM exclusions matched ${who}`;
  return { excluded: matches.length > 0, matches, checkedAt, reason };
}

// Best-effort live check. NEVER throws. No key → { unverified:true } so the caller can HARD-GATE on
// "unverified" rather than assume the sub is clear. `nowIso` pins the timestamp; `apiKey` (rarely needed)
// overrides the vault lookup — pass '' to force the offline/no-key path deterministically in tests.
export async function checkSubExclusion(sub = {}, { nowIso, apiKey } = {}) {
  const now = nowIso || new Date().toISOString();
  const key = apiKey !== undefined ? apiKey : (secret('CONNECT-01', 'SAM_API_KEY') || process.env.SAM_API_KEY || '');
  if (!key) return { excluded: false, matches: [], checkedAt: now, reason: 'no SAM_API_KEY — exclusion NOT verified', unverified: true };
  const subUei = String(sub.ueiSAM || sub.uei || '').trim();
  const subName = sub.name || sub.legalBusinessName || '';
  try {
    const u = new URL('https://api.sam.gov/entity-information/v4/exclusions');
    u.searchParams.set('api_key', key);
    if (subUei) u.searchParams.set('ueiSAM', subUei);
    else if (subName) u.searchParams.set('exclusionName', subName);
    const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { excluded: false, matches: [], checkedAt: now, reason: `SAM exclusions API ${r.status} — NOT verified`, unverified: true };
    const d = await r.json();
    const parsed = parseExclusions(d, sub);
    return { excluded: parsed.excluded, matches: parsed.matches, checkedAt: now, reason: parsed.reason };
  } catch (e) {
    return { excluded: false, matches: [], checkedAt: now, reason: `exclusion check error: ${e.message} — NOT verified`, unverified: true };
  }
}

if (process.argv[1] && process.argv[1].endsWith('exclusions.mjs')) {
  const name = process.argv.slice(2).join(' ').trim();
  if (!name) { console.error('usage: node pods/gov/exclusions.mjs "<sub name>"'); process.exit(1); }
  checkSubExclusion({ name }).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
