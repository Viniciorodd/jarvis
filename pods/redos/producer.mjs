// producer.mjs — turns a target into a draft. Never sends. Never invents a number.
//
// Every draft carries provenance: which template, which target, when that target was last verified
// against live pages, and the source URL behind each factual claim. The operator should be able to
// check any claim in a draft without redoing the research — that is the whole point of the stamp.
//
// A draft that fails its own content guards is still RETURNED, with the block reasons attached,
// rather than thrown away. The operator needs to see what the agent tried to say and why it was
// stopped; silently dropping it hides a drift that would otherwise get caught early.

import { renderTemplate, TEMPLATES } from './templates.mjs';
import { readPlans } from './pricing.mjs';
import { contentBlocks, classifyPost } from './policy.mjs';

/**
 * Build one draft.
 *
 * @param {object} target        a record from targets.json
 * @param {string} templateKey
 * @param {object} slots         everything the template needs except price/commission
 * @param {object} opts          { channel, citedFigures, plans }
 * @returns {{ok, draft?, error?, blocks, meta}}
 */
export function draftFor(target = {}, templateKey = '', slots = {}, opts = {}) {
  const plans = opts.plans || readPlans();
  const channel = opts.channel || routeToChannel(target.contactRoute);
  const citedFigures = opts.citedFigures || [];

  const meta = {
    targetId: target.id || null,
    targetName: target.name || null,
    templateKey,
    channel,
    verifiedAt: target.verifiedAt || null,
    sources: collectSources(target, slots, citedFigures),
    classification: classifyPost({ templateKey, channel, recipient: target }),
  };

  if (target.held === true) {
    return { ok: false, error: `target is HELD${target.heldReason ? `: ${target.heldReason}` : ''}`, blocks: [], meta };
  }

  let rendered;
  try { rendered = renderTemplate(templateKey, { name: firstName(target.name), ...slots }, plans); }
  catch (e) { return { ok: false, error: e.message, blocks: [], meta }; }

  const blocks = contentBlocks(rendered.body, { plans, citedFigures });

  return {
    ok: blocks.length === 0,
    draft: { ...rendered, to: target.contactEmail || target.contactUrl || null },
    blocks,
    meta,
  };
}

/** Build every draft the roster currently supports. Pure fan-out, no I/O beyond pricing. */
export function draftAll(targets = [], plan = [], opts = {}) {
  const plans = opts.plans || readPlans();
  return plan
    .filter((p) => targets.some((t) => t.id === p.targetId))
    .map((p) => {
      const target = targets.find((t) => t.id === p.targetId);
      return draftFor(target, p.templateKey, p.slots || {}, { ...opts, plans, citedFigures: p.citedFigures || [] });
    });
}

/** Which channel a contact route implies. Unknown routes return the route itself, so policy blocks it. */
export function routeToChannel(route = '') {
  const r = String(route).toLowerCase();
  if (/email/.test(r)) return 'email';
  if (/form/.test(r)) return 'form';
  if (/skool/.test(r)) return 'skool';
  if (/\bdm\b|instagram|twitter|^x$/.test(r)) return 'dm';
  return r || 'unknown';
}

function firstName(full = '') {
  return String(full).trim().split(/\s+/)[0] || '';
}

function collectSources(target, slots, citedFigures) {
  const out = [];
  if (target.lastContentUrl) out.push({ claim: 'most recent dated content', url: target.lastContentUrl });
  if (target.affiliateEvidence && /https?:\/\//.test(target.affiliateEvidence)) {
    out.push({ claim: 'affiliate behaviour', url: target.affiliateEvidence.match(/https?:\/\/\S+/)[0] });
  }
  if (target.contactUrl) out.push({ claim: 'contact route', url: target.contactUrl });
  for (const c of citedFigures) if (c && c.source) out.push({ claim: `figure ${c.figure}`, url: c.source });
  if (slots.hookSource) out.push({ claim: 'personalisation hook', url: slots.hookSource });
  return out;
}

export const TEMPLATE_KEYS = Object.keys(TEMPLATES);
