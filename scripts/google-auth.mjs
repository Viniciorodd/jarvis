// One-time Google connect for the companion: Gmail READ-ONLY + Calendar READ/WRITE (events) + Tasks
// read-only. Prereq: a Google "Desktop app" OAuth client — put its id/secret in .env as
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (see docs/google-setup.md). Then run: node scripts/google-auth.mjs
// It opens your browser, you approve, and it saves GOOGLE_REFRESH_TOKEN into .env. Re-run this whenever
// the scopes change (e.g. after enabling calendar write) so the new permission is granted.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ENV_FILE = path.join(ROOT, '.env');
const env = (k) => { try { const m = fs.readFileSync(ENV_FILE, 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm')); return m ? m[1].trim() : (process.env[k] || ''); } catch { return process.env[k] || ''; } };

const CLIENT_ID = env('GOOGLE_CLIENT_ID');
const CLIENT_SECRET = env('GOOGLE_CLIENT_SECRET');
// Loopback redirect port. "Desktop app" OAuth clients accept http://localhost:<any-port>, so this can be
// any free port — Windows reserves shifting dynamic ranges (Hyper-V/WSL), so make it overridable and pick
// a default outside the usual reserved blocks. If you hit "EACCES", set GOOGLE_AUTH_PORT to another port.
const PORT = Number(process.env.GOOGLE_AUTH_PORT) || 8723;
const REDIRECT = `http://localhost:${PORT}`;
// gmail.readonly (she reads, never sends) · calendar.events (read + add/edit/delete events, NOT calendar
// management) · tasks.readonly. Least privilege for what the cockpit needs.
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks.readonly';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env. Create a "Desktop app" OAuth client first (see docs/google-setup.md).');
  process.exit(1);
}

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPES,
  access_type: 'offline', prompt: 'consent',
}).toString();

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  if (!code) { res.writeHead(400); return res.end('No code.'); }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
    });
    const d = await r.json();
    if (!d.refresh_token) throw new Error('No refresh_token returned: ' + JSON.stringify(d).slice(0, 200));
    // append/replace GOOGLE_REFRESH_TOKEN in .env
    let envText = ''; try { envText = fs.readFileSync(ENV_FILE, 'utf8'); } catch { /* */ }
    envText = envText.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, '').replace(/\n+$/,'\n');
    fs.writeFileSync(ENV_FILE, envText + (envText.endsWith('\n') || envText === '' ? '' : '\n') + 'GOOGLE_REFRESH_TOKEN=' + d.refresh_token + '\n');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h2 style="font-family:sans-serif">✅ Jarvis is connected to Google.</h2><p>You can close this tab and return to the terminal.</p>');
    console.log('\n✅ Saved GOOGLE_REFRESH_TOKEN to .env. Restart the companion — she can now read your email + calendar.');
  } catch (e) { res.writeHead(500); res.end('Error: ' + e.message); console.error(e.message); }
  finally { setTimeout(() => { server.close(); process.exit(0); }, 500); }
});

server.listen(PORT, () => {
  console.log('\n========================================================================');
  console.log('COPY this URL and paste it into your browser (most reliable):\n');
  console.log(authUrl);
  console.log('\n========================================================================\n');
  // Best-effort auto-open. On Windows use PowerShell Start-Process — `cmd start` mangles the & in the URL.
  const opener = process.platform === 'win32'
    ? ['powershell', ['-NoProfile', '-Command', `Start-Process '${authUrl}'`]]
    : process.platform === 'darwin' ? ['open', [authUrl]] : ['xdg-open', [authUrl]];
  try { spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' }).unref(); } catch { /* paste the URL above */ }
});
