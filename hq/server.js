// JARVIS HQ server — zero-dependency Node (>=18). Serves the dashboard PWA and a
// tiny JSON API that n8n workflows ping. State persists to DATA_DIR.
//
// API (all bodies JSON):
//   GET  /api/state
//     → { earned, xp, streak, quests, operators, approvals, feed, rooms }
//
//   POST /api/event            (machine endpoint — Bearer HQ_TOKEN if set)
//     { agent: "SAM-SCOUT", pod: "gov", state: "work"|"idle"|"need"|"error",
//       text: "Scanned 212 notices", amount?: 35, xp?: 10 }
//     Updates the operator's status on the floor, appends to the ops feed,
//     and banks amount/xp if present. n8n: add an HTTP Request node at the
//     start/end/error of every workflow pointing here.
//
//   POST /api/approval          (machine endpoint)
//     { pod: "Fiverr Studio", title: "Deliver thumbnail v2", detail: "...",
//       amount?: 35, xp?: 25, verb?: "Approve & deliver",
//       callback?: "http://n8n:5678/webhook/approval" }
//     → { id }. Shows in "NEEDS YOU" on the dashboard.
//
//   POST /api/approval/:id/approve   (human endpoint — no token; tailnet-only)
//   POST /api/approval/:id/pass
//     Resolves the approval, banks amount/xp on approve, and POSTs
//     { id, action, pod, title, amount } to the approval's callback URL
//     so n8n's Executor can fire (or stand down).
//
//   POST /api/quests            (machine endpoint — Sunday strategy agent)
//     { quests: [{q, done, of}], streak?: 4 }

'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.HQ_PORT || 8099);
const TOKEN = process.env.HQ_TOKEN || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROOMS_FILE = path.join(__dirname, 'config', 'rooms.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const FEED_MAX = 80;

fs.mkdirSync(DATA_DIR, { recursive: true });

const rooms = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));

let state = {
  earned: 0,
  xp: 0,
  streak: 0,
  quests: [],
  operators: {}, // agent -> { pod, state, text, t }
  approvals: [], // { id, pod, title, detail, amount, xp, verb, callback, t }
};
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
} catch { /* first boot */ }

let feed = [];
try {
  const lines = fs.readFileSync(EVENTS_FILE, 'utf8').trim().split('\n');
  feed = lines.slice(-FEED_MAX).map((l) => JSON.parse(l));
} catch { /* no events yet */ }

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), (err) => {
      if (err) console.error('state save failed:', err.message);
    });
  }, 150);
}

function logEvent(entry) {
  const e = { t: Date.now(), ...entry };
  feed.push(e);
  if (feed.length > FEED_MAX) feed = feed.slice(-FEED_MAX);
  fs.appendFile(EVENTS_FILE, JSON.stringify(e) + '\n', (err) => {
    if (err) console.error('event log failed:', err.message);
  });
  return e;
}

function bank({ amount = 0, xp = 0 }) {
  if (amount) state.earned = Math.round((state.earned + Number(amount)) * 100) / 100;
  if (xp) state.xp += Number(xp);
}

function notifyCallback(url, payload) {
  if (!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => console.error('callback failed:', url, err.message));
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 256 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function machineAuthOk(req) {
  if (!TOKEN) return true;
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(res, urlPath) {
  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return json(res, 404, { error: 'not found' });
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'not found' });
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    if (req.method === 'GET' && p === '/api/state') {
      return json(res, 200, {
        earned: state.earned,
        xp: state.xp,
        streak: state.streak,
        quests: state.quests,
        operators: state.operators,
        approvals: state.approvals.map(({ callback, ...a }) => a),
        feed: feed.slice(-40).reverse(),
        rooms,
      });
    }

    if (req.method === 'POST' && p === '/api/event') {
      if (!machineAuthOk(req)) return json(res, 401, { error: 'bad token' });
      const b = await readBody(req);
      if (!b.agent && !b.text) return json(res, 400, { error: 'agent or text required' });
      if (b.agent) {
        state.operators[String(b.agent)] = {
          pod: String(b.pod || 'cos'),
          state: ['work', 'idle', 'need', 'error'].includes(b.state) ? b.state : 'work',
          text: String(b.text || ''),
          t: Date.now(),
        };
      }
      bank(b);
      const e = logEvent({
        s: `${b.agent ? b.agent + ' · ' : ''}${b.text || b.state || ''}`,
        kind: b.amount ? 'money' : 'status',
        amount: b.amount || 0,
      });
      saveState();
      return json(res, 200, { ok: true, t: e.t, earned: state.earned, xp: state.xp });
    }

    if (req.method === 'POST' && p === '/api/approval') {
      if (!machineAuthOk(req)) return json(res, 401, { error: 'bad token' });
      const b = await readBody(req);
      if (!b.title) return json(res, 400, { error: 'title required' });
      const a = {
        id: crypto.randomUUID(),
        pod: String(b.pod || ''),
        title: String(b.title),
        detail: String(b.detail || ''),
        amount: Number(b.amount || 0),
        xp: Number(b.xp || 0),
        verb: String(b.verb || 'Approve'),
        callback: b.callback ? String(b.callback) : '',
        t: Date.now(),
      };
      state.approvals.push(a);
      logEvent({ s: `⏳ Needs you: ${a.title}`, kind: 'approval' });
      saveState();
      return json(res, 200, { ok: true, id: a.id });
    }

    const m = p.match(/^\/api\/approval\/([\w-]+)\/(approve|pass)$/);
    if (req.method === 'POST' && m) {
      const [, id, action] = m;
      const idx = state.approvals.findIndex((a) => a.id === id);
      if (idx === -1) return json(res, 404, { error: 'unknown approval' });
      const a = state.approvals.splice(idx, 1)[0];
      if (action === 'approve') {
        bank(a);
        logEvent({
          s: `✓ ${a.title}${a.amount ? ` — $${a.amount} banked` : ' — executed'}`,
          kind: a.amount ? 'money' : 'status',
          amount: a.amount,
        });
      } else {
        logEvent({ s: `— Passed: ${a.title}`, kind: 'status' });
      }
      notifyCallback(a.callback, {
        id: a.id, action, pod: a.pod, title: a.title, amount: a.amount,
      });
      saveState();
      return json(res, 200, { ok: true, action, earned: state.earned, xp: state.xp });
    }

    if (req.method === 'POST' && p === '/api/quests') {
      if (!machineAuthOk(req)) return json(res, 401, { error: 'bad token' });
      const b = await readBody(req);
      if (Array.isArray(b.quests)) {
        state.quests = b.quests.map((q) => ({
          q: String(q.q), done: Number(q.done || 0), of: Number(q.of || 1),
        }));
      }
      if (b.streak !== undefined) state.streak = Number(b.streak);
      saveState();
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET') return serveStatic(res, p);
    return json(res, 405, { error: 'method not allowed' });
  } catch (err) {
    return json(res, 400, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`JARVIS HQ on http://localhost:${PORT}  (data: ${DATA_DIR})`);
  if (!TOKEN) console.log('HQ_TOKEN not set — machine endpoints are open (fine inside Tailscale).');
});
