// Gov inbox watcher — reads the RODGATE mailbox, classifies what lands, and ALERTS the operator (HQ
// "Needs you" + a Telegram push) so he knows the moment a reply, a CO message, or an AWARD arrives.
// Awards are routed to Sloane (post-award). Read-only on email; the gov team reads + decides, you sign.

import { env, emit, mirror, hqApproval } from './lib.mjs';
import { readRodgateInbox } from './replies.mjs';

// PURE: classify one message by its content. Eval-tested — this is the brain of "tell me when we win".
export function classifyMail({ from = '', subject = '', body = '' }) {
  const t = `${subject} ${body}`.toLowerCase();
  const f = String(from).toLowerCase();
  if (/\b(notice of award|contract award|you have been awarded|awarded the contract|selected for award|award notification|of award)\b/.test(t)) return 'award';
  if (/\b(unsuccessful offeror|not selected for award|award has been made to another|your (proposal|offer) was not)\b/.test(t)) return 'no_award';
  if (/\.(gov|mil)\b/.test(f) || /\b(contracting officer|solicitation|amendment|modification|sources sought|set-aside|rfp|rfq)\b/.test(t)) return 'co';
  return 'other';
}

function notifyTelegram(text) {
  const token = env('TELEGRAM_BOT_TOKEN'); const chat = env('TELEGRAM_CHAT_ID');
  if (!token || !chat) return;
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) }).catch(() => { /* push is best-effort */ });
}
async function alert(title, detail, { verb = 'Open', xp = 0 } = {}) {
  await hqApproval({ pod: 'Gov War Room', title, detail, xp, verb });   // shows in HQ / Jarvis World "Needs you"
  notifyTelegram(`${title}\n${detail}`);                                 // phone push
}

// Poll the Rodgate inbox; classify + alert on anything notable. Returns a summary.
export async function watchRodgate({ days = 14 } = {}) {
  await mirror('CONNECT-01', 'work', 'Scanning the Rodgate inbox…');
  const inbox = await readRodgateInbox({ days });
  if (inbox.error) {
    await emit({ kind: 'trace', actor: 'CONNECT-01', pod: 'gov', action: 'inbox.skip', status: 'error', rationale: inbox.error });
    await mirror('CONNECT-01', 'idle', inbox.error);
    return { ok: false, note: inbox.error };
  }
  const counts = { award: 0, no_award: 0, co: 0, other: 0 };
  for (const m of inbox.msgs) {
    const cls = classifyMail(m);
    counts[cls]++;
    const subj = (m.subject || '(no subject)').slice(0, 90);
    if (cls === 'award') {
      await emit({ kind: 'action', actor: 'OPERATOR-01', pod: 'gov', action: 'award.detected', rationale: `Possible AWARD: ${subj}`, payload: { from: m.from, subject: m.subject } });
      await alert('🏆 Possible CONTRACT AWARD', `From ${m.from} — "${subj}". Confirm, then kick off post-award.`, { verb: 'Review award', xp: 200 });
      try { const op = await import('./operator.mjs'); await op.runOps({ source: 'award-email' }); } catch { /* operator best-effort */ }
      await mirror('OPERATOR-01', 'need', `Award letter detected — confirm + start post-award`);
    } else if (cls === 'no_award') {
      await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'award.lost', rationale: `Not selected: ${subj}` });
      await alert('Not selected (this one)', `From ${m.from} — "${subj}". I'll log it for the next bid.`, { verb: 'Note' });
    } else if (cls === 'co') {
      await emit({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'co.message', rationale: `CO/solicitation message: ${subj}`, payload: { from: m.from } });
      await alert('📋 Contracting-officer message', `From ${m.from} — "${subj}". May need a timely response.`, { verb: 'Open' });
    }
  }
  await emit({ kind: 'trace', actor: 'CONNECT-01', pod: 'gov', action: 'inbox.scan', rationale: `Rodgate scan: ${counts.award} award, ${counts.no_award} no-award, ${counts.co} CO, ${counts.other} other` });
  await mirror('CONNECT-01', counts.award || counts.co ? 'need' : 'idle', counts.award ? `🏆 ${counts.award} possible award!` : counts.co ? `${counts.co} CO message(s)` : 'Inbox scanned — nothing urgent');
  return { ok: true, counts };
}

if (process.argv[1] && process.argv[1].endsWith('inbox.mjs')) {
  watchRodgate({}).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
