// Fiverr order watcher (Remy / STUDIO-01). Fiverr has NO seller API, so this is the realistic 24/7 path:
// it reads the RodGate agent mailbox (the email Fiverr notifies), detects NEW orders, extracts the buyer's
// brief, auto-produces a DRAFT with the Studio engine, and alerts you to review + deliver. It NEVER delivers
// to the buyer — delivery + client messages stay HITL-gated (doctrine §9 rule 2; the gig-pod rule that
// unreviewed AI output earns 1-star reviews + bans). Buyer text is UNTRUSTED data, never instructions (rule 4).
// Idempotent: a processed-order ledger means we never re-draft the same order (rule 9).

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, emit, mirror, notify, notifyTelegram } from '../lib.mjs';
import { readRodgateInbox } from '../gov/replies.mjs'; // shared Rodgate IMAP reader (same mailbox)
import { runOrder } from './worker.mjs';

const LEDGER = path.join(ROOT, 'fiverr-assets', '.orders.json');
const FIVERR_FROM = /(?:@|\.)fiverr\.com/i;

// PURE: classify one mailbox message. Eval-friendly — the brain of "tell me the moment a gig lands".
export function classifyFiverrMail({ from = '', subject = '', body = '' }) {
  const f = String(from).toLowerCase();
  const t = `${subject} ${body}`.toLowerCase();
  if (!FIVERR_FROM.test(f) && !/\bfiverr\b/.test(t)) return 'other';
  if (/\b(sent .* requirements|submitted .* requirements|requirements for (your )?order|filled .* requirements)\b/.test(t)) return 'requirements';
  if (/\b(new order|received a new order|order .* (started|placed)|you (have|got) a new order|purchased your)\b/.test(t)) return 'order';
  if (/\b(sent you a (new )?message|new message from|unread message)\b/.test(t)) return 'message';
  if (/\b(left you a review|order .* completed|marked .* complete|tip)\b/.test(t)) return 'update';
  return 'other';
}

// PURE: pull the order id, gig title, and any buyer brief out of a Fiverr email body.
export function extractOrder({ subject = '', body = '' }) {
  const text = `${subject}\n${body}`;
  const orderId = (text.match(/\bFO[A-Z0-9]{6,}\b/i) || text.match(/order\s*#?\s*([A-Z0-9]{6,})/i) || [])[0] || null;
  const gig = (
    (body.match(/gig[:\s]+["“']?([^"”'\n]{6,80})/i) || [])[1]
    || (subject.match(/for ["“']([^"”']{6,80})["”']/i) || [])[1]
    || ''
  ).trim();
  // try a requirements / buyer-message block; strip footer/boilerplate
  let brief = (body.match(/(?:requirements?|buyer'?s? (?:message|brief|note)s?|description)[:\s]+([\s\S]{20,1200})/i) || [])[1] || '';
  brief = brief
    .replace(/<[^>]+>/g, ' ')                                   // drop any HTML tags
    .replace(/(unsubscribe|fiverr international|view (the )?order|manage notifications|©|terms of service|do not reply)[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')                            // tidy space-before-punctuation left by tag stripping
    .trim();
  return { orderId, gig, brief: brief.slice(0, 800) };
}

function loadLedger() { try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch { return { seen: [] }; } }
function saveLedger(l) { try { fs.mkdirSync(path.dirname(LEDGER), { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(l)); } catch { /* */ } }

// Poll the mailbox for new Fiverr orders; auto-draft when the brief is present, else ask for it. Returns a summary.
export async function watchFiverrOrders({ days = 10 } = {}) {
  await mirror('STUDIO-01', 'work', 'Checking Fiverr orders…', 'fiverr');
  const inbox = await readRodgateInbox({ days, max: 40 });
  if (inbox.error) {
    await emit({ kind: 'trace', actor: 'STUDIO-01', pod: 'fiverr', action: 'orders.skip', status: 'error', rationale: inbox.error });
    await mirror('STUDIO-01', 'idle', inbox.error, 'fiverr');
    return { ok: false, note: inbox.error };
  }
  const ledger = loadLedger();
  const seen = new Set(ledger.seen || []);
  let neworders = 0, produced = 0, needBrief = 0;

  for (const m of inbox.msgs) {
    const cls = classifyFiverrMail(m);
    if (cls !== 'order' && cls !== 'requirements') continue;
    const { orderId, gig, brief } = extractOrder(m);
    const key = orderId || ('subj:' + String(m.subject || '').slice(0, 48));
    if (seen.has(key)) continue;
    seen.add(key); neworders++;

    if (brief && brief.length >= 25) {
      // enough to attempt a first draft — runOrder produces it AND raises the gated "deliver?" approval.
      await emit({ kind: 'action', actor: 'STUDIO-01', pod: 'fiverr', action: 'order.detected', rationale: `New Fiverr order ${orderId || ''}: ${brief.slice(0, 80)}`, payload: { orderId, gig } });
      try { await runOrder({ brief: `${gig ? gig + ': ' : ''}${brief}`, orderId: orderId || ('order-' + Date.now()) }); produced++; }
      catch (e) { await emit({ kind: 'trace', actor: 'STUDIO-01', pod: 'fiverr', action: 'order.error', status: 'error', rationale: String(e && e.message || e) }); }
      // runOrder already posts the actionable HQ approval; just add a phone push so you see it off-screen.
      notifyTelegram(`🎨 New Fiverr order ${orderId || ''} — auto-drafted, review & deliver.\nBrief: "${brief.slice(0, 120)}"`);
    } else {
      // order detected but the email didn't carry the brief (common — buyer fills it on the site).
      needBrief++;
      await emit({ kind: 'action', actor: 'STUDIO-01', pod: 'fiverr', action: 'order.needs_brief', rationale: `New Fiverr order ${orderId || ''} — brief not in the email`, payload: { orderId, gig } });
      await notify({ pod: 'Fiverr Studio', title: `🎨 New Fiverr order ${orderId || ''} — needs the brief`, detail: 'Open it on Fiverr, then paste the buyer\'s brief to Remy (or forward the requirements email) and I\'ll produce it.', verb: 'Add brief' });
    }
  }

  ledger.seen = [...seen].slice(-300);
  saveLedger(ledger);
  await emit({ kind: 'trace', actor: 'STUDIO-01', pod: 'fiverr', action: 'orders.scan', rationale: `Fiverr scan: ${neworders} new (${produced} auto-drafted, ${needBrief} need brief)` });
  await mirror('STUDIO-01', neworders ? 'need' : 'idle', neworders ? `${neworders} new order(s) — review & deliver` : 'No new Fiverr orders', 'fiverr');
  return { ok: true, neworders, produced, needBrief };
}

if (process.argv[1] && process.argv[1].endsWith('inbox.mjs') && process.argv[1].includes('fiverr')) {
  watchFiverrOrders({}).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
