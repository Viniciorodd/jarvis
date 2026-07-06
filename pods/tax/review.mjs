// Review queue — list what needs the operator's eye, and turn one decision into append-only resolution
// deltas (never a mutation). Jarvis never files/pays; the operator resolves. PURE.
import { resolveLedger, makeResolution, validCategory } from './ledger.mjs';

export function listPending(records) {
  return resolveLedger(records).filter((e) => e.status === 'needs_review')
    .map((e) => ({ hash: e.hash, cents: e.cents, dateISO: e.dateISO, payee: e.payee, entity: e.entity,
      category: e.category, reviewKind: e.reviewKind || null, dupOf: e.dupOf || null }));
}

// decision: { type:'accept'|'recategorize'|'merge'|'keep-both'|'reject', entity?, category? }
export function resolve(entry, decision) {
  const d = decision || {};
  if (d.type === 'recategorize' && d.category && !validCategory(d.category)) return { error: `bad category ${d.category}` };
  const res = [];
  const confirm = () => makeResolution({ target: entry.hash, action: 'confirm', dateISO: entry.dateISO });
  if (d.type === 'accept' || d.type === 'keep-both') res.push(confirm());
  else if (d.type === 'recategorize') res.push(makeResolution({ target: entry.hash, action: 'recategorize', entity: d.entity, category: d.category, dateISO: entry.dateISO }));
  else if (d.type === 'merge') { res.push(confirm()); if (entry.dupOf) res.push(makeResolution({ target: entry.dupOf, action: 'void', dateISO: entry.dateISO })); }
  else if (d.type === 'reject') res.push(makeResolution({ target: entry.hash, action: 'void', dateISO: entry.dateISO }));
  else return { error: `unknown decision ${d.type}` };
  return { resolutions: res };
}
