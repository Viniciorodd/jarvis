// Tax document indexer — turn scattered files into a manifest organized by property/entity/kind, and
// rank likely receipts for a ledger entry. PURE core (this section) + a thin fs walk wrapper (below).
// READ-ONLY on the filesystem: name + stat only, never opens/moves/deletes/uploads a file (doctrine §2/§4).

const KIND_RULES = [
  [/receipt|invoice|order[_ ]?conf|order[_ ]?ack|purchase/i, 'receipt'],
  [/\bhud\b|alta|settlement/i, 'hud'],
  [/contract|agreement|\bpsa\b|assignment/i, 'contract'],
  [/policy|insurance|\beoi\b|coverage|\bdp3\b/i, 'insurance'],
  [/appraisal|valuation|\bcma\b|comparative[_ ]?market/i, 'appraisal'],
  [/permit/i, 'permit'],
  [/statement|1099|bank|liquidity/i, 'statement'],
  [/deed|title|owner[_ ]?policy/i, 'closing'],
];
export function classifyDoc(name, folderPath, registry) {
  const n = String(name || '');
  let kind = 'other';
  for (const [re, k] of KIND_RULES) if (re.test(n)) { kind = k; break; }
  const hay = String(folderPath || '').toLowerCase().replace(/\\/g, '/');
  let property = null, entity = null;
  for (const p of registry.properties || []) {
    const needles = [String(p.address || ''), ...(p.aliases || [])].map((s) => String(s).toLowerCase()).filter(Boolean);
    // match on the full address OR an alias that is specific enough (>=3 chars) to avoid false hits
    if (needles.some((s) => (s.length >= 3 || /^\d+$/.test(s)) && hay.includes(s))) { property = p.id; entity = p.entity; break; }
  }
  if (!entity) {
    if (/gov[-_ ]?draft|\bgov\b|rodgate|sam\b/i.test(hay)) entity = 'rodgate';
    else if (/fiverr|studio/i.test(hay)) entity = 'sidehustles';
  }
  return { kind, property, entity };
}

export function buildIndex(walkResult, registry) {
  return (walkResult || []).map((f) => {
    const c = classifyDoc(f.name, f.folder, registry);
    return { path: f.path, name: f.name, folder: f.folder, kind: c.kind, property: c.property,
      entity: c.entity, mtimeMs: f.mtimeMs || 0, sizeBytes: f.sizeBytes || 0 };
  });
}

const DAY = 86400000;
export function suggestDocs(entry, index, { withinDays = 30, limit = 5 } = {}) {
  if (!entry || !Array.isArray(index) || !index.length) return [];
  const amt = Number(entry.cents) > 0 ? (entry.cents / 100).toFixed(2) : null;
  const payeeTokens = String(entry.payee || '').toLowerCase().split(/\W+/).filter((t) => t.length >= 3);
  const entryMs = Date.parse(String(entry.dateISO || '') + 'T00:00:00Z');
  const scored = index.map((d) => {
    let score = 0;
    const nl = String(d.name || '').toLowerCase();
    if (entry.property && d.property === entry.property) score += 5;
    else if (entry.entity && d.entity === entry.entity) score += 3;
    else if (entry.entity && d.entity && d.entity !== entry.entity) score -= 2;
    if (payeeTokens.some((t) => nl.includes(t))) score += 3;
    if (amt && nl.includes(amt)) score += 4;
    if (Number.isFinite(entryMs) && d.mtimeMs && Math.abs(d.mtimeMs - entryMs) <= withinDays * DAY) score += 2;
    if (d.kind === 'receipt') score += 1;
    return { path: d.path, name: d.name, kind: d.kind, score };
  }).filter((d) => d.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
