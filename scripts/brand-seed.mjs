// brand-seed.mjs — seed the features table from his own published posts.
//
// The step the Rogoff teardown says everyone misses: his first analysis returned nothing because the
// loop had no history. There are 897 posts in the vault with real engagement attached, so the table
// has a baseline before the first new post rather than after.
//
// EVERY ROW IS LABELLED, and that is the whole point of this script rather than a one-liner.
// Running the guard across the archive turned up something that changes how this data may be used:
//
//   · 403 of 897 posts are from 2023, his Twitter-growth-agency era
//   · only 23 posts are on his CURRENT domain, publishable, and not a quote
//   · his top-reach posts are income and traction claims that are now blocked
//
// So the corpus is real but it is largely a record of a different business sold to a different
// audience. A features table built from it silently answers "what worked?" with "Twitter growth
// content in 2023". Labelling each row with era, domain and compliance verdict lets the loop ask the
// honest question instead — did anything on-domain ever work — and get an honest answer.
//
// Writes JSONL, one file per year, matching actions/ focus/ and tax-ledger/. Append-only.
//
//   node scripts/brand-seed.mjs            # report only, writes nothing
//   node scripts/brand-seed.mjs --write

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArchive, engagement, isQuotePost, isThin, summary } from '../pods/brand/archive.mjs';
import { extract } from '../pods/brand/features.mjs';
import { complianceCheck } from '../pods/brand/compliance.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function vaultDir() {
  if (process.env.VAULT_DIR) return process.env.VAULT_DIR;
  try {
    const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^VAULT_DIR=(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  return path.join(os.homedir(), 'Documents', 'Second Brain');
}

const ARCHIVE = path.join(vaultDir(), '06 - Journals',
  'Transcribed (Voice • Handwritten • Journals)', 'X Archive (own posts).md');

// His current subject matter. Deliberately generous — the point is to find out how little of the
// archive is on-topic, so a loose filter makes the finding harder to argue with, not easier.
const DOMAIN = /real estate|propert|tenant|rental|landlord|mortgage|cap rate|closing|escrow|apprais|underwrit|\bdeal\b|\bbid\b|proposal|contract|govern|section 8|\bhud\b|janitor/i;

// The eras are his, not invented: the archive's own shape. 2023 is the agency year.
function era(date) {
  const y = Number(String(date).slice(0, 4));
  if (y <= 2021) return 'early';
  if (y === 2022 || y === 2023) return 'agency';
  return 'current';
}

function main() {
  const write = process.argv.includes('--write');
  let md;
  try { md = fs.readFileSync(ARCHIVE, 'utf8'); }
  catch { console.error('archive not found:\n  ' + ARCHIVE); process.exit(1); }

  const posts = parseArchive(md);
  const s = summary(posts);

  const rows = posts.map((p) => {
    const c = complianceCheck(p.text);
    return {
      id: 'x-' + p.date + '-' + Math.abs(hash(p.text)).toString(36).slice(0, 6),
      source: 'x-archive',
      date: p.date,
      era: era(p.date),
      on_domain: DOMAIN.test(p.text),
      is_quote: isQuotePost(p.text),
      is_thin: isThin(p.text),
      // Would this post clear the guard if he published it TODAY? Stored per row so the loop can
      // exclude the class of post he can no longer write, instead of learning from it.
      publishable_today: c.ok,
      compliance_blocks: c.blocks.map((b) => b.why),
      ...extract(p.text),
      // Real outcomes, eight years of them. impressions and comments were never exported, so they
      // are null and stay null — never zero.
      reactions: p.likes,
      shares: p.retweets,
      impressions: null,
      comments: null,
      // audience is THE missing piece: the archive has counts, not commenters. features.score()
      // returns null without it, which is the correct answer until the classifier runs.
      audience: null,
    };
  });

  const usable = rows.filter((r) => r.publishable_today && r.on_domain && !r.is_quote && !r.is_thin);
  const byEra = rows.reduce((a, r) => { a[r.era] = (a[r.era] || 0) + 1; return a; }, {});

  console.log('ARCHIVE      ' + s.posts + ' posts · ' + s.first + ' → ' + s.last);
  console.log('BY ERA       ' + JSON.stringify(byEra));
  console.log('ON DOMAIN    ' + rows.filter((r) => r.on_domain).length);
  console.log('QUOTES/THIN  ' + rows.filter((r) => r.is_quote || r.is_thin).length);
  console.log('BLOCKED NOW  ' + rows.filter((r) => !r.publishable_today).length);
  console.log('');
  console.log('USABLE AS EXEMPLARS (on-domain, publishable, his own words): ' + usable.length);
  console.log('  ' + (usable.length < 30
    ? '⚠ too few to build examples/ from. See the note in the PRD revision — the archive is\n'
      + '    largely a record of a different business. Exemplars should come from new writing.'
    : 'enough to seed examples/'));
  console.log('');
  console.log('OUTCOMES     reactions+retweets on every row; impressions/comments null (never exported)');
  console.log('AUDIENCE     null on every row — the archive holds counts, not commenters.');
  console.log('             features.score() returns null until the classifier runs. That is correct.');

  if (!write) { console.log('\n(report only — pass --write to persist)'); return; }

  const dir = path.join(ROOT, 'brand-features');
  fs.mkdirSync(dir, { recursive: true });
  const years = {};
  for (const r of rows) (years[r.date.slice(0, 4)] ||= []).push(r);
  for (const [y, list] of Object.entries(years)) {
    fs.writeFileSync(path.join(dir, y + '.jsonl'), list.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
  console.log('\nwrote ' + rows.length + ' rows across ' + Object.keys(years).length + ' files → brand-features/');
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return h;
}

main();
