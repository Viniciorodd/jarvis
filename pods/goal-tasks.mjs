// goal-tasks.mjs — turning a capability gap into something he can actually do this week.
//
// Operator, 2026-08-04: *"we have to look at my current reality, and generate tasks and to dos based on my
// reality so that i could get to the business purchase."*
//
// This is the last mile of the horizon engine. The ladder says WHAT must become true; this says what to do
// on Tuesday. An LLM writes the sentences, because phrasing a concrete errand is language work — and then
// every single one has to survive this file before he ever sees it.
//
// WHY THE GATE IS THE POINT. A goal engine that generates to-dos is one prompt away from being a machine
// that tells him to day-trade his way to the down payment. His boundaries are not preferences, they are the
// conditions under which he is willing to keep going, and they live in CODE precisely so that a model having
// a confident day cannot talk its way past them. Doctrine #1: the LLM proposes, deterministic code disposes.
//
// PURE and eval-pinned.

import { violatesBoundary } from './goal-registry.mjs';
import { isCrisisContent } from './goals-import.mjs';

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Advice that sounds like an action and commits to nothing. These are the sentences a model reaches for when
// it has no idea what he should actually do, and they are worse than an empty list: they look like progress.
const VAGUE = /^(?:consider|think about|explore|research|look into|reflect on|be mindful|stay focused|keep going|continue to|try to|make sure to|remember to|work on|focus on|start thinking)\b/i;

// Things only HE can authorise, which an autonomous to-do must never quietly assume. Generating "call the
// bank and open a line of credit" is fine — it is his hands on the phone. Generating "apply for the loan"
// as though it were a chore is not.
const NEEDS_HIM = /\b(sign|submit|apply for|open an? account|wire|transfer \$|close on|accept the offer|e-?sign)\b/i;

// ── L-009: NO FABRICATED CONTACTS ────────────────────────────────────────────────────────────────
// The free-tier model behind this returned "Contact John the financial advisor" on a live run. There is no
// John. A task naming a person the system has never heard of is a fabrication that looks exactly like a
// commitment, and he would burn an afternoon trying to remember who John is.
//
// So: a task may address an ORGANISATION or a ROLE, never an invented individual. Acronyms (SBA, USDA, IRS)
// and known role-words pass; a capitalised first name after a contact verb does not.
// ⚠ Case is spelled out per verb rather than using the /i flag: /i would also make [A-Z] match lowercase,
// and the capital letter IS the signal that distinguishes "call Bob" from "call the bank".
const CONTACT_VERB = /\b(?:[Cc]all|[Cc]ontact|[Ee]mail|[Aa]sk|[Mm]eet|[Pp]hone|[Tt]ext|[Ss]peak to|[Rr]each out to|[Ff]ollow up with)\s+(?:the\s+|your\s+|a\s+|an\s+)?([A-Z][a-z]{2,})/;
const ORG_WORDS = new Set(['Farm', 'Credit', 'Bank', 'Small', 'Business', 'Administration', 'Service',
  'Department', 'Office', 'County', 'State', 'City', 'Chamber', 'Union', 'Authority', 'Agency', 'Bureau',
  'Association', 'Center', 'Centre', 'Company', 'Corporation', 'Group', 'Partners', 'Capital', 'Financial',
  'Insurance', 'Realty', 'Title', 'Escrow', 'Federal', 'National', 'Regional', 'Local', 'Rural']);

// PURE: does this task name a person nobody has ever heard of?
export function invented(text = '') {
  const m = CONTACT_VERB.exec(String(text || ''));
  if (!m) return '';
  const word = m[1];
  if (ORG_WORDS.has(word)) return '';
  // A role, not a name — "call the accountant" is fine, "call Bob" is not.
  if (/^(Accountant|Attorney|Lawyer|Broker|Banker|Lender|Realtor|Agent|Bookkeeper|Advisor|Adviser|Landlord|Tenant|Prime|Owner|Seller|Buyer|Inspector|Appraiser|Underwriter)$/.test(word)) return '';
  return word;
}

// PURE: may this generated task be shown to him at all? Returns { ok, why }.
//
// `why` is always populated on a refusal so a dropped task can be counted and explained rather than silently
// vanishing — a generator that quietly discards half its output looks like a generator that had no ideas.
export function gateTask(text = '', { tier = '' } = {}) {
  const t = clean(text);
  if (!t) return { ok: false, why: 'empty' };
  // 🚨 The safety gate, first and always. A task list is a place his own words come back to him, and the
  // crisis list must sit in front of every path that generates or imports text about his life.
  if (isCrisisContent(t)) return { ok: false, why: 'crisis' };
  const boundary = violatesBoundary(t);
  if (boundary) return { ok: false, why: boundary };
  // Dream tier is surfaced once a year and never planned. A planner that quietly plans it anyway is how the
  // castle keeps costing him Mondays.
  if (tier === 'dream') return { ok: false, why: 'dream tier — surfaced yearly, not planned' };
  if (t.length < 12) return { ok: false, why: 'too short to act on' };
  if (t.length > 160) return { ok: false, why: 'too long to be one task' };
  // "Pull credit report" and "Call accountant" clear every other rule and still tell him nothing: which
  // report, from where, which accountant, about what. A real task names its target. Four words is the
  // cheapest test that separates an instruction from a category.
  if (t.split(' ').filter((w) => w.length > 1).length < 4) return { ok: false, why: 'too thin — name the target' };
  const person = invented(t);
  if (person) return { ok: false, why: 'invented a contact (' + person + ')' };
  if (VAGUE.test(t)) return { ok: false, why: 'vague — not a thing you can finish' };
  if (/\?$/.test(t)) return { ok: false, why: 'a question, not a task' };
  return { ok: true, why: '' };
}

// PURE: does this task commit him to something irreversible? Not a refusal — a FLAG, so the surface can say
// "this one is yours to press" instead of pretending it is a chore. Doctrine's gate-every-irreversible-action
// applied to language rather than to an executor.
export function needsHim(text = '') { return NEEDS_HIM.test(String(text || '')); }

// PURE: the model's raw suggestions → the list he is allowed to see.
//
// Returns kept AND dropped, because the dropped ones are the interesting half: if a generation round was
// refused for "trading is off", that is worth knowing about the model, not worth hiding.
export function groundTasks(raw = [], { goal = {}, cap = '' } = {}) {
  const kept = [], dropped = [];
  const seen = new Set();
  for (const item of (Array.isArray(raw) ? raw : [])) {
    const text = clean(typeof item === 'string' ? item : (item && item.text));
    const g = gateTask(text, { tier: goal.tier });
    if (!g.ok) { dropped.push({ text: text.slice(0, 80), why: g.why }); continue; }
    const key = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 48);
    if (seen.has(key)) { dropped.push({ text: text.slice(0, 80), why: 'duplicate' }); continue; }
    seen.add(key);
    kept.push({ text, cap, goalId: goal.id || '', goal: goal.t || '', yours: needsHim(text) });
  }
  return { kept: kept.slice(0, 4), dropped };   // four is a week's worth; more is a wish list
}

// PURE: the vault line for an accepted task. His vault is Markdown checkboxes and the due date is Obsidian's
// `📅 YYYY-MM-DD`, so an accepted task becomes indistinguishable from one he typed himself.
export function vaultLine(task = {}, due = '') {
  const t = clean(task.text);
  if (!t) return '';
  return '- [ ] ' + t + (due ? ' 📅 ' + due : '') + ' #jarvis';
}

// PURE: a date `days` out, as YYYY-MM-DD. Kept here so the eval can pin it rather than reading the clock.
export function dueIn(days = 7, from = '2026-08-04') {
  const t = Date.parse(String(from));
  if (!Number.isFinite(t)) return '';
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}
