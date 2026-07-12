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

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function env(k, d = '') {
  if (process.env[k]) return process.env[k];
  try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); if (m) return m[1].trim(); } catch { /* */ }
  return d;
}
const TOKEN = env('TELEGRAM_BOT_TOKEN');
const ALLOWED = env('TELEGRAM_CHAT_ID'); // only this chat (your phone) is served; others get a polite no
const COMPANION = env('COMPANION_URL', 'http://localhost:8095').replace(/\/$/, '');
if (!TOKEN) { console.error('Need TELEGRAM_BOT_TOKEN in .env (create a bot via @BotFather). See the header.'); process.exit(1); }
const API = 'https://api.telegram.org/bot' + TOKEN;

const history = []; // light conversation memory
async function tg(method, body) { try { return await (await fetch(API + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(); } catch (e) { return { ok: false, error: e.message }; } }
async function send(chat, text) { for (let i = 0; i < text.length; i += 3900) await tg('sendMessage', { chat_id: chat, text: text.slice(i, i + 3900) }); }
async function get(p) { try { return await (await fetch(COMPANION + p)).json(); } catch (e) { return { error: e.message }; } }

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
  const title = p.title || a.rationale || a.action || 'Needs your approval';
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
async function pushApprovals() {
  if (!ALLOWED) return;
  const list = await cp('/approvals/pending');
  if (!Array.isArray(list)) return;
  for (const a of list) {
    if (pushedApprovals.has(a.id)) continue;
    pushedApprovals.add(a.id);
    await tg('sendMessage', { chat_id: ALLOWED, text: approvalText(a), reply_markup: { inline_keyboard: [[{ text: '✅ Approve & send', callback_data: 'ap:' + a.id }, { text: '⏭ Skip', callback_data: 'sk:' + a.id }]] } });
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
  const fresh = [];
  for (const ev of list) {
    if (seenEvents.has(ev.id)) continue;
    seenEvents.add(ev.id);
    fresh.push(ev);
  }
  if (!fresh.length) return;
  const msg = rollupNarrations(fresh);        // one truthful message per cycle, or null if all noise
  if (msg) await send(ALLOWED, msg);          // send() chunks >3900 chars, so a big batch still delivers
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

async function handle(chat, text) {
  text = (text || '').trim();
  if (/^\/start/.test(text)) return send(chat, `Jarvis here. Text me anything — ask, draft, decide. Commands: /opps (top gov opportunities) · /brief · /capture <thought> · /money.\n\nYour chat id is ${chat} — put it in .env as TELEGRAM_CHAT_ID to lock the bot to this phone.`);
  if (/^\/brief/.test(text)) { const b = await get('/api/brief'); return send(chat, b.text || b.error || 'no brief yet'); }
  // The curated few — "send me the opportunities with detail." /opps or "opportunities"/"opps".
  if (/^\/opps/.test(text) || /^(opps|opportunities|what.?s good|any (good )?opportunities)\b/i.test(text)) {
    const b = await get('/api/gov/briefs?n=3'); return send(chat, (b && b.text) || b.error || 'No opportunities to show yet.');
  }
  // "pursue 1" (or 2/3) from the last /opps list → draft that proposal.
  const pur = text.match(/^pursue\s+([1-3])\b/i);
  if (pur) {
    const b = await get('/api/gov/briefs?n=3'); const pick = (b && b.briefs || [])[Number(pur[1]) - 1];
    if (!pick) return send(chat, 'I don\'t have that one on the current list — send /opps first.');
    await fetch(COMPANION + '/api/pursue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ noticeId: pick.noticeId, op: pick }) }).catch(() => {});
    return send(chat, `On it — drafting the proposal for "${pick.title}". Open the Submit Wizard in the app to review, sign & submit.`);
  }
  if (/^\/money/.test(text)) { const b = await get('/api/business?id=finance'); const m = b.money || {}; return send(chat, `Income ${m.month || 'this month'}: $${(m.mtd || 0).toLocaleString()} / $${(m.goal || 10000).toLocaleString()} (${m.pct || 0}%) · $${(m.remaining || 0).toLocaleString()} to go.`); }
  const cap = text.match(/^\/capture\s+([\s\S]+)/i);
  if (cap) { await fetch(COMPANION + '/api/cockpit/capture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: cap[1] }) }).catch(() => {}); return send(chat, '✓ captured to your vault'); }
  await tg('sendChatAction', { chat_id: chat, action: 'typing' });
  return send(chat, await askJarvis(text));
}

let offset = 0;
async function poll() {
  const d = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
  for (const u of (d.result || [])) {
    offset = u.update_id + 1;
    if (u.callback_query) { try { await handleCallback(u.callback_query); } catch { /* */ } continue; }
    const msg = u.message; if (!msg || !msg.text) continue;
    const chat = String(msg.chat.id);
    if (ALLOWED && chat !== ALLOWED) { await send(chat, `Not authorized. (To allow this phone, set TELEGRAM_CHAT_ID=${chat} in .env.)`); continue; }
    try { await handle(chat, msg.text); } catch (e) { await send(chat, '⚠ ' + e.message); }
  }
  setTimeout(poll, d && d.ok === false ? 3000 : 400); // back off on network errors
}

(async () => {
  const me = await tg('getMe', {});
  console.log('JARVIS Telegram bridge running as @' + ((me.result || {}).username || '?') + '  ·  brain: ' + COMPANION + '  ·  CP: ' + CP + (ALLOWED ? '' : '  ·  ⚠ no TELEGRAM_CHAT_ID — message the bot to learn yours'));
  await seedApprovals();               // mark the existing backlog as seen (don't blast it on boot)
  await seedEvents();                   // same for the activity feed
  setInterval(pushApprovals, 15000);   // push NEW gated actions as tap-to-approve buttons
  setInterval(pushNarration, 90000);   // narrate meaningful agent actions, signed by the agent
  if (ALLOWED) tg('sendMessage', { chat_id: ALLOWED, text: '👥 Jarvis team is online — I\'ll tell you what each agent does, and send you approvals to tap. Let\'s make money.' }).catch(() => {});
  poll();
})();
