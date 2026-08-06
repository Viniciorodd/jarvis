// executor.mjs — the only path from a draft to the outside world. Dry-run by DEFAULT, and dry-run
// is the shipped state. Nothing here holds a credential: the caller injects a `send` adapter, so a
// misconfigured deploy sends nothing rather than sending wrongly.
//
// Directive: verified send. After a send, confirm it really landed and report the real result or
// "NOT sent — <reason>". Never a confabulated success. An adapter that cannot confirm delivery is
// treated as a failure, not as a success with a missing receipt.
//
// Anything canAutoSend denies goes to the approval queue. That is not an error path — at tier 0 it
// is every single message, by design.

import { canAutoSend, policy } from './policy.mjs';
import { readPlans } from './pricing.mjs';

/**
 * @param {Array} drafts   output of producer.draftFor / draftAll
 * @param {object} o
 *   dryRun   default TRUE. Does everything except the send.
 *   send     async ({to, subject, body, channel}) => {ok, id?, error?}. Required when dryRun false.
 *   confirm  async ({id}) => boolean. Optional; when present, a false result downgrades to NOT sent.
 *   state    { sentToday, lastContactAt: {targetId: iso} }
 * @returns {{ sent, queued, failed, tier, kill, lines }}
 */
export async function runRedosOutreach(drafts = [], o = {}) {
  const dryRun = o.dryRun !== false;
  const env = o.env || process.env;
  const p = policy(env);
  const plans = o.plans || readPlans();
  const state = o.state || {};
  const lastContact = state.lastContactAt || {};
  let sentToday = Number(state.sentToday) || 0;

  const sent = [], queued = [], failed = [];

  for (const d of drafts) {
    const meta = d.meta || {};
    const target = d.target || { verifiedAt: meta.verifiedAt, replied: meta.replied, threadOpened: meta.threadOpened };

    if (!d.ok) {
      queued.push({ ...meta, reason: d.error || (d.blocks || []).join(' | ') || 'draft failed its own guards' });
      continue;
    }

    const verdict = canAutoSend({
      templateKey: meta.templateKey,
      body: d.draft.body,
      channel: meta.channel,
      recipient: target,
      env, plans,
      citedFigures: d.citedFigures || [],
      sentToday,
      lastToRecipientAt: lastContact[meta.targetId] || null,
      now: o.now || null,
    });

    if (!verdict.allow) { queued.push({ ...meta, reason: verdict.reason }); continue; }

    if (dryRun) { sent.push({ ...meta, dryRun: true, note: 'WOULD send — dry run, nothing left the machine' }); continue; }

    if (typeof o.send !== 'function') {
      failed.push({ ...meta, reason: 'NOT sent — no send adapter was provided' });
      continue;
    }

    let res;
    try { res = await o.send({ to: d.draft.to, subject: d.draft.subject, body: d.draft.body, channel: meta.channel }); }
    catch (e) { failed.push({ ...meta, reason: `NOT sent — adapter threw: ${e.message}` }); continue; }

    if (!res || res.ok !== true) { failed.push({ ...meta, reason: `NOT sent — ${(res && res.error) || 'adapter reported failure'}` }); continue; }

    if (typeof o.confirm === 'function') {
      let landed = false;
      try { landed = await o.confirm({ id: res.id }); } catch { landed = false; }
      if (!landed) { failed.push({ ...meta, id: res.id, reason: 'NOT sent — could not confirm it landed' }); continue; }
    }

    sentToday += 1;
    sent.push({ ...meta, id: res.id || null, dryRun: false });
  }

  return {
    sent, queued, failed,
    tier: p.tier, kill: p.kill,
    lines: report({ sent, queued, failed, tier: p.tier, kill: p.kill, dryRun }),
  };
}

function report({ sent, queued, failed, tier, kill, dryRun }) {
  const out = [];
  out.push(`REDOS outreach · tier ${tier}${kill ? ' · KILL SWITCH ON' : ''}${dryRun ? ' · DRY RUN' : ''}`);
  out.push(`${dryRun ? 'would send' : 'sent'}: ${sent.length} · queued for approval: ${queued.length} · failed: ${failed.length}`);
  for (const s of sent) out.push(`  ${dryRun ? '~' : '>'} ${s.targetName} · ${s.templateKey}`);
  for (const q of queued) out.push(`  ? ${q.targetName} · ${q.templateKey} — ${q.reason}`);
  for (const f of failed) out.push(`  ! ${f.targetName} · ${f.templateKey} — ${f.reason}`);
  if (!sent.length && !queued.length && !failed.length) out.push('  nothing to do');
  return out.join('\n');
}
