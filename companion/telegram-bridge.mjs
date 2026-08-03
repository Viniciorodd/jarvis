// JARVIS Telegram bridge — text Jarvis from your phone, anywhere. Dependency-free (raw fetch + long-poll).
// 2-way: any text you send → routes to her brain (Companion /api/chat with all her tools) → she replies.
// Commands: /brief (morning brief) · /capture <thought> (→ vault) · /money (income vs the $10k goal).
//
// Setup (5 min):
//   1. In Telegram, message @BotFather → /newbot → name it → copy the token.
//   2. Put TELEGRAM_BOT_TOKEN=<token> in .env, then run this bridge and message your new bot anything —
//      it replies with your chat id. Put that in .env as TELEGRAM_CHAT_ID=<id> (only that chat is served).
//   3. Run it next to the companion (or on the NAS for true 24/7):  node companion/telegram-bridge.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollupNarrations } from '../pods/narrate.mjs';
import { wantsPending } from '../pods/pending-intent.mjs'; // shared with the Chief-of-Staff router (one source)
import { findPerson } from '../pods/org.mjs';
import { ensureTopic, threadIdFor, TALK_TOPIC, isUnsupported } from './telegram-topics.mjs';
export { wantsPending }; // re-exported so evals importing it from here keep working

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function env(k, d = '') {
  if (process.env[k]) return process.env[k];
  try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); if (m) return m[1].trim(); } catch { /* */ }
  return d;
}
const TOKEN = env('TELEGRAM_BOT_TOKEN');
const ALLOWED = env('TELEGRAM_CHAT_ID'); // only this chat (your phone) is served; others get a polite no
const COMPANION = env('COMPANION_URL', 'http://localhost:8095').replace(/\/$/, '');
const API = 'https://api.telegram.org/bot' + TOKEN;

// wantsPending() now lives in pods/pending-intent.mjs (shared with the Chief-of-Staff router) — imported above.

const history = []; // light conversation memory
async function tg(method, body) { try { return await (await fetch(API + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(); } catch (e) { return { ok: false, error: e.message }; } }
// threadId is OPTIONAL and additive — omitted (or when topics aren't enabled on this chat), messages land
// in the plain chat exactly as before. This is what lets "one topic per agent" degrade to today's single
// flat feed with zero behavior change until the operator does the one-time forum setup.
async function send(chat, text, threadId) {
  for (let i = 0; i < text.length; i += 3900) {
    const body = { chat_id: chat, text: text.slice(i, i + 3900) };
    if (threadId) body.message_thread_id = threadId;
    await tg('sendMessage', body);
  }
}
async function get(p) { try { return await (await fetch(COMPANION + p)).json(); } catch (e) { return { error: e.message }; } }
// Resolve (and lazily create) the Telegram topic for whoever triggered an event/gate. Falls back to null
// (plain chat) for an unknown actor or a chat where topics aren't enabled — never blocks the send.
async function topicFor(actor) {
  if (!ALLOWED || isUnsupported()) return null;
  const person = findPerson(actor);
  if (!person) return null;
  return threadIdFor(person.codename) || await ensureTopic(tg, ALLOWED, { codename: person.codename, nickname: person.nickname, title: person.title });
}

// ── Approve-from-phone ────────────────────────────────────────────────────────────────────────────
// Push each NEW gated action as inline ✅/⏭ buttons; a tap fires the SAME control-plane executor the app
// uses — so nothing sends without your tap, but you can tap from anywhere (the point while you travel).
// Approve→actually-send requires GOV_AUTO_SEND=1 in .env; otherwise Approve just previews what would go out.
const CP = env('JARVIS_CP_URL', env('CONTROL_PLANE_URL', 'http://192.168.6.121:8787')).replace(/\/$/, '');
async function cp(p, opts) { try { return await (await fetch(CP + p, opts)).json(); } catch (e) { return { error: e.message }; } }
const pushedApprovals = new Set();

// ── The approval message CARRIES THE GOODS (operator: "I get the full report, get the email, read it,
// approve — and it sends"). When the gate points at a gov-drafts/*.md draft, inline To/Subject + the
// first ~900 chars of the body right in the Telegram message, so the decision needs no laptop.
// Best-effort by contract: a missing/unreadable draft NEVER breaks the push (returns '').
function draftExcerpt(file) {
  try {
    const rel = String(file || '').replace(/\\/g, '/');
    if (!/^gov-drafts\/[^/]+\.md$/i.test(rel)) return '';                 // repo-root relative, drafts only
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/);
    // mirror pods/gov/sender.mjs parseEmailFile: To:/Subject: headers, then a ---- delimiter, then body.
    const toIdx = lines.findIndex((l) => /^To:\s*\S/.test(l));
    const subjIdx = lines.findIndex((l, i) => i > toIdx && /^Subject:\s*\S/.test(l));
    const delim = lines.findIndex((l, i) => i > subjIdx && /^-{4,}\s*$/.test(l));
    const bodyStart = delim > -1 ? delim + 1 : (subjIdx > -1 ? subjIdx + 1 : 0);
    const head = [toIdx > -1 ? lines[toIdx].trim() : '', subjIdx > -1 ? lines[subjIdx].trim() : ''].filter(Boolean);
    let body = lines.slice(bodyStart).join('\n').replace(/<!--[\s\S]*?-->/, '').replace(/\s+$/, '').trim();
    if (body.length > 900) body = body.slice(0, 900).trimEnd() + '…';
    if (!head.length && !body) return '';
    return (head.length ? head.join('\n') + '\n\n' : '') + body;
  } catch { return ''; }
}
// GOV_AUTO_SEND read fresh per push (not cached at boot) so the wording can never claim a send the
// executor won't perform. Only an actual SEND gate (action send/email + a draft file — the exact set
// pods/gov/sender.mjs approvalToSend executes) may claim "the email SENDS"; a submit gate never emails.
function autoSendOn() { return /^(1|true|yes|on)$/i.test(env('GOV_AUTO_SEND', '')); }
function isSendGate(a) {
  return (a.pod === 'gov') && ['send', 'email'].includes(String(a.action || '').toLowerCase()) && !!(a.payload && a.payload.file);
}
function approvalText(a) {
  const p = a.payload || {};
  // Never headline with the gate's own doctrine sentence. The fix at the source (chief-of-staff/router.mjs)
  // stops NEW gates carrying it, but 16 already in his queue do — and he cannot act on "Treated as
  // irreversible — gated for your approval", which is what he actually received. Prefer a real subject.
  const boilerplate = /treated as irreversible|gated for your approval|doctrine\s*§|requires (?:your )?approval|awaiting approval/i;
  const raw = String(a.rationale || '').trim();
  const who = (p.assignee && (p.assignee.nickname || p.assignee.codename)) || a.actor || '';
  const title = p.title
    || (raw && !boilerplate.test(raw) ? raw : '')
    || String(p.summary || '').trim()
    || String(p.proposed_step || '').trim()
    || [who, a.action].filter(Boolean).join(' — ')
    || 'Needs your approval';
  const detail = p.detail || (p.to ? 'To: ' + p.to : '');
  const excerpt = draftExcerpt(p.file);
  let note = '';
  if (isSendGate(a)) {
    note = autoSendOn()
      ? '\n✅ Approve = the email SENDS (auto-send is on).'
      : '\n✅ Approve = dry-run only: previewed, NOT sent (auto-send is off; set GOV_AUTO_SEND=1 to actually send).';
  }
  return `🟡 NEEDS YOU — tap to decide\n\n${title}${detail ? '\n' + detail : ''}`
    + (excerpt ? `\n\n━━ the draft ━━\n${excerpt}` : '')
    + `\n\n(${a.pod || ''} · ${a.action || ''})${note}`;
}
async function seedApprovals() { const list = await cp('/approvals/pending'); if (Array.isArray(list)) for (const a of list) pushedApprovals.add(a.id); }

// ON-DEMAND retrieval + button REVIVAL. Reads /approvals/pending (the ONE source of truth the digest reads)
// and re-sends each pending gate WITH its draft excerpt and its Approve/Skip buttons. This fixes BOTH bugs at
// once: (A) "pull me the sub outreach" now shows the real, existing drafts instead of the router inventing a
// new task; (B) after a bridge restart, seedApprovals() marks all pending gates as already-pushed so their
// buttons are never re-sent — this brings them back on demand. Leads with the SEND gates (the outreach), caps
// the burst so 20 pending items don't flood the phone.
async function showPending(chat, replyThread) {
  const list = await cp('/approvals/pending');
  if (!Array.isArray(list) || !list.length) { await send(chat, '✓ Nothing is waiting on you right now — no pending drafts or approvals.', replyThread); return; }
  const sorted = list.slice().sort((a, b) => (isSendGate(b) ? 1 : 0) - (isSendGate(a) ? 1 : 0) || String(b.ts || '').localeCompare(String(a.ts || '')));
  const CAP = 8;
  await send(chat, `🟡 ${list.length} waiting on you. Here ${list.length === 1 ? 'it is' : 'they are'} — tap to decide${list.length > CAP ? ` (showing the first ${CAP})` : ''}:`, replyThread);
  for (const a of sorted.slice(0, CAP)) {
    // Each card goes to ITS agent's own topic (same routing as the live push below) so "show my pending"
    // doesn't dump a mixed pile into whatever topic the operator happened to ask from.
    const thread = await topicFor(a.actor);
    const body = { chat_id: chat, text: approvalText(a), reply_markup: { inline_keyboard: [[{ text: '✅ Approve & send', callback_data: 'ap:' + a.id }, { text: '⏭ Skip', callback_data: 'sk:' + a.id }]] } };
    if (thread) body.message_thread_id = thread;
    await tg('sendMessage', body);
    pushedApprovals.add(a.id); // mark seen so the 15s auto-pusher doesn't double-send
  }
}
// Operator, 2026-08-02: "so many spams that most of it is just noise... I'm just ignoring everything."
// Measured: ZERO approval decisions in his last 200 events while the queue grew to 30. He tuned the channel
// out, which makes every message worthless including the ones that matter.
//
// So this no longer pushes EVERY gate. pods/notify-policy.mjs decides — only a decision with money or a
// deadline attached, a person waiting on him, or a real error. Routine outreach gates stay in the queue,
// get counted in the end-of-day report, and are listed on demand by /pending. Nothing is lost; it just
// stops interrupting him.
async function pushApprovals() {
  if (!ALLOWED) return;
  const list = await cp('/approvals/pending');
  if (!Array.isArray(list)) return;
  const P = await import('../pods/notify-policy.mjs');
  const fresh = list.filter((a) => !pushedApprovals.has(a.id));
  // Mark everything seen, even what we choose not to send — otherwise a skipped gate is re-evaluated
  // forever and would burst the moment the policy ever loosened.
  fresh.forEach((a) => pushedApprovals.add(a.id));
  const worth = fresh.filter((a) => P.worthABuzz({ kind: 'approval.request', action: a.action, rationale: a.rationale, payload: a.payload }));
  for (const a of worth.slice(0, 3)) {
    const thread = await topicFor(a.actor); // e.g. Hector's own topic for a sub-outreach send gate
    const body = { chat_id: ALLOWED, text: approvalText(a), reply_markup: { inline_keyboard: [[{ text: '✅ Approve & send', callback_data: 'ap:' + a.id }, { text: '⏭ Skip', callback_data: 'sk:' + a.id }]] } };
    if (thread) body.message_thread_id = thread;
    await tg('sendMessage', body);
  }
}
// ── Agent activity feed (BATCHED) ──────────────────────────────────────────────────────────────────
// So you FEEL the team working: meaningful agent actions ping your phone, signed by the agent who did
// them ("— Gideon (Gov Scout)"). Milestones only (scans/drafts/sends/finds), not the noise. BUT one
// message per event was spam ("scope-of-work pull, scope-of-work pull…"), so each 90s cycle now collects
// ALL new events and sends ONE rolled-up message (pods/narrate.mjs rollupNarrations — same-actor
// same-family events collapse to "pulled the scope of work for N opportunities — A, B, C"). The seen-id
// cursor is unchanged: an event is marked seen the moment it's picked up, so nothing narrates twice.
const seenEvents = new Set();
async function seedEvents() { const list = await cp('/events'); if (Array.isArray(list)) for (const ev of list) seenEvents.add(ev.id); }
async function pushNarration() {
  if (!ALLOWED) return;
  const list = await cp('/events');
  if (!Array.isArray(list)) return;
  let fresh = [];
  for (const ev of list) {
    if (seenEvents.has(ev.id)) continue;
    seenEvents.add(ev.id);
    fresh.push(ev);
  }
  if (!fresh.length) return;
  // THE NOISE FILTER (2026-08-02). This loop used to narrate every meaningful agent action every 90s — which
  // is what "so many spams from Jarvis" was. Agent activity is not news; it belongs in the end-of-day report
  // and the Activity screen. Only what pods/notify-policy.mjs judges worth interrupting him for gets through,
  // capped, so a backlog can never dump on his phone. Everything else stays marked-seen and silent.
  const NP = await import('../pods/notify-policy.mjs');
  const worthy = NP.pickBuzzes(fresh, { max: 3 });
  if (!worthy.length) return;
  const worthyIds = new Set(worthy.map((w) => w.id));
  fresh = fresh.filter((ev) => worthyIds.has(ev.id));
  // ONE TOPIC PER AGENT: group this cycle's events by actor FIRST, then run each group through the same
  // rollupNarrations the old single-message version used — that function is the truth-contract guard
  // (evals/narrate*.eval.mjs), untouched; we're only changing WHERE each actor's rollup is delivered, not
  // how it's worded. An event with no resolvable actor keeps the old behavior (main chat, no thread).
  const byActor = new Map();
  for (const ev of fresh) { const k = ev.actor || ''; if (!byActor.has(k)) byActor.set(k, []); byActor.get(k).push(ev); }
  for (const [actor, evs] of byActor) {
    const msg = rollupNarrations(evs);
    if (!msg) continue;
    const thread = actor ? await topicFor(actor) : null;
    await send(ALLOWED, msg, thread);        // send() chunks >3900 chars, so a big batch still delivers
  }
}

// Per-opportunity Pursue/Pass taps must be idempotent: two taps on the SAME button arrive as two
// callback_queries with DIFFERENT q.ids, so we key on the callback DATA ('pursue:<noticeId>'), not q.id.
// A failed action releases the key so the operator can retry; a success keeps it (and edits the message,
// which drops the buttons — belt and suspenders across bridge restarts).
const handledOppTaps = new Set();
async function handleCallback(q) {
  const chat = String((q.message && q.message.chat && q.message.chat.id) || '');
  if (ALLOWED && chat !== ALLOWED) { await tg('answerCallbackQuery', { callback_query_id: q.id }); return; }
  const data = String(q.data || '');
  const sep = data.indexOf(':');
  const act = sep < 0 ? data : data.slice(0, sep);
  const id = sep < 0 ? '' : data.slice(sep + 1);

  // ── Per-opportunity buttons from the daily scan (no exclusivity — pursue one, or all of them) ────
  if ((act === 'pursue' || act === 'passopp') && id) {
    if (handledOppTaps.has(data)) { await tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Already handled.' }); return; }
    handledOppTaps.add(data);
    if (act === 'pursue') {
      // CP /maintenance/pursue drafts the proposal NOW (an LLM draft — can take a minute), and the submit
      // itself still gates on you (doctrine §2). Answer the tap IMMEDIATELY and run the pursue DETACHED:
      // Telegram expires unanswered callbacks in seconds, and this handler must not freeze the poll loop.
      await tg('answerCallbackQuery', { callback_query_id: q.id, text: 'On it — drafting the proposal…' });
      const msgId = q.message.message_id;
      cp('/maintenance/pursue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ noticeId: id }) }).then(async (r) => {
        if (r && r.ok) {
          // success → append the checkmark; the edit also drops the buttons, so no double-fire ever.
          try { await tg('editMessageText', { chat_id: chat, message_id: msgId, text: (q.message.text || '') + '\n\n→ pursuing ✓ (proposal drafted — review & submit gates on you)' }); } catch { /* */ }
        } else {
          // failure → release the idempotency key and say so in a NEW message (the original keeps its
          // buttons untouched, so a retry tap still works).
          handledOppTaps.delete(data);
          await tg('sendMessage', { chat_id: chat, text: '⚠ Pursue FAILED' + (r && r.error ? ': ' + r.error : ' (control-plane unreachable?)') + ' — tap Pursue again to retry.' });
        }
      }).catch(() => { handledOppTaps.delete(data); });
      return;
    }
    // Pass: prefer the companion's real disposition endpoint (companion/server.js /api/gov-board/
    // disposition — updates the board's pipeline-state AND emits the CP meta event itself); when the
    // bridge runs without a companion (NAS), record the identical meta event straight on the CP.
    let done = false;
    try {
      const r = await fetch(COMPANION + '/api/gov-board/disposition', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ noticeId: id, stage: 'passed' }) });
      done = r.ok;
    } catch { /* companion not reachable here — fall through to the CP event */ }
    if (!done) {
      const r2 = await cp('/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'meta', actor: 'operator', pod: 'gov', action: 'disposition', rationale: 'marked passed (from Telegram)', payload: { noticeId: id } }) });
      done = !!(r2 && !r2.error);
    }
    const note = done ? '→ passed' : '→ pass FAILED — try again, or pass it on the Gov board in the app';
    if (!done) handledOppTaps.delete(data); // failure releases the idempotency key so a retry can work
    await tg('answerCallbackQuery', { callback_query_id: q.id, text: note.replace(/^→ /, '') });
    // Only edit on success: editMessageText drops the inline buttons, which is exactly right once the
    // action landed (no double-fire even after a bridge restart) and exactly wrong if a retry is needed.
    if (done) { try { await tg('editMessageText', { chat_id: chat, message_id: q.message.message_id, text: (q.message.text || '') + '\n\n' + note }); } catch { /* */ } }
    return;
  }

  const decision = act === 'ap' ? 'approve' : act === 'sk' ? 'pass' : null;
  if (!decision || !id) { await tg('answerCallbackQuery', { callback_query_id: q.id }); return; }
  const r = await cp('/approvals/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, pod: 'gov' }) });
  // Truthful outcome notes (the "Hector lied" fix): say sent ONLY on a confirmed send; a dry-run says
  // NOT sent; a failed send is never masked behind a bare "Approved." — the operator must know nothing left.
  let note;
  if (r && r.duplicate) note = 'Already decided.';
  else if (decision === 'pass') note = '⏭ Skipped.';
  else if (r && r.executed && r.executed.sent) note = '✅ Approved — sent.';
  else if (r && r.executed && r.executed.ok) note = '✅ Approved — dry-run only: previewed, NOT sent (auto-send is off; set GOV_AUTO_SEND=1 to actually send).';
  else if (r && r.executed) note = '✅ Approved — but the send FAILED, nothing went out' + (r.executed.reason ? ': ' + r.executed.reason : '.');
  else note = '✅ Approved.';
  await tg('answerCallbackQuery', { callback_query_id: q.id, text: note });
  try { await tg('editMessageText', { chat_id: chat, message_id: q.message.message_id, text: (q.message.text || '') + '\n\n' + note }); } catch { /* */ }
  // A callback toast is a 2-second popup he can miss, and the edited message is easy to scroll past. When an
  // approval did NOT result in a send, say so as a REAL message with the reason and the one-line fix —
  // otherwise "I approved it" and "nothing happened" look identical, which is exactly what he reported.
  if (decision === 'approve') {
    const ex = r && r.executed;
    if (ex && ex.error) {
      await send(chat, `⚠️ You approved it, but the executor errored — nothing went out.\n${ex.error}`, q.message.message_thread_id);
    } else if (ex && !ex.sent && ex.ok) {
      await send(chat, '🅿️ You approved it — but auto-send is OFF, so that was a PREVIEW. Nothing left the building.\n\nTurn it on right here: /autosend on', q.message.message_thread_id);
    } else if (ex && !ex.sent && !ex.ok) {
      await send(chat, `⚠️ You approved it, but the send FAILED — nothing went out.\n${ex.reason || 'no reason given'}`, q.message.message_thread_id);
    }
  }
}

async function askJarvis(text) {
  history.push({ role: 'user', content: text });
  // Prefer the full companion brain (all its tools) when it's reachable (bridge runs next to it on the PC).
  try {
    const r = await fetch(COMPANION + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-16) }) });
    if (r.ok) { const d = await r.json(); if (!d.error) { history.push({ role: 'assistant', content: d.text }); const acts = (d.actions || []).map((a) => (a.ok ? '• ' : '✕ ') + a.label).join('\n'); return d.text + (acts ? '\n\n' + acts : ''); } }
  } catch { /* no companion here — fall through */ }
  // Running on the NAS (no companion) → route the message through the control-plane Chief-of-Staff router.
  try {
    const r = await fetch(CP + '/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, source: 'telegram' }) });
    const d = await r.json();
    const reply = d && d.routing && d.routing.reply;
    if (reply) { history.push({ role: 'assistant', content: reply }); return reply; }
  } catch { /* */ }
  return '⚠ Brain unreachable right now — try again in a moment.';
}

// `thread` = the topic the INCOMING message arrived in (undefined in a plain chat, or when topics
// aren't set up). Every reply here answers IN THAT SAME TOPIC — Telegram never silently moves a
// conversation to a different thread, so neither do we. Per-agent topics (Gideon's, Hector's, ...) are
// only ever the DESTINATION for agent-initiated pushes (pushApprovals/pushNarration above), never
// something a reply jumps to on its own.
async function handle(chat, text, thread) {
  text = (text || '').trim();
  if (/^\/start/.test(text)) return send(chat, `Jarvis here. Text me anything — ask, draft, decide. Commands: /opps · /brief · /capture <thought> · /money · /agents (who's on, and how much rope) · /off <name> · /tier <name> 0-2 · 🛑 /kill (halt everything) · /resume · /killstatus.\n\nYour chat id is ${chat} — put it in .env as TELEGRAM_CHAT_ID to lock the bot to this phone.${isUnsupported() ? '' : '\n\nTip: each agent (Gideon, Hector, Elle, Victor…) now gets its own topic thread for updates/approvals — this thread is just for talking to me directly.'}`, thread);
  if (/^\/brief/.test(text)) { const b = await get('/api/brief'); return send(chat, b.text || b.error || 'no brief yet', thread); }
  // ── AUTONOMOUS-OUTREACH KILL SWITCH from the phone (Phase 9). /kill halts ALL agent sending instantly;
  // /resume releases it; /killstatus reports. Deliberately simple + always available — this must never fail
  // to stop. Anything unclear defaults to HALTING (the safe direction).
  if (/^\/(kill|stop|halt)\b/i.test(text)) {
    const r = await fetch(CP + '/maintenance/auto-send-kill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kill: true }) }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    return send(chat, r.ok ? '🛑 KILL SWITCH ON — all autonomous sending is halted. Nothing goes out until you /resume. (Your own approvals still work.)' : `⚠️ Could not reach the control-plane to set the kill switch — ${r.error || 'unknown'}. Assume sending is NOT halted and check the NAS.`, thread);
  }
  if (/^\/resume\b/i.test(text)) {
    const r = await fetch(CP + '/maintenance/auto-send-kill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kill: false }) }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    return send(chat, r.ok ? '▶️ Kill switch released. Your AUTO_SEND_TIER setting governs again (Tier 0 = still nothing sends).' : `⚠️ Could not release it — ${r.error || 'unknown'}.`, thread);
  }
  // ── APPROVALS THAT ACTUALLY SEND, controllable from the phone ────────────────────────────────────
  // Operator, 2026-08-02: "if there's an error with the action... we should be able to get a message stating
  // why this didn't happen. I should also be able to respond and say activate the government auto sending.
  // I should be able to control every aspect of the business from Telegram — if I am 200 miles from home I
  // want to make sure my business is still running and that I can operate it."
  // ── GATEKEEPER (PRD "protect the yes"). Telegram is primary because that is where the asks actually
  // arrive — he pastes it and gets the true cost, a verdict, and words he can send. Nothing auto-replies to
  // a real person, ever (PRD §6): Jarvis drafts, Vinicio sends.
  const gate = text.match(/^\/(?:gate|cost|ask)\s+([\s\S]+)/i);
  if (gate) {
    const r = await fetch(COMPANION + '/api/gatekeeper', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request: gate[1] }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    if (!r.ok) return send(chat, `⚠️ Couldn't work that out — ${r.error || 'unknown'}.`, thread);
    const c = r.cost, v = r.verdict;
    const mark = { yes: '✅ YES', counter: '🔁 YES, BUT', defer: '⏸ DEFER', no: '❌ NO' }[v.verdict] || v.verdict;
    const lines = [
      `${mark} — ${v.why}`,
      '',
      `⏱ ${c.totalHours}h${c.recoveryDays ? `  (incl. ${c.recoveryDays} recovery day${c.recoveryDays > 1 ? 's' : ''})` : ''}`,
      `💵 $${c.cash} out of pocket · $${c.timeValue} of your time`,
      `= ${'$' + c.total} real cost`,
    ];
    if (r.creep && r.creep.count >= 2) {
      lines.push('', `🪜 Stacking risk: ${r.creep.risk} — ${r.creep.markers.join(' · ')}`);
      lines.push(`   If it grows like the JFK weekend: ~${c.expectedHours}h`);
    }
    if (r.proportion && r.proportion.disproportionate) lines.push('', `⚖️ ${r.proportion.note}`);
    lines.push('', '━━ send this ━━', r.script);
    return send(chat, lines.join('\n'), thread);
  }
  if (/^\/autosend\b/i.test(text)) {
    const arg = (text.match(/^\/autosend\s+(on|off|status)?/i) || [])[1];
    if (!arg || /status/i.test(arg)) {
      const r = await fetch(CP + '/maintenance/gov-auto-send').then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
      if (!r.ok) return send(chat, `⚠️ Couldn't read it — ${r.error || 'control-plane unreachable'}.`, thread);
      return send(chat, r.on
        ? `📤 Auto-send is ON (from the ${r.source}) — approving actually sends the email.`
        : `🅿️ Auto-send is OFF (from the ${r.source}) — approving only PREVIEWS; nothing leaves.\nTurn it on: /autosend on`, thread);
    }
    const on = /on/i.test(arg);
    const r = await fetch(CP + '/maintenance/gov-auto-send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on }) }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    // Report what ACTUALLY took effect. Saying "done" on a failed write is how he ends up believing the
    // business is running while it quietly isn't.
    if (!r.ok) return send(chat, `⚠️ Could NOT change it — ${r.error || 'unknown'}. Assume it is still ${on ? 'off' : 'on'}.`, thread);
    return send(chat, on
      ? '📤 Auto-send ON. From now on, approving a gov email actually SENDS it. (/autosend off to stop.)'
      : '🅿️ Auto-send OFF. Approving now previews only — nothing leaves the building.', thread);
  }
  if (/^\/killstatus\b/i.test(text)) {
    const r = await fetch(CP + '/maintenance/auto-send-kill').then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    return send(chat, r.ok ? `Kill switch: ${r.kill ? '🛑 ON (nothing autonomous sends)' : '▶️ off'} · auto-send tier: ${r.tier}${r.tier === 0 ? ' (OFF — nothing sends anyway)' : ''}` : `⚠️ ${r.error || 'could not read status'}`, thread);
  }
  // ── CONTROL CENTER from the phone (PRD Part B/C). The panel at /control is on the PC; the switch has to
  // work from wherever he is, or "I need that switch" isn't satisfied. Names are matched loosely (nickname
  // OR codename, case-insensitive) because nobody types "CONNECT-01" on a phone.
  if (/^\/agents\b/i.test(text)) {
    const d = await fetch(COMPANION + '/api/control-center').then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    if (!d.ok) return send(chat, `⚠️ Couldn't read the roster — ${d.error || 'unknown'}.`, thread);
    const lines = (d.agents || []).map((a) => {
      const mark = a.state === 'off' ? '⛔' : a.state === 'paused' ? '⏸' : (a.canActAlone ? '🟢' : '🟡');
      return `${mark} ${a.nickname} — ${a.state}, tier ${a.tier}`;
    });
    return send(chat, `${d.killAll ? '🛑 KILL SWITCH IS ON — nothing autonomous runs.\n\n' : ''}${lines.join('\n')}\n\n🟢 acts alone · 🟡 needs your yes · ⏸ paused · ⛔ off\nChange it: /off Hector · /on Hector · /tier Hector 2`, thread);
  }
  const agentCmd = text.match(/^\/(off|on|pause|tier)\s+([A-Za-z0-9-]+)(?:\s+([0-2]))?/i);
  if (agentCmd) {
    const [, verb, who, tierArg] = agentCmd;
    const d = await fetch(COMPANION + '/api/control-center').then((x) => x.json()).catch(() => ({ agents: [] }));
    const hit = (d.agents || []).find((a) => a.nickname.toLowerCase() === who.toLowerCase() || a.codename.toLowerCase() === who.toLowerCase());
    if (!hit) return send(chat, `I don't have an agent called "${who}". Send /agents for the list.`, thread);
    const v = verb.toLowerCase();
    if (v === 'tier' && tierArg === undefined) return send(chat, `Which tier? e.g. /tier ${hit.nickname} 1  (0 draft · 1 approve · 2 auto)`, thread);
    const body = v === 'tier' ? { codename: hit.codename, tier: Number(tierArg) }
      : { codename: hit.codename, state: v === 'on' ? 'active' : v === 'off' ? 'off' : 'paused' };
    const r = await fetch(COMPANION + '/api/control-center', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    if (!r.ok) return send(chat, `⚠️ Couldn't change ${hit.nickname} — ${r.error || 'unknown'}. Assume nothing changed.`, thread);
    // Report what ACTUALLY took effect, not what was asked — an invalid tier is refused, and he should see that.
    const ap = r.applied || {};
    return send(chat, `✅ ${hit.nickname} is now ${ap.state || '?'}, tier ${ap.tier}${ap.tier === 0 ? ' (draft-only — needs your yes to act)' : ap.tier === 2 ? ' (acts alone, within its guardrails)' : ' (approve-to-act)'}.`, thread);
  }
  // The curated few — "send me the opportunities with detail." /opps or "opportunities"/"opps".
  if (/^\/opps/.test(text) || /^(opps|opportunities|what.?s good|any (good )?opportunities)\b/i.test(text)) {
    const b = await get('/api/gov/briefs?n=3'); return send(chat, (b && b.text) || b.error || 'No opportunities to show yet.', thread);
  }
  // "pursue 1" (or 2/3) from the last /opps list → draft that proposal.
  const pur = text.match(/^pursue\s+([1-3])\b/i);
  if (pur) {
    const b = await get('/api/gov/briefs?n=3'); const pick = (b && b.briefs || [])[Number(pur[1]) - 1];
    if (!pick) return send(chat, 'I don\'t have that one on the current list — send /opps first.', thread);
    await fetch(COMPANION + '/api/pursue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ noticeId: pick.noticeId, op: pick }) }).catch(() => {});
    return send(chat, `On it — drafting the proposal for "${pick.title}". Open the Submit Wizard in the app to review, sign & submit.`, thread);
  }
  if (/^\/money/.test(text)) { const b = await get('/api/business?id=finance'); const m = b.money || {}; return send(chat, `Income ${m.month || 'this month'}: $${(m.mtd || 0).toLocaleString()} / $${(m.goal || 10000).toLocaleString()} (${m.pct || 0}%) · $${(m.remaining || 0).toLocaleString()} to go.`, thread); }
  const cap = text.match(/^\/capture\s+([\s\S]+)/i);
  if (cap) { await fetch(COMPANION + '/api/cockpit/capture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: cap[1] }) }).catch(() => {}); return send(chat, '✓ captured to your vault', thread); }
  // "pull me the drafts / show my pending / the 2 sub outreach" → the REAL store, with buttons (see wantsPending).
  // Each card still routes to ITS agent's own topic (showPending does this internally) — only the summary
  // line above the list answers in the thread the operator asked from.
  if (wantsPending(text)) return showPending(chat, thread);
  await tg('sendChatAction', { chat_id: chat, action: 'typing', ...(thread ? { message_thread_id: thread } : {}) });
  return send(chat, await askJarvis(text), thread);
}

let offset = 0;
async function poll() {
  const d = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
  for (const u of (d.result || [])) {
    offset = u.update_id + 1;
    if (u.callback_query) { try { await handleCallback(u.callback_query); } catch { /* */ } continue; }
    const msg = u.message; if (!msg || !msg.text) continue;
    const chat = String(msg.chat.id);
    const thread = msg.message_thread_id || undefined; // which topic this came from, if any
    if (ALLOWED && chat !== ALLOWED) { await send(chat, `Not authorized. (To allow this phone, set TELEGRAM_CHAT_ID=${chat} in .env.)`, thread); continue; }
    try { await handle(chat, msg.text, thread); } catch (e) { await send(chat, '⚠ ' + e.message, thread); }
  }
  setTimeout(poll, d && d.ok === false ? 3000 : 400); // back off on network errors
}

async function main() {
  if (!TOKEN) { console.error('Need TELEGRAM_BOT_TOKEN in .env (create a bot via @BotFather). See the header.'); process.exit(1); }
  const me = await tg('getMe', {});
  console.log('JARVIS Telegram bridge running as @' + ((me.result || {}).username || '?') + '  ·  brain: ' + COMPANION + '  ·  CP: ' + CP + (ALLOWED ? '' : '  ·  ⚠ no TELEGRAM_CHAT_ID — message the bot to learn yours'));
  await seedApprovals();               // mark the existing backlog as seen (don't blast it on boot)
  await seedEvents();                   // same for the activity feed
  setInterval(pushApprovals, 15000);   // push NEW gated actions as tap-to-approve buttons
  setInterval(pushNarration, 90000);   // narrate meaningful agent actions, signed by the agent
  if (ALLOWED) {
    // One-time-per-boot: try to stand up the "Talk to Jarvis" home topic + confirm whether this chat
    // supports topics at all (requires a forum-enabled supergroup — see companion/telegram-topics.mjs).
    // Never blocks boot — a plain 1:1 chat just keeps working exactly as it does today.
    const talkThread = await ensureTopic(tg, ALLOWED, TALK_TOPIC);
    const note = talkThread
      ? '👥 Jarvis team is online. Each agent (Gideon, Hector, Elle, Victor…) posts updates + approvals in their own topic; talk to me directly in 🗣 Talk to Jarvis. Say "show my pending" any time to pull up what\'s waiting.'
      : '👥 Jarvis team is online — I\'ll tell you what each agent does, and send you approvals to tap. Say "show my pending" any time to pull up what\'s waiting. (Tip: enable Topics on this chat + make me a Manage-Topics admin for one thread per agent instead of one flat feed — docs/telegram-topics-setup.md.)';
    tg('sendMessage', { chat_id: ALLOWED, text: note, ...(talkThread ? { message_thread_id: talkThread } : {}) }).catch(() => {});
  }
  poll();
}

// Only run the bridge when executed directly (node companion/telegram-bridge.mjs). Guarded so evals can
// import the pure helpers (wantsPending) without starting the poller or exiting on a missing token.
if (process.argv[1] && /telegram-bridge\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) main();
