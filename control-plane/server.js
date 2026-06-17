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
const fs = require('node:fs');
const path = require('node:path');
const DRAFTS_DIR = path.join(__dirname, '..', 'gov-drafts'); // proposal + outreach drafts (read-only)

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
      // EXECUTOR: approving a gov email send IS the human gate firing (doctrine §9 rule 2 — irreversible,
      // behind explicit approval). Auto-send is opt-in via GOV_AUTO_SEND; with it off we dry-run (log +
      // Slack preview) so you SEE exactly what would go out. Lazily imported + never fatal to the response.
      let executed = null;
      if (decision === 'approve') {
        const reqEv = store.getEvent(id);
        // (1) Gov email send.
        try {
          const gov = await import('../pods/gov/sender.mjs');
          const job = gov.approvalToSend(reqEv);
          if (job) {
            const auto = /^(1|true|yes|on)$/i.test(process.env.GOV_AUTO_SEND || '');
            const r = await gov.sendGovEmail({ file: job.file, dryRun: !auto });
            const action = r.sent ? 'email.sent' : (r.ok ? 'email.preview' : 'email.failed');
            store.appendEvent({ kind: 'action', actor: 'GOV-SEND', pod: 'gov', action, reversible: false, status: r.ok ? 'done' : 'error',
              rationale: r.sent ? `Sent "${r.subject}" → ${r.to}` : r.ok ? `Auto-send off (set GOV_AUTO_SEND=1) — previewed "${r.subject}" → ${r.to}` : `Send not done: ${r.reason}`,
              ref: id, payload: { file: job.file, to: r.to || null, sent: !!r.sent, messageId: r.messageId || null } });
            executed = { action, ok: r.ok, sent: !!r.sent, to: r.to || null, reason: r.reason || null };
          }
        } catch (e) {
          store.appendEvent({ kind: 'trace', actor: 'GOV-SEND', pod: 'gov', action: 'executor.error', status: 'error', rationale: e.message, ref: id });
          executed = { error: e.message };
        }
        // (2) Finance: create a Stripe payment link. Auto-create opt-in via FINANCE_AUTO_INVOICE (else dry-run).
        if (!executed) {
          try {
            const fin = await import('../pods/finance/invoice.mjs');
            const spec = fin.invoiceFromApproval(reqEv);
            if (spec) {
              const auto = /^(1|true|yes|on)$/i.test(process.env.FINANCE_AUTO_INVOICE || '');
              if (!auto) {
                store.appendEvent({ kind: 'action', actor: 'LEDGER-01', pod: 'exec', action: 'invoice.preview', reversible: false, status: 'done',
                  rationale: `Auto-create off (set FINANCE_AUTO_INVOICE=1) — would create a $${(spec.cents / 100).toFixed(2)} ${String(spec.currency).toUpperCase()} payment link`, ref: id, payload: { cents: spec.cents } });
                executed = { action: 'invoice.preview', ok: true, created: false };
              } else {
                const r = await fin.createPaymentLink(spec);
                const emailFile = (r.ok && spec.customerEmail) ? fin.writeInvoiceEmail(spec, r.url) : null;
                const action = r.ok ? 'invoice.created' : 'invoice.failed';
                store.appendEvent({ kind: 'action', actor: 'LEDGER-01', pod: 'exec', action, reversible: false, status: r.ok ? 'done' : 'error',
                  rationale: r.ok ? `Created ${r.mode} payment link ($${(spec.cents / 100).toFixed(2)}): ${r.url}` : `Payment link failed: ${r.reason}`,
                  ref: id, payload: { url: r.url || null, id: r.id || null, mode: r.mode || null, emailFile } });
                executed = { action, ok: r.ok, url: r.url || null, reason: r.reason || null, emailFile };
              }
            }
          } catch (e) {
            store.appendEvent({ kind: 'trace', actor: 'LEDGER-01', pod: 'exec', action: 'executor.error', status: 'error', rationale: e.message, ref: id });
            executed = executed || { error: e.message };
          }
        }
      }
      return send(res, 200, { id: rec.id, decision, executed });
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
    if (req.method === 'GET' && p === '/report') {
      const reports = await import('./reports.mjs');
      const q = url.searchParams.get('period') || 'week';
      const period = ['day', 'week', 'month', 'quarter', 'year'].includes(q) ? q : 'week';
      return send(res, 200, reports.buildReport(period));
    }
    // CRM — the subcontractor database (Operations view reads this).
    if (req.method === 'GET' && p === '/crm') {
      try { const conn = await import('../pods/gov/connector.mjs'); return send(res, 200, { subs: conn.loadSubs() }); }
      catch (e) { return send(res, 200, { subs: [], error: e.message }); }
    }
    // Drafts — list + read proposal/outreach text (Operations "Proposals" tab). Read-only, path-guarded.
    if (req.method === 'GET' && p === '/drafts') {
      let files = []; try { files = fs.readdirSync(DRAFTS_DIR).filter((f) => /\.(md|json)$/.test(f)); } catch { /* none yet */ }
      return send(res, 200, { drafts: files });
    }
    if (req.method === 'GET' && p.startsWith('/drafts/')) {
      const name = decodeURIComponent(p.slice('/drafts/'.length));
      if (!name || /[\\/]|\.\./.test(name)) return send(res, 400, { error: 'bad name' });
      try { return send(res, 200, { name, content: fs.readFileSync(path.join(DRAFTS_DIR, name), 'utf8') }); }
      catch { return send(res, 404, { error: 'not found' }); }
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
