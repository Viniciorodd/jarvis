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
      // Idempotency: an approval can be acted on from BOTH the companion and HQ-online. If it was already
      // decided, don't re-run the executor (never double-send / double-charge).
      if (store.readEvents({ kind: 'approval.decision' }).some((e) => e.ref === id)) return send(res, 200, { duplicate: true, id });
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
              ref: id, payload: { file: job.file, to: r.to || null, sent: !!r.sent, messageId: r.messageId || null, dryRun: !!r.dryRun, status: r.status || null } });
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

    // Vault audit — who can read what (NEVER returns a secret value). Surfaces least-privilege (directive #3).
    if (req.method === 'GET' && p === '/vault/audit') {
      const vault = await import('./vault.mjs');
      return send(res, 200, vault.auditAcl());
    }
    // Autonomy ladder (doctrine §8): each workflow's level + metrics + promotion recommendation.
    if (req.method === 'GET' && p === '/autonomy') {
      const auto = await import('./autonomy.mjs');
      let evalsByAgent = {};
      try { const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'evals', '.results.json'), 'utf8')); for (const x of r.agents || []) evalsByAgent[x.agent] = { pass: x.pass, total: x.total }; } catch { /* */ }
      return send(res, 200, auto.autonomyReport(store.readEvents(), evalsByAgent));
    }
    // Operator sets a workflow's autonomy level (the deliberate act of granting/revoking autonomy).
    if (req.method === 'POST' && p === '/autonomy/level') {
      const b = await readBody(req);
      const auto = await import('./autonomy.mjs');
      const lvl = auto.setLevel(b.id, b.level);
      if (lvl == null) return send(res, 400, { error: 'unknown workflow id' });
      store.appendEvent({ kind: 'meta', actor: 'operator', pod: 'system', action: 'autonomy.set', rationale: `${b.id} → L${lvl}`, payload: { id: b.id, level: lvl } });
      return send(res, 200, { ok: true, id: b.id, level: lvl });
    }

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
    // Maintenance jobs — deterministic, scheduler-driven, no LLM (the scheduler POSTs these directly).
    // EOD daily log → the Notion "Company Brain" Daily DB (money in / AI spend / actions / needs-you).
    if (req.method === 'POST' && p === '/maintenance/eod-log') {
      const reports = await import('./reports.mjs');
      const rep = reports.buildReport('day');
      const today = new Date().toISOString().slice(0, 10);
      let synced;
      try {
        const N = await import('../pods/notion.mjs');
        const r = await N.logDaily({ day: today, date: new Date().toISOString(), summary: rep.text, moneyIn: rep.totals.revenue_usd, aiSpend: rep.totals.spend_usd, actions: rep.totals.actions, needsYou: rep.needs_you.length });
        synced = r && (r.error || r.skip) ? { ok: false, reason: r.error || r.skip } : { ok: true };
      } catch (e) { synced = { ok: false, reason: e.message }; }
      store.appendEvent({ kind: 'action', actor: 'EXEC-01', pod: 'exec', action: 'daily.logged', status: synced.ok ? 'done' : 'error', rationale: `EOD log${synced.ok ? ' → Notion' : ' (Notion skip)'}: ${rep.text}`, payload: { day: today, synced, totals: rep.totals, needsYou: rep.needs_you.length } });
      return send(res, 200, { ok: true, day: today, report: rep.text, synced });
    }
    // Kill switch — pause/resume ALL proactive behavior (the scheduler checks this every tick).
    if (p === '/pause') {
      const P = await import('../pods/pause.mjs');
      if (req.method === 'GET') { const cur = P.getPause(); return send(res, 200, { ...cur, active: P.pauseActive(cur) }); }
      if (req.method === 'POST') {
        const b = await readBody(req);
        const rec = P.setPause({ paused: !!b.paused, minutes: Number(b.minutes) || 0 });
        store.appendEvent({ kind: 'meta', actor: 'operator', pod: 'exec', action: rec.paused ? 'proactive.pause' : 'proactive.resume', status: 'done', rationale: rec.paused ? `Proactive behavior PAUSED${rec.until ? ' until ' + rec.until : ''} (kill switch)` : 'Proactive behavior resumed', payload: rec });
        return send(res, 200, { ...rec, active: P.pauseActive(rec) });
      }
    }
    // Inbox triage → read + classify recent mail (ONE claudeBatch call), digest to the phone, gated cleanup.
    if (req.method === 'POST' && p === '/maintenance/inbox-triage') {
      const b = await readBody(req);
      let result;
      try { const t = await import('../pods/inbox/triage.mjs'); result = await t.runTriage({ account: b.account || 'personal', max: Number(b.max) || 40 }); }
      catch (e) { result = { ok: false, note: e.message }; }
      return send(res, 200, result);
    }
    // Deals — the gov middleman DEAL LEDGER (Deal Room UI reads this: stages, gaps, pricing, whose move).
    if (req.method === 'GET' && p === '/deals') {
      try { const D = await import('../pods/gov/deals.mjs'); return send(res, 200, D.dealsBoard()); }
      catch (e) { return send(res, 200, { deals: [], error: e.message }); }
    }
    // Deadline radar → remind before a pursued bid's response deadline closes (idempotent; reminder = event).
    if (req.method === 'POST' && p === '/maintenance/deadline-check') {
      const b = await readBody(req);
      let result;
      try {
        const dl = await import('../pods/gov/deadlines.mjs');
        result = await dl.runDeadlineRadar({ withinDays: Number(b.withinDays) || Number(process.env.DEADLINE_WINDOW_DAYS) || 7 });
      } catch (e) { result = { ok: false, note: e.message }; }
      return send(res, 200, result);
    }
    // Tax deadline radar → remind before a statutory/estimate deadline closes (final-stage only; idempotent).
    if (req.method === 'POST' && p === '/maintenance/tax-deadline-check') {
      const b = await readBody(req);
      let result;
      try {
        const dl = await import('../pods/tax/deadlines.mjs');
        result = await dl.runTaxDeadlineRadar({ withinDays: Number(b.withinDays) || 3 });
      } catch (e) { result = { ok: false, note: e.message }; }
      return send(res, 200, result);
    }
    // Sub ladder radar → when the PRIMARY sub has gone silent past the wait window (GOV_SUB_WAIT_DAYS),
    // activate the backup so a bid never stalls on one unresponsive vendor before a federal deadline.
    // Deterministic, no LLM. Doctrine-safe by construction: the ladder closes itself the moment any sub
    // responds (so a backup is never chased after we have our sub), a backup must clear the SAME SAM
    // exclusion hard-stop, and activation only DRAFTS a human-gated outreach — it never auto-sends.
    if (req.method === 'POST' && p === '/maintenance/sub-ladder-check') {
      let result;
      try {
        const sl = await import('../pods/gov/sub-ladder.mjs');
        result = await sl.runSubLadder({});
      } catch (e) { result = { ok: false, note: e.message }; }
      return send(res, 200, result);
    }
    // Gov growth digest → ONE calm weekday-morning Telegram with the freshest quick wins + teaming
    // primes (pods/gov/digest.mjs). Deduped via gov.digest.sent events (payload.date === today) so at
    // most ONE digest goes out per calendar day even if the scheduler fires twice; weekends rest.
    // Best-effort: Telegram unconfigured → report it WITHOUT logging the sent event (so the first
    // configured morning still sends); never throws.
    if (req.method === 'POST' && p === '/maintenance/gov-growth-digest') {
      try {
        const now = new Date();
        if (now.getDay() === 0 || now.getDay() === 6) return send(res, 200, { ok: true, skipped: 'weekend' });
        const today = now.toISOString().slice(0, 10);
        if (store.readEvents({ kind: 'gov.digest.sent' }).some((e) => e.payload && e.payload.date === today))
          return send(res, 200, { ok: true, skipped: 'already sent today' });
        const lib = await import('../pods/lib.mjs');
        if (!lib.env('TELEGRAM_BOT_TOKEN') || !lib.env('TELEGRAM_CHAT_ID')) return send(res, 200, { ok: false, error: 'telegram not configured' });
        const dig = await import('../pods/gov/digest.mjs');
        const { text, counts } = await dig.buildGrowthDigest({ now });
        lib.notifyTelegram(text);
        store.appendEvent({ kind: 'gov.digest.sent', actor: 'SAM-SCOUT', pod: 'gov', action: 'gov.digest.sent', status: 'done',
          rationale: `Gov growth digest pushed (${counts.quickwins} quick wins · ${counts.teaming} teaming primes)`, payload: { date: today, counts } });
        return send(res, 200, { ok: true, sent: true, date: today, counts });
      } catch (e) { return send(res, 200, { ok: false, note: e.message }); }
    }
    // Approvals nudge → business-hours "decisions waiting on YOU" ping (the operator's #1 need is
    // knowing what's HIS to do — this brings the open gates to him instead of hoping he opens the app).
    // The scheduler fires it at 12:00 and 16:00 LOCAL (schedule.json approvals-nudge-midday/-afternoon);
    // the route enforces the calm contract: weekdays only, SILENT when no gates are open, and at most
    // TWICE per calendar day — deduped via approvals.nudged events on payload.date + payload.slot,
    // where slot = hour < 14 ? 'midday' : 'afternoon' (two slots ⇒ two nudges max, even if the
    // scheduler re-fires). Push-only + truthful: it says "waiting on YOUR approval" — nothing is sent
    // by this route; approving on Telegram buttons / HQ / cockpit is still the one human gate that
    // fires an executor (doctrine §9 rule 2). Best-effort: Telegram unconfigured → report WITHOUT
    // logging the nudged event (the first configured slot still fires); never throws.
    if (req.method === 'POST' && p === '/maintenance/approvals-nudge') {
      try {
        const now = new Date();
        if (now.getDay() === 0 || now.getDay() === 6) return send(res, 200, { ok: true, skipped: 'weekend' });
        const pending = store.pendingApprovals();
        if (!pending.length) return send(res, 200, { ok: true, skipped: 'no gates' });
        const today = now.toISOString().slice(0, 10);
        const slot = now.getHours() < 14 ? 'midday' : 'afternoon';
        if (store.readEvents({ kind: 'approvals.nudged' }).some((e) => e.payload && e.payload.date === today && e.payload.slot === slot))
          return send(res, 200, { ok: true, skipped: 'already nudged this slot', slot });
        const lib = await import('../pods/lib.mjs');
        if (!lib.env('TELEGRAM_BOT_TOKEN') || !lib.env('TELEGRAM_CHAT_ID')) return send(res, 200, { ok: false, error: 'telegram not configured' });
        const clip = (s) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > 60 ? s.slice(0, 60) + '…' : s; };
        const lines = pending.slice(0, 3).map((a) => { const r = clip(a.rationale); return `• ${a.action || 'decision'}${r ? ' — ' + r : ''}`; });
        const text = [`🟡 ${pending.length} decision${pending.length === 1 ? '' : 's'} waiting on you`, ...lines,
          'Open Telegram ⏫ (buttons above) or the cockpit to approve.'].join('\n');
        lib.notifyTelegram(text);
        store.appendEvent({ kind: 'approvals.nudged', actor: 'MAILROOM-01', pod: 'chief-of-staff', action: 'approvals.nudged', status: 'done',
          rationale: `Nudged the operator (${slot}): ${pending.length} decision(s) waiting on his approval (nothing sent)`, payload: { date: today, slot, count: pending.length } });
        return send(res, 200, { ok: true, sent: true, date: today, slot, count: pending.length });
      } catch (e) { return send(res, 200, { ok: false, note: e.message }); }
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
    // Write a draft (used by the redraft flow). Path-guarded to gov-drafts/, text formats only.
    if (req.method === 'POST' && p.startsWith('/drafts/')) {
      const name = decodeURIComponent(p.slice('/drafts/'.length));
      if (!name || /[\\/]|\.\./.test(name) || !/\.(md|json|txt)$/.test(name)) return send(res, 400, { error: 'bad name' });
      const b = await readBody(req);
      if (typeof b.content !== 'string') return send(res, 400, { error: 'content (string) required' });
      try {
        fs.mkdirSync(DRAFTS_DIR, { recursive: true });
        fs.writeFileSync(path.join(DRAFTS_DIR, name), b.content);
        store.appendEvent({ kind: 'action', actor: 'GOV-ANALYST', pod: 'gov', action: 'proposal.redraft', reversible: true, rationale: `Proposal revised: ${name}`, payload: { file: 'gov-drafts/' + name, bytes: b.content.length } });
        return send(res, 200, { ok: true, name, bytes: b.content.length });
      } catch (e) { return send(res, 500, { error: e.message }); }
    }
    // Pursue one opportunity → draft a proposal for it now (gated). Deterministic dispatch to the gov pod.
    if (req.method === 'POST' && p === '/maintenance/pursue') {
      const b = await readBody(req);
      if (!b.noticeId && !(b.op && b.op.title)) return send(res, 400, { error: 'noticeId or op required' });
      let result;
      try { const w = await import('../pods/gov/worker.mjs'); result = await w.pursueOpportunity({ op: b.op || { noticeId: b.noticeId }, sc: b.sc || null }); }
      catch (e) { result = { ok: false, error: e.message }; }
      return send(res, 200, result);
    }
    // Reach out to one CRM prospect → enrich + draft a teaming intro + gated send.
    if (req.method === 'POST' && p === '/maintenance/reach-sub') {
      const b = await readBody(req);
      if (!b.id) return send(res, 400, { error: 'id required' });
      let result;
      try { const c = await import('../pods/gov/connector.mjs'); result = await c.reachOutToSub({ id: b.id }); }
      catch (e) { result = { ok: false, error: e.message }; }
      return send(res, 200, result);
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
