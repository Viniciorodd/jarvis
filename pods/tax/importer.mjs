// CSV import pure core — parse rows via the account's columnMap, dedup against the existing ledger
// (exact hash + cross-source cents/±3-day), and hand back prepared rows for classification (Task 3).
// No I/O here; the fs wrapper (importInbox) lives below and is not eval-tested.

import { applyMap } from './accounts.mjs';
import { entryHash } from './ledger.mjs';

const DAY = 86400000;
const daysBetween = (a, b) => Math.abs((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY);

// direction 'in' → an income entry; 'out' → an expense. payee comes from descCol.
export function classifyDedup({ rows, account, existingEntries = [], todayISO }) {
  const map = account.columnMap || {};
  const prepared = [], failedRows = []; let deduped = 0;
  const existingHashes = new Set(existingEntries.filter((e) => e && e.hash).map((e) => e.hash));
  for (const row of rows) {
    const parsed = applyMap(row, map);
    if (parsed.error) { failedRows.push({ row, error: parsed.error }); continue; }
    const payee = String(row[map.descCol] ?? '').trim().slice(0, 120) || 'unknown';
    const entity = account.defaultEntity;
    const h = entryHash({ dateISO: parsed.dateISO, cents: parsed.cents, payee, entity });
    if (existingHashes.has(h)) { deduped += 1; continue; }        // exact re-drop
    const item = { dateISO: parsed.dateISO, cents: parsed.cents, direction: parsed.direction,
      payee, entity, status: 'confirmed' };
    const dup = existingEntries.find((e) => e && e.cents === parsed.cents && e.status !== 'void'
      && daysBetween(e.dateISO, parsed.dateISO) <= 3);
    if (dup) { item.status = 'needs_review'; item.reviewKind = 'suspected-dup'; item.dupOf = dup.hash; }
    prepared.push(item);
  }
  return { prepared, failedRows, deduped };
}
