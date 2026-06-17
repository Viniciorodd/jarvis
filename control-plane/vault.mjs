// Credential broker / vault (doctrine directive #3: least privilege, one scoped credential per agent,
// secrets never sprayed across every agent). Instead of each pod reading process.env directly, it asks
// the broker: getSecret(agent, name). The broker checks a per-agent ACL and DENIES + logs anything an
// agent isn't entitled to — so the thumbnail agent literally cannot read a finance/bank key in code.
//
// Secrets load from an encrypted vault.enc (AES-256-GCM, unlocked by VAULT_KEY) if present; otherwise
// from .env (dev mode — fine on a private Tailscale box, but encrypt for production).
//   node control-plane/vault.mjs encrypt   # .env -> control-plane/vault.enc (then you can delete keys from .env)
//   node control-plane/vault.mjs audit     # print who can access what

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(DIR);
const ENV_FILE = path.join(ROOT, '.env');
const ENC_FILE = path.join(DIR, 'vault.enc');

// ── per-agent ACL — the heart of least privilege. Wildcards (PREFIX_*) allowed. ──────────────────
// Everyone who reasons gets ANTHROPIC_API_KEY; ONLY the Fiverr creative gets image-gen keys; ONLY the
// CFO (LEDGER-01) gets the Stripe key — the scout/analyst/creative literally cannot read it in code.
export const ACL = {
  'EXEC-01': ['ANTHROPIC_API_KEY'],
  'LEDGER-01': ['ANTHROPIC_API_KEY', 'STRIPE_API_KEY'], // ONLY the CFO can read the Stripe key
  'MAILROOM-01': ['ANTHROPIC_API_KEY'],
  'SAM-SCOUT': ['SAM_API_KEY', 'ANTHROPIC_API_KEY'],
  'GOV-ANALYST': ['ANTHROPIC_API_KEY'],
  'CONNECT-01': ['ANTHROPIC_API_KEY'],
  'STUDIO-01': ['ANTHROPIC_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'FAL_KEY', 'FAL_API_KEY', 'OPENAI_API_KEY', 'MEDIA_PROVIDER', 'MEDIA_BUDGET_USD'],
  'RECON-DEV': ['ANTHROPIC_API_KEY'],
  'WATCHTOWER-01': ['ANTHROPIC_API_KEY'],
  'ESTATE-01': ['ANTHROPIC_API_KEY'],
  'COUNSEL-01': ['ANTHROPIC_API_KEY'],
  'CONCIERGE-01': ['ANTHROPIC_API_KEY'],
  'OPERATOR-01': ['ANTHROPIC_API_KEY'],
  'chief-of-staff': ['ANTHROPIC_API_KEY'], // the router's classifier
  'scheduler': [], // needs no secret — it only posts /command
};

// PURE: is `name` allowed for `agent` under `acl`? Supports PREFIX_* wildcards. Eval-tested.
export function isAllowed(agent, name, acl = ACL) {
  const allow = acl[agent];
  if (!allow) return false;
  return allow.some((p) => (p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : p === name));
}

// ── secret loading (encrypted vault.enc preferred; .env fallback) ────────────────────────────────
function keyFrom(passphrase) { return crypto.createHash('sha256').update(String(passphrase)).digest(); }
function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) out[m[1]] = m[2].trim(); }
  return out;
}
let SECRETS = null, SOURCE = 'none';
function load() {
  if (SECRETS) return SECRETS;
  const vk = process.env.VAULT_KEY;
  if (vk && fs.existsSync(ENC_FILE)) {
    try {
      const { iv, tag, data } = JSON.parse(fs.readFileSync(ENC_FILE, 'utf8'));
      const d = crypto.createDecipheriv('aes-256-gcm', keyFrom(vk), Buffer.from(iv, 'base64'));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      SECRETS = JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
      SOURCE = 'vault.enc'; return SECRETS;
    } catch (e) { console.error('vault: failed to decrypt vault.enc —', e.message); }
  }
  SECRETS = { ...parseEnv(fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : ''), ...process.env };
  SOURCE = fs.existsSync(ENC_FILE) ? '.env (vault.enc present but VAULT_KEY unset)' : '.env';
  return SECRETS;
}

async function logDenial(agent, name) {
  const cp = (process.env.CONTROL_PLANE_URL || 'http://localhost:8787').replace(/\/$/, '');
  try { await fetch(cp + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'trace', actor: agent, pod: 'system', action: 'vault.denied', status: 'error', rationale: `least-privilege: ${agent} denied ${name}` }) }); } catch { /* */ }
}

// The one way agents get secrets. Throws (and logs) on an unauthorized request.
export function getSecret(agent, name) {
  const secrets = load();
  if (!isAllowed(agent, name)) { logDenial(agent, name); throw new Error(`vault: "${agent}" is not authorized for ${name} (least privilege — doctrine #3)`); }
  return secrets[name] || '';
}
export const vaultSource = () => SOURCE;

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('vault.mjs')) {
  const cmd = process.argv[2];
  if (cmd === 'encrypt') {
    const vk = process.env.VAULT_KEY; if (!vk) { console.error('set VAULT_KEY first (a long passphrase)'); process.exit(1); }
    const secrets = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', keyFrom(vk), iv);
    const data = Buffer.concat([c.update(Buffer.from(JSON.stringify(secrets), 'utf8')), c.final()]);
    fs.writeFileSync(ENC_FILE, JSON.stringify({ iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') }, null, 0));
    console.log(`✓ encrypted ${Object.keys(secrets).length} secrets → control-plane/vault.enc. Keep VAULT_KEY safe; you can now remove sensitive lines from .env.`);
  } else if (cmd === 'audit') {
    console.log('Per-agent credential access (least privilege):');
    for (const [a, list] of Object.entries(ACL)) console.log('  ' + a.padEnd(14), '→', list.length ? list.join(', ') : '(no secrets)');
  } else {
    console.log('usage: node control-plane/vault.mjs [encrypt|audit]');
  }
}
