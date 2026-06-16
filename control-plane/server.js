// control-plane/server.js — the surface-agnostic CONTROL PLANE (doctrine §4, handoff "First task").
// The system of record. HQ, Slack, and the Companion are all CLIENTS of this; none is load-bearing.
// Dependency-free (Node builtins only) so it runs identically on Windows dev and node:20-alpine on the NAS.
//
// Endpoints:
//   GET  /health
//   POST /events                       log an immutable action/trace   → { id }
//   GET  /events?pod=&kind=&since=      read the log (debug/dashboard)
//   GET  /approvals/pending            open approval requests
//   POST /approvals/:id  {decision}    approve | edit | pass  (the one gate all UIs share)
//   POST /command        {text,source} operator instruction in, from any surface
//   GET  /kpis                          Layer-1 (per pod) + Layer-2 (system) metrics
//   POST /spend/check    {amountUsd}    DETERMINISTIC cap gate — money-moving calls must pass first
//   GET  /state                         summary for dashboards
'use strict';
const http = require('node:http');

const PORT = Number(process.env.CONTROL_PLANE_PORT || 8787);
const ACTION_CAP = Number(process.env.SPEND_ACTION_CAP_USD || 2);
const DAILY_CAP = Number(process.env.SPEND_DAILY_CAP_USD || 5);

// load the ESM modules (store/spend/kpis) from this CommonJS server
let store, spend, kpis;
async function load() {
  store = await import('./store.mjs');
  spend = await import('./spend.mjs');
  kpis = await import('./kpis.mjs');
}

function send(res, code, body) {
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(s);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const ch = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > 1e6) { req.destroy(); reject(new Error('too large')); } ch.push(c); });
    req.on('end', () => { try { resolve(ch.length ? JSON.parse(Buffer.concat(ch)) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true, caps: { action: ACTION_CAP, daily: DAILY_CAP } });

    if (req.method === 'POST' && p === '/events') {
      const b = await readBody(req);
      if (b.idempotency_key && store.seenIdempotencyKey(b.idempotency_key)) return send(res, 200, { duplicate: true });
      const rec = store.appendEvent(b);
      return send(res, 201, { id: rec.id, ts: rec.ts });
    }
    if (req.method === 'GET' && p === '/events') {
      const f = { pod: url.searchParams.get('pod') || undefined, kind: url.searchParams.get('kind') || undefined, since: url.searchParams.get('since') || undefined };
      return send(res, 200, store.readEvents(f).slice(-200));
    }
    if (req.method === 'GET' && p === '/approvals/pending') return send(res, 200, store.pendingApprovals());
    if (req.method === 'POST' && p.startsWith('/approvals/')) {
      const id = p.split('/')[2];
      const b = await readBody(req);
      const decision = ['approve', 'edit', 'pass'].includes(b.decision) ? b.decision : null;
      if (!decision) return send(res, 400, { error: 'decision must be approve|edit|pass' });
      const rec = store.appendEvent({ kind: 'approval.decision', actor: 'operator', pod: b.pod || 'system', action: decision, ref: id, payload: { decision, note: b.note || '' } });
      return send(res, 200, { id: rec.id, decision });
    }
    if (req.method === 'POST' && p === '/command') {
      const b = await readBody(req);
      if (!b.text) return send(res, 400, { error: 'text required' });
      const rec = store.appendEvent({ kind: 'command', actor: 'operator', pod: 'chief-of-staff', action: 'command', payload: { text: b.text, source: b.source || 'api' } });
      // Chief-of-Staff router classifies + dispatches + gates. Loaded lazily so the control-plane still
      // boots if the pod is absent; failures are logged, never fatal (doctrine §11 graceful failure).
      let routing = null;
      try {
        const cos = await import('../pods/chief-of-staff/router.mjs');
        routing = await cos.routeCommand({ text: b.text, source: b.source || 'api', commandId: rec.id, store, anthropicKey: process.env.ANTHROPIC_API_KEY });
      } catch (e) {
        store.appendEvent({ kind: 'trace', actor: 'chief-of-staff', pod: 'chief-of-staff', action: 'router.error', status: 'error', rationale: e.message, ref: rec.id });
      }
      return send(res, 201, { id: rec.id, routing });
    }
    if (req.method === 'GET' && p === '/kpis') return send(res, 200, kpis.computeKpis());

    if (req.method === 'GET' && p === '/roster') {
      const org = await import('../pods/org.mjs');
      return send(res, 200, { roster: org.ROSTER, pods: org.POD_IDS });
    }

    if (req.method === 'POST' && p === '/spend/check') {
      const b = await readBody(req);
      const result = spend.checkSpend({
        amountUsd: b.amountUsd,
        todaySpentUsd: store.todaySpendUsd(),
        actionCapUsd: b.actionCapUsd != null ? Number(b.actionCapUsd) : ACTION_CAP,
        dailyCapUsd: b.dailyCapUsd != null ? Number(b.dailyCapUsd) : DAILY_CAP,
      });
      // log the decision itself (denials are signal too) — but never the spend; caller logs cost after acting
      store.appendEvent({ kind: 'action', actor: b.actor || 'unknown', pod: b.pod || 'system', action: 'spend.check',
        status: result.allow ? 'done' : 'error', rationale: result.reason, payload: { amountUsd: b.amountUsd, allow: result.allow } });
      return send(res, result.allow ? 200 : 402, result);
    }
    if (req.method === 'GET' && p === '/state') {
      return send(res, 200, { pending: store.pendingApprovals(), recent: store.readEvents().slice(-20).reverse(), kpis: kpis.computeKpis() });
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) { return send(res, 500, { error: e.message }); }
});

load().then(() => server.listen(PORT, () => {
  console.log(`JARVIS control-plane on http://localhost:${PORT}`);
  console.log(`  spend caps: $${ACTION_CAP}/action, $${DAILY_CAP}/day (override via SPEND_ACTION_CAP_USD / SPEND_DAILY_CAP_USD)`);
  console.log('  event store: control-plane/data/events.jsonl (append-only, system of record)');
})).catch((e) => { console.error('control-plane failed to start:', e); process.exit(1); });
