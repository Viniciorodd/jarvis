// telegram-topics.mjs — ONE TOPIC PER AGENT, so the operator's single Telegram feed stops being a firehose.
//
// Operator, verbatim (2026-07-24): "i want one chat per ai agent, right now i receive so many things at
// once all in one chat. sometimes i want to respond to something, but by that time, theres 2 other
// messages and then jarvis gets confused." Telegram bots can't open separate 1:1 chats per agent, but a
// SUPERGROUP with "Topics" enabled gives the same effect inside one place — each agent (Gideon, Hector,
// Elle, Victor, ...) gets its own named thread, and a live conversation with Jarvis herself gets its own
// stable "🗣 Talk to Jarvis" thread that agent chatter never interleaves into.
//
// REQUIRES a manual one-time setup step (Telegram doesn't allow a bot to convert a normal chat into a
// forum): create a Telegram GROUP, enable "Topics" in group settings, add this bot as admin with
// "Manage Topics" permission, then set TELEGRAM_CHAT_ID to that group's chat id (message the bot once in
// the group to learn it, same as today). See docs/telegram-topics-setup.md.
//
// Degrades safely: if the chat isn't a forum (topics not enabled) or the bot lacks permission,
// createForumTopic fails once, we remember that ("unsupported") and every send falls back to the plain
// chat with no thread — nothing breaks, nothing repeats the failed call every cycle.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'control-plane', 'data');
const STORE = path.join(DATA_DIR, 'telegram-topics.json');

// Special pseudo-persona for the free-form conversational thread (not a roster agent — this is where
// the operator's own back-and-forth with "her" lives, separate from agent milestone chatter).
export const TALK_TOPIC = { codename: 'TALK', nickname: 'Jarvis', title: 'Talk to Jarvis', icon: '🗣' };

function load() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; }
}
function save(map) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(STORE, JSON.stringify(map, null, 2)); } catch { /* best-effort — a failed persist just means we re-create the topic next boot */ }
}

let cache = load();          // codename -> message_thread_id (persisted)
let unsupported = false;     // set true the first time createForumTopic fails — stop retrying every cycle

export function isUnsupported() { return unsupported; }
export function threadIdFor(codename) { return cache[codename] || null; }

// Telegram forum topic colors (icon_color) — cycles through Telegram's fixed palette so agents are
// visually distinct in the topic list; picked deterministically off the codename so the same agent
// always gets the same color across restarts.
const COLORS = [0x6FB9F0, 0xFFD67E, 0xCB86DB, 0x8EEE98, 0xFF93B2, 0xFB6F5F];
function colorFor(codename) {
  let h = 0; for (const c of String(codename)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

// `tg` is the same `tg(method, body)` raw-fetch helper telegram-bridge.mjs already has — passed in so
// this module stays dependency-free and doesn't duplicate the Bot API caller or the token handling.
export async function ensureTopic(tg, chatId, person) {
  const codename = person.codename;
  if (cache[codename]) return cache[codename];
  if (unsupported) return null; // already learned this chat can't do topics — don't hammer the API
  const name = `${person.icon ? person.icon + ' ' : ''}${person.nickname} · ${person.title}`.slice(0, 128);
  const r = await tg('createForumTopic', { chat_id: chatId, name, icon_color: colorFor(codename) });
  if (r && r.ok && r.result && r.result.message_thread_id) {
    cache[codename] = r.result.message_thread_id;
    save(cache);
    return cache[codename];
  }
  // Common failure: chat isn't a forum-enabled supergroup yet, or the bot isn't an admin there.
  // Never crash the bridge over this — just fall back to the plain (un-threaded) chat from now on.
  unsupported = true;
  console.error('telegram-topics: createForumTopic failed (topics not enabled on this chat, or bot lacks "Manage Topics"?) — falling back to one flat chat.', r && r.description);
  return null;
}
