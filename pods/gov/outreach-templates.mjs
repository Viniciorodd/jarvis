// outreach-templates.mjs — the APPROVED outreach templates (Phase 9, PRD §4.1). Agents fill SLOTS; they never
// free-compose an email that can auto-send. That's the point: it collapses the misrepresentation + hallucination
// surface to a set of sentences the operator has already read and approved.
//
// Every identity/certification line is COPIED from company.mjs COMPANY (L-005) — never generated, never
// paraphrased — so the canonical-facts gate in outreach-policy.mjs always passes on an unmutated template.
// NOTHING here contains pricing, a commitment, or a certification Rodgate doesn't hold. Fails closed: a missing
// required slot throws rather than sending a half-filled email.
import { COMPANY } from './company.mjs';

// The one identity block, straight from the canonical record. Self-certified only — never 8(a)/HUBZone/SDVOSB/WOSB.
const SIGNATURE = () => [
  '',
  `${COMPANY.contact.name}`,
  `${COMPANY.contact.role}, ${COMPANY.legalName}`,
  `${COMPANY.contact.phone} · ${COMPANY.contact.email}`,
  `Small Disadvantaged Business (self-certified) · Minority / Hispanic American Owned · UEI ${COMPANY.uei} · CAGE ${COMPANY.cage}`,
].join('\n');

// Each template: tier 1 = asks THEM for something (commits nothing) · tier 2 = represents the company ·
// tier 3 = makes capability claims to the government.
export const TEMPLATES = {
  'sub-quote': {
    tier: 1,
    requiredSlots: ['contactName', 'trade', 'place'],
    subject: (s) => `Quote request — ${s.trade} support in ${s.place}`,
    body: (s) => [
      `Hi ${s.contactName},`,
      '',
      `I'm ${COMPANY.contact.name} with ${COMPANY.legalName}, a ${COMPANY.serviceArea.join('/')} facilities-services firm bidding government work in ${s.place}.`,
      `We're looking for a reliable ${s.trade} partner and I'd like to ask for your availability and rates for this type of work.`,
      '',
      `Could you let me know if you take on subcontract work, and what you'd need from us to put a number together? Happy to send the scope once I hear back.`,
      '',
      'Thanks for your time —',
      SIGNATURE(),
    ].join('\n'),
  },
  'follow-up': {
    tier: 1,
    requiredSlots: ['contactName'],
    subject: (s) => `Following up${s.subjectRef ? ` — ${s.subjectRef}` : ''}`,
    body: (s) => [
      `Hi ${s.contactName},`,
      '',
      `Just following up on my note${s.subjectRef ? ` about ${s.subjectRef}` : ''} — I know things get busy.`,
      `If you're interested, a quick yes or no is all I need and I'll take it from there. If it's not a fit, no problem at all — just let me know and I won't keep bumping this.`,
      '',
      'Appreciate it —',
      SIGNATURE(),
    ].join('\n'),
  },
  'prime-intro': {
    tier: 2,
    requiredSlots: ['contactName', 'company'],
    subject: () => `Introduction — ${COMPANY.legalName} (janitorial / facilities support)`,
    body: (s) => [
      `Hi ${s.contactName},`,
      '',
      `I'm reaching out to introduce ${COMPANY.legalName} and get on ${s.company}'s radar as a potential subcontractor.`,
      '',
      `We provide ${COMPANY.competencies.slice(0, 4).join(', ').toLowerCase()} across ${COMPANY.serviceArea.join(', ')}. We're registered and active in SAM.gov and a Pennsylvania Commonwealth / COSTARS vendor.`,
      '',
      `If you have upcoming requirements where a small disadvantaged business partner would help, I'd welcome the chance to be considered. Happy to send our capability statement.`,
      '',
      'Thank you for your time —',
      SIGNATURE(),
    ].join('\n'),
  },
  'sources-sought': {
    tier: 3,
    requiredSlots: ['contactName', 'solicitation'],
    subject: (s) => `Response to Sources Sought — ${s.solicitation}`,
    body: (s) => [
      `Dear ${s.contactName},`,
      '',
      `${COMPANY.legalName} is responding to the sources-sought notice for ${s.solicitation} to express our capability and interest.`,
      '',
      `We perform ${COMPANY.competencies.slice(0, 4).join(', ').toLowerCase()}. Our primary NAICS codes are ${COMPANY.naics.map((n) => n.code).join(', ')}. We are an active SAM.gov registrant.`,
      '',
      `We are prepared to provide additional capability information on request. Thank you for the opportunity to respond to this market research.`,
      '',
      'Respectfully,',
      SIGNATURE(),
    ].join('\n'),
  },
};

// PURE: render an approved template. Throws on an unknown key or a missing required slot — a half-filled
// outreach email must never reach the send path (fail closed).
export function renderTemplate(key, slots = {}) {
  const t = TEMPLATES[key];
  if (!t) throw new Error(`unknown outreach template "${key}" — only approved templates can be sent`);
  const missing = t.requiredSlots.filter((s) => !String(slots[s] || '').trim());
  if (missing.length) throw new Error(`template "${key}" is missing required slot(s): ${missing.join(', ')}`);
  return { key, tier: t.tier, subject: t.subject(slots), body: t.body(slots) };
}

export function templateKeys() { return Object.keys(TEMPLATES); }
