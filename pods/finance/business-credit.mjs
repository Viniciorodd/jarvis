// business-credit.mjs — Victor/CFO's "business-credit & lendability" tracker (the operator's #1
// forgotten idea: the "Rodgate business-credit journey"). This is the map from NO business credit to a
// LENDABLE Rodgate LLC: EIN-based trade lines, business-credit snapshots (D&B PAYDEX / Experian Biz /
// Equifax Biz / Nav), the foundational registrations (EIN → D-U-N-S → business bank account →
// address/phone consistency), and a living "lendability packet" — so financing bigger gov contracts
// becomes possible. It is EIN-based and INDEPENDENT of personal credit/CAIVRS, so it is safe to build now.
//
// ⚠ This pod NEVER files, applies, sends, or spends. It is a TRACKER + read-only status. Every claim
// carries a VERIFICATION flag: a trade line's `reportingVerified` and a snapshot's `sourceRef` are the
// discipline — a "reports to D&B" or a "PAYDEX 80" claim that isn't sourced is surfaced as
// needsVerification, never asserted as fact (doctrine §1: code disposes; §4: untrusted until confirmed).
//
// Machine ledgers (append-only JSONL, gitignored; { dir } override on every IO fn so tests never touch
// real data — mirrors pods/idea-vault.mjs exactly): finance-credit/tradelines.jsonl and
// finance-credit/snapshots.jsonl fold by id, latest full-state line wins. foundation.json is a single
// merged object (read/merge/write, not a ledger). The debt schedule is NOT duplicated — loadDebts reads
// the existing pods/tax/debts.json so the packet's "debt disclosed" item reflects the real, single source.
// PURE logic (tradelineHealth / foundationGaps / lendabilityChecklist / businessCreditStatus /
// latestScorePerSource) is eval-pinned. CLI: `node pods/finance/business-credit.mjs status`.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_DIR = path.join(ROOT, 'finance-credit');
const DEFAULT_DEBTS_FILE = path.join(ROOT, 'pods', 'tax', 'debts.json');

const tradelinesFile = (dir) => path.join(dir, 'tradelines.jsonl');
const snapshotsFile = (dir) => path.join(dir, 'snapshots.jsonl');
const foundationFile = (dir) => path.join(dir, 'foundation.json');

export const TRADELINE_STATUSES = ['active', 'closed', 'applied'];
export const DUNS_STATUSES = ['none', 'pending', 'obtained'];
export const MIN_REPORTING_TRADELINES = 3; // the packet's threshold for "enough reporting trade lines"

export const DEFAULT_FOUNDATION = {
  ein: '', einConfirmed: false, duns: '', dunsStatus: 'none',
  businessBankAccount: false, addressPhoneConsistent: null, notes: '',
};

// The financing reality, baked into code so no agent invents it. Business/AR paths are open regardless of
// personal credit/CAIVRS; SBA-backed paths need a CAIVRS check FIRST — and the EIDL is CURRENT (paying,
// not charged off), so we DO NOT assert SBA is closed. This string is eval-pinned (must mention CAIVRS,
// must NOT claim SBA financing is closed).
export const FINANCING_NOTE =
  'Business/AR-based financing is open regardless of personal credit or CAIVRS: EIN net-30 trade credit '
  + '(Uline/Quill/Grainger) and invoice factoring on federal receivables build lendability now. '
  + 'SBA-backed paths (7(a), CAPLines, surety-bond guarantee) require a CAIVRS check FIRST — the $20k COVID '
  + 'EIDL is CURRENT and paying (not charged off), so SBA financing may NOT be closed. Confirm CAIVRS before '
  + 'assuming any SBA door is shut; do not treat SBA as unavailable without that check.';

const normVendor = (v) => String(v || '').trim().toLowerCase();

// ── ledger IO (append-only; { dir } override so tests never touch the real ledger) ──────────────────
function appendLine(file, obj, dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}

// Read a JSONL ledger and fold by id — the LATEST full-state line for each id wins (mirrors idea-vault).
function readLedger(file) {
  let raw; try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const byId = new Map();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o && o.id) byId.set(o.id, o); } catch { /* skip bad line */ }
  }
  return Array.from(byId.values());
}

export function readTradelines({ dir = DEFAULT_DIR } = {}) { return readLedger(tradelinesFile(dir)); }
export function readSnapshots({ dir = DEFAULT_DIR } = {}) { return readLedger(snapshotsFile(dir)); }

// Add a trade line. New lines default to 'applied' (safest honest state — not yet a live reporting line).
export function addTradeline(fields = {}, { dir = DEFAULT_DIR } = {}) {
  const vendor = String(fields.vendor || '').trim();
  if (!vendor) return { ok: false, error: 'vendor required' };
  const now = new Date().toISOString();
  const reportsTo = Array.isArray(fields.reportsTo) ? fields.reportsTo.filter(Boolean)
    : (fields.reportsTo ? [fields.reportsTo] : []);
  const tl = {
    id: fields.id || crypto.randomBytes(4).toString('hex'),
    ts: fields.ts || now,
    vendor,
    accountType: String(fields.accountType || ''),
    terms: String(fields.terms || ''),
    reportsTo,
    reportingVerified: fields.reportingVerified === true, // false = assumed, not confirmed (verification discipline)
    opened: fields.opened || '',
    status: TRADELINE_STATUSES.includes(fields.status) ? fields.status : 'applied',
    creditLimitCents: Number.isFinite(fields.creditLimitCents) ? fields.creditLimitCents : 0,
    payments: Array.isArray(fields.payments) ? fields.payments : [],
    source: fields.source || 'manual',
  };
  try { appendLine(tradelinesFile(dir), tl, dir); } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, tradeline: tl };
}

// Append a payment to a trade line — fold to current state, add the payment, re-append the full state.
export function addPayment(tradelineId, payment = {}, { dir = DEFAULT_DIR } = {}) {
  const cur = readTradelines({ dir }).find((t) => t.id === tradelineId);
  if (!cur) return { ok: false, error: `no trade line matching "${tradelineId}"` };
  const p = {
    date: payment.date || new Date().toISOString().slice(0, 10),
    onTime: payment.onTime !== false, // default on-time unless explicitly false
    note: String(payment.note || ''),
  };
  const next = { ...cur, payments: [...(Array.isArray(cur.payments) ? cur.payments : []), p], ts: new Date().toISOString() };
  try { appendLine(tradelinesFile(dir), next, dir); } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, tradeline: next };
}

// Add a business-credit snapshot. A snapshot WITHOUT a sourceRef is kept but flagged unverified — the
// claim doesn't count toward the packet until a source (where it was pulled) backs it.
export function addSnapshot(fields = {}, { dir = DEFAULT_DIR } = {}) {
  const source = String(fields.source || '').trim();
  if (!source) return { ok: false, error: 'source required' };
  const now = new Date().toISOString();
  const sourceRef = String(fields.sourceRef || '').trim();
  const score = fields.score == null || fields.score === '' ? null : Number(fields.score);
  const snap = {
    id: fields.id || crypto.randomBytes(4).toString('hex'),
    ts: fields.ts || now,
    source,
    pulledDate: fields.pulledDate || now.slice(0, 10),
    score: Number.isFinite(score) ? score : null,
    rating: String(fields.rating || ''),
    sourceRef,
    verified: !!sourceRef,
  };
  try { appendLine(snapshotsFile(dir), snap, dir); } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, snapshot: snap, unverified: !sourceRef };
}

// foundation.json — single merged object (read → merge patch → write). Never a ledger.
export function readFoundation({ dir = DEFAULT_DIR } = {}) {
  let raw; try { raw = fs.readFileSync(foundationFile(dir), 'utf8'); } catch { return { ...DEFAULT_FOUNDATION }; }
  try { return { ...DEFAULT_FOUNDATION, ...JSON.parse(raw) }; } catch { return { ...DEFAULT_FOUNDATION }; }
}

export function saveFoundation(patch = {}, { dir = DEFAULT_DIR } = {}) {
  const cur = readFoundation({ dir });
  const next = { ...cur, ...patch };
  if (!DUNS_STATUSES.includes(next.dunsStatus)) next.dunsStatus = cur.dunsStatus; // guard bad status
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(foundationFile(dir), JSON.stringify(next, null, 2)); }
  catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, foundation: next };
}

// Read the REAL debt schedule (pods/tax/debts.json) — best-effort; [] if absent. We do NOT duplicate it.
export function loadDebts({ file = DEFAULT_DEBTS_FILE } = {}) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(j.debts) ? j.debts : []; }
  catch { return []; }
}

// ── PURE, EVAL-PINNED logic ──────────────────────────────────────────────────────────────────────────

// Health of one trade line: on-time %, payment count, the next concern, and the reporting confidence.
// reporting: 'verified' (reportingVerified true) | 'assumed' (claims a bureau but unverified) | 'no' (none).
export function tradelineHealth(tl = {}, nowIso = new Date().toISOString()) {
  void nowIso;
  const payments = Array.isArray(tl.payments) ? tl.payments : [];
  const totalPayments = payments.length;
  const onTime = payments.filter((p) => p && p.onTime !== false).length;
  const onTimePct = totalPayments ? Math.round((onTime / totalPayments) * 100) : null;
  const reportsTo = Array.isArray(tl.reportsTo) ? tl.reportsTo : [];
  const reporting = tl.reportingVerified === true ? 'verified' : (reportsTo.length ? 'assumed' : 'no');
  let nextConcern = null;
  if (tl.status === 'applied') nextConcern = 'application pending — not yet a live, reporting line';
  else if (reporting === 'no') nextConcern = 'no known reporting — this line may not build business credit';
  else if (reporting === 'assumed') nextConcern = 'reporting assumed but unverified — confirm it actually reports';
  else if (onTimePct != null && onTimePct < 100) nextConcern = 'late payment(s) on record — protect on-time history';
  else if (totalPayments === 0) nextConcern = 'no payment history yet — make on-time payments to build it';
  return { onTimePct, totalPayments, onTime, nextConcern, reporting };
}

// The foundational gaps — the registrations that must exist before a profile is even credible.
export function foundationGaps(foundation = {}) {
  const f = { ...DEFAULT_FOUNDATION, ...foundation };
  const gaps = [];
  if (!f.einConfirmed) gaps.push({ item: 'EIN', status: 'unconfirmed', why: 'EIN is not confirmed on file — the anchor of the whole business-credit profile' });
  if (f.dunsStatus !== 'obtained') gaps.push({ item: 'D-U-N-S number', status: f.dunsStatus || 'none', why: 'No D-U-N-S from Dun & Bradstreet yet — required for a D&B PAYDEX and most net-30 reporting' });
  if (!f.businessBankAccount) gaps.push({ item: 'Business bank account', status: 'missing', why: 'No dedicated business checking — lenders and trade vendors expect a separate business account' });
  if (f.addressPhoneConsistent === false) gaps.push({ item: 'Address/phone consistency', status: 'inconsistent', why: 'Business address/phone do not match across records — inconsistency stalls D&B and lender verification' });
  else if (f.addressPhoneConsistent == null) gaps.push({ item: 'Address/phone consistency', status: 'unknown', why: 'Address/phone consistency across SAM/D&B/bank/listings not yet verified' });
  return gaps;
}

// Fold snapshots to the LATEST score per source (by pulledDate, then ts). Each carries its verified flag.
export function latestScorePerSource(snapshots = []) {
  const by = new Map();
  const stamp = (s) => `${s.pulledDate || ''}|${s.ts || ''}`;
  for (const s of (Array.isArray(snapshots) ? snapshots : [])) {
    if (!s || !s.source) continue;
    const cur = by.get(s.source);
    if (!cur || stamp(s) >= stamp(cur)) by.set(s.source, s);
  }
  const out = {};
  for (const [k, s] of by) out[k] = {
    score: s.score == null ? null : s.score, rating: s.rating || '',
    pulledDate: s.pulledDate || (s.ts || '').slice(0, 10), verified: !!s.sourceRef, sourceRef: s.sourceRef || '',
  };
  return out;
}

// The living lendability packet, as a checklist. readinessPct = have/total (deterministic).
export function lendabilityChecklist(state = {}, nowIso = new Date().toISOString(), { minReportingTradelines = MIN_REPORTING_TRADELINES } = {}) {
  const tradelines = Array.isArray(state.tradelines) ? state.tradelines : [];
  const snapshots = Array.isArray(state.snapshots) ? state.snapshots : [];
  const debts = Array.isArray(state.debts) ? state.debts : [];
  const f = { ...DEFAULT_FOUNDATION, ...(state.foundation || {}) };
  const reportingCount = tradelines.filter((t) => tradelineHealth(t, nowIso).reporting === 'verified').length;
  const hasVerifiedScore = snapshots.some((s) => s && s.sourceRef && s.score != null);
  const items = [
    { key: 'entity-ein', have: !!f.einConfirmed, detail: f.einConfirmed ? 'entity docs + EIN confirmed on file' : 'EIN not yet confirmed' },
    { key: 'duns', have: f.dunsStatus === 'obtained', detail: `D-U-N-S: ${f.dunsStatus}` },
    { key: 'reporting-tradelines', have: reportingCount >= minReportingTradelines, detail: `${reportingCount}/${minReportingTradelines} verified reporting trade lines` },
    { key: 'business-credit-score', have: hasVerifiedScore, detail: hasVerifiedScore ? 'a sourced business-credit score on file' : 'no sourced business-credit score yet' },
    { key: 'business-bank-account', have: !!f.businessBankAccount, detail: f.businessBankAccount ? 'dedicated business bank account' : 'no dedicated business bank account confirmed' },
    { key: 'debt-schedule', have: debts.length > 0, detail: debts.length ? `debt schedule disclosed (${debts.length} accounts, incl. SBA EIDL)` : 'debt schedule not disclosed' },
    { key: 'gov-past-performance', have: false, detail: 'gov past-performance / CPARS: none yet (stub)' },
  ];
  const have = items.filter((i) => i.have).length;
  return { items, have, total: items.length, readinessPct: Math.round((have / items.length) * 100) };
}

// The ONE summary Victor/Home read: latest score per source, reporting count, foundation gaps, readiness,
// the CAIVRS-aware financingNote, and every UNVERIFIED claim surfaced as needsVerification.
export function businessCreditStatus(state = {}, nowIso = new Date().toISOString()) {
  const tradelines = Array.isArray(state.tradelines) ? state.tradelines : [];
  const snapshots = Array.isArray(state.snapshots) ? state.snapshots : [];
  const debts = Array.isArray(state.debts) ? state.debts : [];
  const foundation = { ...DEFAULT_FOUNDATION, ...(state.foundation || {}) };
  const health = tradelines.map((t) => ({ id: t.id, vendor: t.vendor, status: t.status, ...tradelineHealth(t, nowIso) }));
  const reportingTradelines = health.filter((h) => h.reporting === 'verified').length;
  const checklist = lendabilityChecklist({ tradelines, snapshots, foundation, debts }, nowIso);
  const needsVerification = [];
  for (const t of tradelines) {
    const reportsTo = Array.isArray(t.reportsTo) ? t.reportsTo : [];
    if (reportsTo.length && t.reportingVerified !== true)
      needsVerification.push({ type: 'tradeline', id: t.id, vendor: t.vendor, why: `claims it reports to ${reportsTo.join(', ')} but reporting is not verified` });
  }
  for (const s of snapshots) {
    if (!s.sourceRef) needsVerification.push({ type: 'snapshot', id: s.id, source: s.source, why: 'score has no sourceRef — cannot be treated as verified' });
  }
  return {
    latestScorePerSource: latestScorePerSource(snapshots),
    reportingTradelines,
    tradelineCount: tradelines.length,
    tradelineHealth: health,
    foundationGaps: foundationGaps(foundation),
    readinessPct: checklist.readinessPct,
    lendability: checklist,
    needsVerification,
    financingNote: FINANCING_NOTE,
    foundation,
  };
}

// ── seed: the HONEST starting state (committed, generic — real values captured via routes). Rodgate has an
// EIN + SAM registration but no D-U-N-S, no reporting trade lines, no confirmed business bank account yet.
// Idempotent: foundation only seeded if none on file; trade lines idempotent by vendor name. ─────────────
export const SEED_FOUNDATION = {
  ein: '', einConfirmed: true, duns: '', dunsStatus: 'none',
  businessBankAccount: false, addressPhoneConsistent: null,
  notes: 'Rodgate LLC: EIN obtained + SAM registered. No D-U-N-S, no reporting trade lines, no dedicated '
    + 'business bank account confirmed yet — this is the honest START of the business-credit journey.',
};
export const SEED_TRADELINES = []; // zero trade lines yet — the foundation gaps are the real starting picture

export function seedIfEmpty({ dir = DEFAULT_DIR, foundation = SEED_FOUNDATION, tradelines = SEED_TRADELINES } = {}) {
  let foundationSeeded = false;
  if (!fs.existsSync(foundationFile(dir))) { saveFoundation(foundation, { dir }); foundationSeeded = true; }
  const have = new Set(readTradelines({ dir }).map((t) => normVendor(t.vendor)));
  let added = 0, skipped = 0;
  for (const t of (Array.isArray(tradelines) ? tradelines : [])) {
    if (!t || !t.vendor || have.has(normVendor(t.vendor))) { skipped++; continue; }
    const r = addTradeline({ ...t, source: t.source || 'seed' }, { dir });
    if (r.ok) { added++; have.add(normVendor(t.vendor)); } else skipped++;
  }
  return { foundationSeeded, tradelinesAdded: added, skipped };
}

// ── CLI: node pods/finance/business-credit.mjs [status|seed] ─────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('business-credit.mjs')) {
  const [cmd] = process.argv.slice(2);
  if (!cmd || cmd === 'status') {
    const st = businessCreditStatus({
      tradelines: readTradelines({}), snapshots: readSnapshots({}),
      foundation: readFoundation({}), debts: loadDebts({}),
    });
    console.log(JSON.stringify(st, null, 2));
  } else if (cmd === 'seed') {
    console.log(JSON.stringify(seedIfEmpty({}), null, 2));
  } else {
    console.log('usage: node pods/finance/business-credit.mjs [status|seed]');
  }
}
