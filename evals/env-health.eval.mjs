// Regression suite for the credential/env footgun detector (control-plane/env-health.mjs).
// The point: when a var is in .env but not injected into the container, Jarvis says so by name, with the
// compose fix — instead of a dead-end "not connected" that sends the operator hunting for hours (2026-07-24).

import { checkEnv, envHealth, missingHint, credError } from '../control-plane/env-health.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const REQ = [
  { name: 'PERSONAL_GMAIL_APP_PASSWORD', feature: 'personal inbox triage' },
  { name: 'NOTION_API_KEY', feature: 'Notion sync', optional: true },
];

export default {
  agent: 'env-health',
  cases: [
    { name: 'checkEnv flags a required var as missing when absent from the (container) env',
      run: () => { const r = checkEnv({}, REQ); const p = r.find((x) => x.name === 'PERSONAL_GMAIL_APP_PASSWORD'); return ok(p && p.present === false, JSON.stringify(p)); } },
    { name: 'checkEnv sees a var that IS injected',
      run: () => { const r = checkEnv({ PERSONAL_GMAIL_APP_PASSWORD: 'abcd efgh' }, REQ); return ok(r[0].present === true); } },
    { name: 'blank/whitespace value counts as NOT set (the real failure mode)',
      run: () => { const r = checkEnv({ PERSONAL_GMAIL_APP_PASSWORD: '   ' }, REQ); return ok(r[0].present === false); } },
    { name: 'missingHint names the compose environment:-block fix explicitly',
      run: () => { const h = missingHint('PERSONAL_GMAIL_APP_PASSWORD'); return ok(/environment: block/.test(h) && /docker-compose/.test(h) && /PERSONAL_GMAIL_APP_PASSWORD/.test(h), h); } },
    { name: 'envHealth: a missing REQUIRED var trips warnCount; a missing OPTIONAL one does not',
      run: () => { const h = envHealth({}, REQ); return ok(h.ok === false && h.warnCount === 1 && h.missing.length === 2, JSON.stringify({ ok: h.ok, warn: h.warnCount, miss: h.missing.length })); } },
    { name: 'envHealth: all present → ok true, no warnings',
      run: () => { const h = envHealth({ PERSONAL_GMAIL_APP_PASSWORD: 'x', NOTION_API_KEY: 'y' }, REQ); return ok(h.ok === true && h.warnCount === 0); } },
    { name: 'credError: returns the named fix when missing, null when present',
      run: () => ok(/environment: block/.test(credError('personal triage', 'PERSONAL_GMAIL_APP_PASSWORD', {}) || '') && credError('x', 'PERSONAL_GMAIL_APP_PASSWORD', { PERSONAL_GMAIL_APP_PASSWORD: 'set' }) === null) },
  ],
};
