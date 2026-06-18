// Compliance pre-check — the gov pod VERIFIES a drafted proposal against the opportunity's requirements
// BEFORE raising the submit gate, so a non-compliant bid never sits in front of you looking ready. Returns
// a quick verdict (PASS/RISK/FAIL) the worker folds into the approval + escalates on. Best-effort (Claude).
import { claude } from './lib.mjs';

export async function checkCompliance({ op = {}, draft = '' } = {}) {
  if (!draft) return { verdict: 'RISK', summary: 'no draft to check', needs_sub_past_performance: false };
  const sys = 'You are the GovCon COMPLIANCE REVIEWER for Rodgate, LLC — an SDB/Minority/Hispanic-owned SMALL business that holds Small/Micro-business, Self-Certified Small Disadvantaged, Minority-Owned and Hispanic-American-Owned status; it does NOT hold 8(a)/HUBZone/SDVOSB/WOSB; it is a NEW prime with limited federal past performance; it subcontracts labor and must respect FAR 52.219-14 (50% limit on subcontracting). Judge whether OUR PROPOSAL would be DISQUALIFIED for this opportunity (set-aside eligibility, required certs/clauses, unaddressed scope, passed deadline, missing past performance). Return ONLY minified JSON: {"verdict":"PASS|RISK|FAIL","summary":"<=140 chars","needs_sub_past_performance":true|false}. Strict and honest.';
  const usr = `OPPORTUNITY: ${JSON.stringify({ title: op.title, setAside: op.setAside, naics: op.naics, deadline: op.deadline, description: String(op.description || '').slice(0, 2000) })}\n\nOUR PROPOSAL:\n${String(draft).slice(0, 4500)}`;
  const r = await claude(sys, usr, { tier: 'cheap', maxTokens: 220, agent: 'GOV-ANALYST' });
  const m = (r.text || '').match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : { verdict: 'RISK', summary: 'review unparsed — check manually', needs_sub_past_performance: false }; }
  catch { return { verdict: 'RISK', summary: 'review unparsed — check manually', needs_sub_past_performance: false }; }
}
