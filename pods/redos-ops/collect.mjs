// collect.mjs — run every source, write one dated snapshot. Never overwrites history.
//
// PRD §5. The contract every source keeps: `fetch() -> { ok, data, fetchedAt, error }`, and it never
// throws. One dead API cannot take the page down — that tile goes amber and the rest still renders.
//
// This is the only place in the pod that touches the network, and it only ever reads.
//
//   node pods/redos-ops/collect.mjs           # report, writes nothing
//   node pods/redos-ops/collect.mjs --write   # append a snapshot

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptySnapshot, withSource, write } from './store.mjs';
import { customers, revenue, digest, isStale, health } from './metrics.mjs';
import { gateLine } from './gates.mjs';
import * as gumroad from './sources/gumroad.mjs';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

function envFile() {
  const out = { ...process.env };
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !out[m[1]]) out[m[1]] = m[2].trim();
    }
  } catch { /* env-only is fine */ }
  return out;
}

// Registered sources. Phase 1 is Gumroad alone; the rest of the PRD's list slots in here with no
// change to the shape, because each one keeps the same contract.
const SOURCES = {
  gumroad: (env) => gumroad.fetchSource({ token: env.GUMROAD_ACCESS_TOKEN }),
  // supabase, posthog, search-console, beehiiv, brand, outreach — phases 2 to 4.
};

export async function collect({ env = envFile(), at = new Date().toISOString() } = {}) {
  let snap = emptySnapshot(at);
  for (const [name, run] of Object.entries(SOURCES)) {
    let result;
    // A source that throws despite the contract is caught here rather than killing the run.
    try { result = await run(env); }
    catch (e) { result = { ok: false, data: null, fetchedAt: at, error: 'source threw: ' + e.message }; }
    snap = withSource(snap, name, result);
  }
  return snap;
}

async function main() {
  const shouldWrite = process.argv.includes('--write');
  const snap = await collect();
  const now = snap.at;

  const c = customers(snap);
  const r = revenue(snap);
  const usd = (v) => (v === null ? 'unknown' : '$' + v.toFixed(2));

  console.log('SNAPSHOT ' + snap.at);
  console.log('');
  for (const h of health(snap)) {
    console.log('  ' + (h.state === 'live' ? '🟢' : '🟠') + ' ' + h.name.padEnd(10) + h.state
      + (h.error ? ' — ' + h.error : '') + (h.fetchedAt ? '  @' + h.fetchedAt.slice(11, 19) : ''));
  }
  console.log('');
  console.log('  NON-FRIEND CUSTOMERS  ' + (c.nonFriend === null ? 'unknown' : c.nonFriend)
    + (c.unknown ? '   (' + c.unknown + ' unclassified)' : ''));
  console.log('  gross                 ' + usd(r.grossUsd));
  console.log('  net                   ' + usd(r.netUsd) + '   [' + r.netDefinition + ']');
  console.log('  refunds               ' + usd(r.refundsUsd));
  console.log('  by tier               ' + JSON.stringify(r.byTier));
  console.log('');
  console.log('  ' + gateLine(snap));
  const st = isStale(snap, now);
  if (st.stale) console.log('  ⚠ ' + st.why);
  console.log('');
  console.log(digest(snap, now).join('\n'));

  if (!shouldWrite) { console.log('\n(report only — pass --write to append a snapshot)'); return; }
  const w = write(snap);
  console.log('\nappended snapshot ' + w.at);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
  || process.argv[1].endsWith('collect.mjs')) main();
