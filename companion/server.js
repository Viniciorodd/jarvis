// JARVIS Companion — Phase A core. Zero-dependency Node server that serves the orb UI
// and proxies chat to Claude (the brain). The API key stays server-side, never in the page.
// Next phases wrap this in Electron and add voice (ElevenLabs/Deepgram/Picovoice) + tools.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.COMPANION_PORT || 8095);
const PUBLIC_DIR = path.join(__dirname, 'public');

// --- load ANTHROPIC_API_KEY from env or the project .env (gitignored) ---
let API_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!API_KEY) {
  try {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (m) API_KEY = m[1].trim();
  } catch { /* none */ }
}

const SYSTEM = `You are JARVIS — Vinicio's voice-first AI chief of staff, modeled on Iron Man's Jarvis but warmer and more human. You help him run his businesses (a government-contracting LLC "Rodgate", Fiverr creative services, and more) and his day.

Voice & style: concise, calm, sharp, a little wit. You are spoken aloud, so keep replies SHORT — 1-3 sentences unless he asks for detail. No markdown, no bullet dumps when speaking; talk like a person. Address him directly.

Right now you are in early form: you can talk and think, but your hands (file control, calendar, email, Stripe, the agent pods) come online over the next build phases. If he asks you to DO something you can't yet (create a file, send an email, move money), say plainly that that power isn't wired up yet and that it's coming, and offer what you CAN do — think it through with him, draft it, or note it. Never pretend to have done something you didn't.`;

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 1e6) { req.destroy(); reject(new Error('too large')); } chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    if (!API_KEY) return send(res, 500, JSON.stringify({ error: 'No ANTHROPIC_API_KEY found (env or ../.env).' }));
    try {
      const { messages } = await readBody(req);
      if (!Array.isArray(messages) || !messages.length) return send(res, 400, JSON.stringify({ error: 'messages required' }));
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          system: SYSTEM,
          messages: messages.slice(-20), // keep last 20 turns
        }),
      });
      if (!r.ok) return send(res, 502, JSON.stringify({ error: `Claude ${r.status}: ${(await r.text()).slice(0, 300)}` }));
      const data = await r.json();
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      return send(res, 200, JSON.stringify({ text, usage: data.usage }));
    } catch (e) {
      return send(res, 500, JSON.stringify({ error: e.message }));
    }
  }

  // static
  let rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 404, 'no');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
});

server.listen(PORT, () => {
  console.log(`JARVIS Companion on http://localhost:${PORT}`);
  if (!API_KEY) console.log('  (no API key found — chat disabled until ANTHROPIC_API_KEY is set)');
});
