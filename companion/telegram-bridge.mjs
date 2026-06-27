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
  if (/^\/start/.test(text)) return send(chat, `Jarvis here. Text me anything — ask, draft, decide. Commands: /brief · /capture <thought> · /money.\n\nYour chat id is ${chat} — put it in .env as TELEGRAM_CHAT_ID to lock the bot to this phone.`);
  if (/^\/brief/.test(text)) { const b = await get('/api/brief'); return send(chat, b.text || b.error || 'no brief yet'); }
  if (/^\/money/.test(text)) { const b = await get('/api/business?id=finance'); const m = b.money || {}; return send(chat, `Income ${m.month || 'this month'}: $${(m.mtd || 0).toLocaleString()} / $${(m.goal || 10000).toLocaleString()} (${m.pct || 0}%) · $${(m.remaining || 0).toLocaleString()} to go.`); }
  const cap = text.match(/^\/capture\s+([\s\S]+)/i);
  if (cap) { await fetch(COMPANION + '/api/cockpit/capture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: cap[1] }) }).catch(() => {}); return send(chat, '✓ captured to your vault'); }
  await tg('sendChatAction', { chat_id: chat, action: 'typing' });
  return send(chat, await askJarvis(text));
}

let offset = 0;
async function poll() {
  const d = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
  for (const u of (d.result || [])) {
    offset = u.update_id + 1;
    const msg = u.message; if (!msg || !msg.text) continue;
    const chat = String(msg.chat.id);
    if (ALLOWED && chat !== ALLOWED) { await send(chat, `Not authorized. (To allow this phone, set TELEGRAM_CHAT_ID=${chat} in .env.)`); continue; }
    try { await handle(chat, msg.text); } catch (e) { await send(chat, '⚠ ' + e.message); }
  }
  setTimeout(poll, d && d.ok === false ? 3000 : 400); // back off on network errors
}

(async () => {
  const me = await tg('getMe', {});
  console.log('JARVIS Telegram bridge running as @' + ((me.result || {}).username || '?') + '  ·  brain: ' + COMPANION + (ALLOWED ? '' : '  ·  ⚠ no TELEGRAM_CHAT_ID — message the bot to learn yours'));
  poll();
})();
