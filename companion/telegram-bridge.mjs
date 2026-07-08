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
function approvalText(a) {
  const p = a.payload || {};
  const title = p.title || a.rationale || a.action || 'Needs your approval';
  const detail = p.detail || (p.to ? 'To: ' + p.to : '');
  return `🟡 NEEDS YOU — tap to decide\n\n${title}${detail ? '\n' + detail : ''}\n\n(${a.pod || ''} · ${a.action || ''})`;
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
async function handleCallback(q) {
  const chat = String((q.message && q.message.chat && q.message.chat.id) || '');
  if (ALLOWED && chat !== ALLOWED) { await tg('answerCallbackQuery', { callback_query_id: q.id }); return; }
  const [act, id] = String(q.data || '').split(':');
  const decision = act === 'ap' ? 'approve' : act === 'sk' ? 'pass' : null;
  if (!decision || !id) { await tg('answerCallbackQuery', { callback_query_id: q.id }); return; }
  const r = await cp('/approvals/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, pod: 'gov' }) });
  let note;
  if (r && r.duplicate) note = 'Already decided.';
  else if (decision === 'pass') note = '⏭ Skipped.';
  else if (r && r.executed && r.executed.sent) note = '✅ Approved — sent.';
  else if (r && r.executed && r.executed.ok) note = '✅ Approved (auto-send off → previewed; set GOV_AUTO_SEND=1 to actually send).';
  else note = '✅ Approved.';
  await tg('answerCallbackQuery', { callback_query_id: q.id, text: note });
  try { await tg('editMessageText', { chat_id: chat, message_id: q.message.message_id, text: (q.message.text || '') + '\n\n' + note }); } catch { /* */ }
}

async function askJarvis(text) {
  history.push({ role: 'user', content: text });
  const r = await fetch(COMPANION + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-16) }) }).catch((e) => ({ ok: false, _e: e.message }));
  if (r.ok === false) return '⚠ companion offline (' + (r._e || '') + ')';
  const d = await r.json();
  if (d.error) return '⚠ ' + d.error;
  history.push({ role: 'assistant', content: d.text });
  const acts = (d.actions || []).map((a) => (a.ok ? '• ' : '✕ ') + a.label).join('\n');
  return d.text + (acts ? '\n\n' + acts : '');
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
  setInterval(pushApprovals, 15000);   // push NEW gated actions as tap-to-approve buttons
  poll();
})();
