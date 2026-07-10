// JARVIS Slack bridge — your command center in Slack.
// - DM Jarvis or @mention her → routes to her brain (Companion /api/chat) with all her tools → replies.
// - Polls HQ for approvals → posts them with Approve/Pass buttons → tap to resolve the gate.
// Uses Socket Mode (outbound websocket) — NO public endpoint needed (works behind Tailscale/NAS).
//
// Setup (see docs/slack-setup.md): create a Slack app, enable Socket Mode, add scopes, install,
// then put SLACK_BOT_TOKEN (xoxb-), SLACK_APP_TOKEN (xapp-), SLACK_APPROVALS_CHANNEL in .env.
//   node companion/slack-bridge.mjs     (run alongside the Companion server)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from '@slack/bolt';
const { App } = pkg;
import { narrationFor, personaFor } from '../pods/narrate.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function env(k, d = '') {
  if (process.env[k]) return process.env[k];
  try { const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); if (m) return m[1].trim(); } catch { /* */ }
  return d;
}
const BOT = env('SLACK_BOT_TOKEN');
const APP_TOKEN = env('SLACK_APP_TOKEN');
const APPROVALS_CH = env('SLACK_APPROVALS_CHANNEL', '#approvals');
const COMPANION = env('COMPANION_URL', 'http://localhost:8095').replace(/\/$/, '');
const HQ = env('JARVIS_HQ_URL', 'http://192.168.6.121:8099').replace(/\/$/, '');
const HQ_TOKEN = env('HQ_TOKEN');
const CP = env('JARVIS_CP_URL', env('CONTROL_PLANE_URL', 'http://192.168.6.121:8787')).replace(/\/$/, '');
const FLOOR_CH = env('SLACK_FLOOR_CHANNEL', '#floor'); // the war-room: watch the team work

if (!BOT || !APP_TOKEN) { console.error('Need SLACK_BOT_TOKEN (xoxb-) and SLACK_APP_TOKEN (xapp-) in .env. See docs/slack-setup.md'); process.exit(1); }

const app = new App({ token: BOT, appToken: APP_TOKEN, socketMode: true });
const history = new Map(); // channel -> [{role,content}] (light per-channel memory)

async function askJarvis(channel, text) {
  const hist = history.get(channel) || [];
  hist.push({ role: 'user', content: text });
  const r = await fetch(COMPANION + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: hist.slice(-16) }) });
  const d = await r.json();
  if (!r.ok || d.error) return '⚠ ' + (d.error || ('error ' + r.status));
  hist.push({ role: 'assistant', content: d.text }); history.set(channel, hist);
  const acts = (d.actions || []).map((a) => (a.ok ? '• ' : '✕ ') + a.label).join('\n');
  return d.text + (acts ? '\n\n_' + acts + '_' : '');
}

const clean = (t) => (t || '').replace(/<@[^>]+>/g, '').trim();

app.event('app_mention', async ({ event, say }) => {
  try { await say({ text: await askJarvis(event.channel, clean(event.text)), thread_ts: event.thread_ts || event.ts }); }
  catch (e) { await say('⚠ ' + e.message); }
});
app.message(async ({ message, say }) => {
  if (message.subtype || message.bot_id) return;
  if (message.channel_type !== 'im') return; // DMs only here; channels use @mention
  try { await say(await askJarvis(message.channel, clean(message.text))); }
  catch (e) { await say('⚠ ' + e.message); }
});

// approval buttons
function approvalBlocks(a) {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `*Needs you — ${a.pod || 'pod'}*\n${a.title}${a.detail ? '\n' + a.detail : ''}${a.amount ? `\n*+$${a.amount}*` : ''}` } },
    { type: 'actions', elements: [
      { type: 'button', style: 'primary', text: { type: 'plain_text', text: '✓ ' + (a.verb || 'Approve') }, action_id: 'appr_approve', value: a.id },
      { type: 'button', text: { type: 'plain_text', text: '✕ Pass' }, action_id: 'appr_pass', value: a.id },
    ] },
  ];
}
async function resolve(action_id, id) {
  const act = action_id === 'appr_approve' ? 'approve' : 'pass';
  await fetch(`${HQ}/api/approval/${id}/${act}`, { method: 'POST', headers: HQ_TOKEN ? { authorization: 'Bearer ' + HQ_TOKEN } : {} }).catch(() => {});
  return act;
}
app.action('appr_approve', async ({ ack, body, client, action }) => { await ack(); const act = await resolve('appr_approve', action.value); await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: `✅ Approved`, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `✅ *Approved* by <@${body.user.id}>` } }] }); });
app.action('appr_pass', async ({ ack, body, client, action }) => { await ack(); await resolve('appr_pass', action.value); await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: `⏭️ Passed`, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `⏭️ *Passed* by <@${body.user.id}>` } }] }); });

const seen = new Set();
async function pollApprovals() {
  try {
    const s = await (await fetch(HQ + '/api/state')).json();
    for (const a of s.approvals || []) {
      if (seen.has(a.id)) continue; seen.add(a.id);
      await app.client.chat.postMessage({ channel: APPROVALS_CH, text: `Needs you: ${a.title}`, blocks: approvalBlocks(a) });
    }
  } catch { /* HQ unreachable; retry next tick */ }
}

// ── #floor: the war room — agent-signed activity so you watch the whole team work together ──────────
const seenFloor = new Set();
async function seedFloor() { try { const ev = await (await fetch(CP + '/events')).json(); if (Array.isArray(ev)) for (const e of ev) seenFloor.add(e.id); } catch { /* CP offline; seed next tick */ } }
async function pollFloor() {
  try {
    const ev = await (await fetch(CP + '/events')).json();
    if (!Array.isArray(ev)) return;
    for (const e of ev) {
      if (seenFloor.has(e.id)) continue; seenFloor.add(e.id);
      const text = narrationFor(e);
      if (!text) continue;
      await app.client.chat.postMessage({ channel: FLOOR_CH, text: `${text}  —  _${personaFor(e.actor)}_` });
    }
  } catch { /* retry next tick */ }
}

(async () => {
  await app.start();
  console.log('JARVIS Slack bridge running (Socket Mode).');
  console.log(`  brain: ${COMPANION}  |  HQ: ${HQ}  |  CP: ${CP}  |  approvals → ${APPROVALS_CH}  |  floor → ${FLOOR_CH}`);
  await seedFloor();                 // don't replay history into #floor on boot
  setInterval(pollApprovals, 20000);
  setInterval(pollFloor, 30000);     // narrate the team's work into #floor
  pollApprovals();
})();
