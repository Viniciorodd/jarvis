// inbox-watch.mjs — the 4-DAY-MISS FIX. On 6/30 a West Point contracting specialist replied to
// Rodgate's sources-sought response and it sat UNNOTICED for 4 days because nothing watched the inbox
// and nothing pushed. This watcher holds an IMAP IDLE connection to the Rodgate mailbox and the moment
// ANY .mil or .gov sender lands, it pushes to Vinicio's phone (Telegram) within seconds — plus an
// event on the audit trail so the catch-up panel holds it if he's away.
//
// Doctrine: READ-ONLY on email, notify-only — it never replies, never sends, never archives.
// Survives restarts without double-alerting (last-seen UID persisted) and without silent gaps
// (on boot it sweeps the last 48h for gov mail newer than the saved UID — a crash can't hide a reply).
//
//   node pods/gov/inbox-watch.mjs          → run the watcher (start-jarvis.cmd keeps it alive)
//   Test end-to-end without emailing anyone: send YOURSELF a message with [TEST-GOV-WATCH] in the
//   subject → the push must arrive within ~a minute.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, env, emit, mirror } from './lib.mjs';
import { notifyTelegram } from '../lib.mjs';

const STATE_FILE = path.join(ROOT, 'control-plane', 'data', 'gov-watch.json');
const TEST_TAG = '[TEST-GOV-WATCH]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── PURE: is this message worth an instant phone push? Eval-pinned. ─────────────────────────────────
// .mil / .gov sender domains (incl. state ones like pa.gov) — or the explicit test tag in the subject.
export function isGovAlert({ from = '', subject = '' } = {}) {
  const dom = String(from).toLowerCase().split('@')[1] || '';
  if (/(^|\.)(mil|gov)$/.test(dom)) return true;
  return String(subject).includes(TEST_TAG);
}

// ── PURE: the push text — brief, direct, actionable (who, what, when). Eval-pinned. ─────────────────
export function alertText(m = {}) {
  const who = m.fromName ? `${m.fromName} <${m.from}>` : m.from;
  return `🚨 GOV MAIL — ${who}\n“${String(m.subject || '(no subject)').slice(0, 140)}”\n${m.date ? new Date(m.date).toLocaleString() : ''}\n→ Open the Rodgate inbox and reply TODAY. (West Point sat 4 days — never again.)`;
}

function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { lastUid: 0 }; } }
function saveState(s) { try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch { /* */ } }

async function alertFor(msg, uid, state) {
  if (!isGovAlert(msg)) return false;
  console.log(`gov-watch: 🚨 ALERT uid ${uid} — ${msg.from} — "${String(msg.subject || '').slice(0, 80)}" → Telegram push sent`);
  notifyTelegram(alertText(msg));
  await emit({ kind: 'action', actor: 'CONNECT-01', pod: 'gov', action: 'gov.mail.alert', status: 'need', reversible: true, rationale: `Gov mail from ${msg.from}: ${String(msg.subject || '').slice(0, 90)}`, payload: { from: msg.from, subject: msg.subject, uid } });
  state.lastUid = Math.max(state.lastUid || 0, uid);
  saveState(state);
  return true;
}

// Check anything newer than the marker and alert on gov mail — used by the 'exists' push AND the
// poll fallback below (belt and suspenders: even if Gmail's IDLE notify misbehaves, the poll
// guarantees an alert within the minute the note demands).
async function sweepNew(client) {
  const st = loadState();
  const fresh = (await client.search({ uid: `${(st.lastUid || 0) + 1}:*` }, { uid: true })) || [];
  for (const uid of fresh) {
    if (uid <= (st.lastUid || 0)) continue;
    const msg = await fetchEnvelope(client, uid);
    if (msg) await alertFor(msg, uid, st);
    st.lastUid = Math.max(st.lastUid || 0, uid);
    saveState(st);
  }
  return fresh.length;
}

async function fetchEnvelope(client, uid) {
  const m = await client.fetchOne(uid, { envelope: true }, { uid: true });
  if (!m || !m.envelope) return null;
  const f = (m.envelope.from && m.envelope.from[0]) || {};
  return { from: (f.address || '').toLowerCase(), fromName: f.name || '', subject: m.envelope.subject || '', date: m.envelope.date || '' };
}

export async function watch() {
  const USER = env('RODGATE_GMAIL_USER');
  const PASS = (env('RODGATE_GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '');
  if (!USER || !PASS) { console.error('gov-watch: RODGATE_GMAIL_USER / _APP_PASSWORD not set — exiting.'); process.exit(1); }
  const { ImapFlow } = await import('imapflow');

  for (;;) { // reconnect loop — run-loop.cmd also restarts us if the process dies
    const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: USER, pass: PASS }, logger: false });
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const state = loadState();
        // BOOT SWEEP: anything gov from the last 48h newer than our marker — a crash can't hide a reply.
        const since = new Date(Date.now() - 48 * 3600000);
        const uids = (await client.search({ since }, { uid: true })) || [];
        let alerted = 0;
        for (const uid of uids) {
          if (uid <= (state.lastUid || 0)) continue;
          const msg = await fetchEnvelope(client, uid);
          if (msg && await alertFor(msg, uid, state)) alerted++;
          else { state.lastUid = Math.max(state.lastUid || 0, uid); } // seen + not gov — don't re-scan it
        }
        saveState(state);
        console.log(`gov-watch: online for ${USER} — swept ${uids.length} recent, ${alerted} alert(s). Holding IDLE…`);
        await mirror('CONNECT-01', 'idle', 'Watching the Rodgate inbox — .mil/.gov mail pushes to your phone instantly.');

        // LIVE: Gmail pushes 'exists' the moment new mail lands (imapflow auto-IDLEs when the
        // connection is quiet) — and a 45s poll backstops it, so worst case an alert is <1 min late.
        client.on('exists', () => { sweepNew(client).catch((e) => console.error('gov-watch exists:', e.message)); });
        for (;;) {
          await sleep(45000);
          await sweepNew(client);
        }
      } finally { lock.release(); }
    } catch (e) {
      console.error('gov-watch: connection lost —', e.message, '— reconnecting in 30s');
      try { await client.logout(); } catch { /* */ }
      await new Promise((r) => setTimeout(r, 30000));
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('inbox-watch.mjs')) {
  watch().catch((e) => { console.error('gov-watch fatal:', e); process.exit(1); });
}
