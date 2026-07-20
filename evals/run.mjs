// evals/run.mjs — the regression-suite runner (doctrine §11: "Evals are the #1 differentiator").
// Auto-discovers every *.eval.mjs in this folder, runs its cases, prints a report, writes
// evals/.results.json (feeds the eval_coverage / eval_drift KPIs), and exits non-zero on any failure
// so it can gate CI / a pre-commit hook. Run: `node evals/run.mjs`.
//
// An eval file default-exports: { agent: string, cases: [{ name, run: () => boolean | {pass, detail} }] }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.eval.mjs')).sort();

let totalPass = 0, totalFail = 0;
const suites = [];

for (const f of files) {
  const mod = (await import(pathToFileURL(path.join(DIR, f)).href)).default;
  if (!mod || !Array.isArray(mod.cases)) { console.error(`! ${f}: not a valid eval module`); continue; }
  const results = [];
  for (const c of mod.cases) {
    let pass = false, detail = '';
    try { const r = await c.run(); if (r && typeof r === 'object') { pass = !!r.pass; detail = r.detail || ''; } else pass = !!r; }
    catch (e) { pass = false; detail = 'threw: ' + e.message; }
    results.push({ name: c.name, pass, detail });
    pass ? totalPass++ : totalFail++;
  }
  suites.push({ agent: mod.agent, file: f, results });
}

const bar = '─'.repeat(64);
console.log(`\n${bar}\nJARVIS evals · ${files.length} suite(s)\n${bar}`);
for (const s of suites) {
  console.log(`\n▸ ${s.agent}  (${s.file})`);
  for (const r of s.results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
}
console.log(`\n${bar}\n${totalFail === 0 ? '✅' : '❌'} ${totalPass} passed, ${totalFail} failed\n${bar}`);

fs.writeFileSync(path.join(DIR, '.results.json'), JSON.stringify({
  ts: new Date().toISOString(), suites: suites.length, passed: totalPass, failed: totalFail,
  agents: suites.map((s) => ({ agent: s.agent, pass: s.results.filter((r) => r.pass).length, total: s.results.length })),
}, null, 2));

process.exit(totalFail === 0 ? 0 : 1);
