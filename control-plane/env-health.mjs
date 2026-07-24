// env-health.mjs — kills the footgun that ate an evening (2026-07-24): a credential sits in the NAS .env
// but the container never receives it, because docker-compose injects ONLY the vars named in its
// `environment:` block. The feature then fails with a dead-end error ("inbox not connected") while the
// value is right there in .env. This surfaces the real reason — by name, with the exact fix — at startup
// and via an endpoint, so nobody hunts for hours again. Pure + eval-pinned.

// The integration credentials each feature depends on. `optional` = don't shout if absent (not every
// machine runs every feature); it's still reported so a missing one is always VISIBLE, never silent.
export const REQUIRED_ENV = [
  { name: 'ANTHROPIC_API_KEY', feature: 'Claude brain (big tasks)', optional: true },
  { name: 'PERSONAL_GMAIL_USER', feature: 'personal inbox triage' },
  { name: 'PERSONAL_GMAIL_APP_PASSWORD', feature: 'personal inbox triage' },
  { name: 'RODGATE_GMAIL_USER', feature: 'rodgate inbox + gov outreach send' },
  { name: 'RODGATE_GMAIL_APP_PASSWORD', feature: 'rodgate inbox + gov outreach send' },
  { name: 'TELEGRAM_BOT_TOKEN', feature: 'phone notifications + approvals' },
  { name: 'TELEGRAM_CHAT_ID', feature: 'phone notifications' },
  { name: 'NOTION_API_KEY', feature: 'Notion company brain sync', optional: true },
  { name: 'GOOGLE_PLACES_API_KEY', feature: 'gov sub discovery', optional: true },
];

const set = (envObj, name) => !!(envObj && envObj[name] && String(envObj[name]).trim());

// PURE: the exact, machine-aware message for a missing var — names the compose footgun so nobody hunts.
export function missingHint(name) {
  return `${name} is not set in this container. If it IS in your .env, it also must be listed under the service's `
    + `environment: block in docker-compose.yml — compose injects ONLY the vars it names. Add \`${name}: \${${name}}\` `
    + `to the control-plane service, then \`docker compose up -d --force-recreate control-plane\`.`;
}

// PURE: per-var presence report. Eval-pinned.
export function checkEnv(envObj = process.env, required = REQUIRED_ENV) {
  return required.map((r) => ({ name: r.name, feature: r.feature, optional: !!r.optional, present: set(envObj, r.name) }));
}

// PURE: the whole health summary. `missing` carries the fix; `warn` = required (non-optional) missing.
export function envHealth(envObj = process.env, required = REQUIRED_ENV) {
  const rows = checkEnv(envObj, required);
  const missing = rows.filter((r) => !r.present).map((r) => ({ name: r.name, feature: r.feature, optional: r.optional, hint: missingHint(r.name) }));
  const warn = missing.filter((m) => !m.optional);
  return { ok: warn.length === 0, present: rows.filter((r) => r.present).map((r) => r.name), missing, warnCount: warn.length };
}

// PURE: a one-liner a caller can throw/return when a specific feature's var is missing — always names the fix.
export function credError(feature, name, envObj = process.env) {
  return set(envObj, name) ? null : `${feature} unavailable — ${missingHint(name)}`;
}
