// notify-policy.mjs — what earns a buzz on his phone, and what waits for the end-of-day report.
//
// Operator, 2026-08-02: *"I've been getting so many spams from Jarvis that most of it is just noise. It's
// nothing really useful. So I'm just ignoring everything. If it's just good messages coming in, actually
// asking me for real input, then I will probably pay more attention. So let's remove all of the noise."*
//
// That last sentence is the whole problem: the cost of noise is not annoyance, it is that he stopped reading.
// Zero of his last 200 events show an approval decision — the queue grew to 30 while he tuned it all out.
// A notification he ignores is worse than no notification, because we then believe he was told.
//
// So the bar is deliberately brutal. A message earns his phone ONLY if it is a decision that moves money or
// a bid, or a person waiting on an answer he alone can give. Everything else — every routine draft, every
// agent step, every "gated for your approval" — goes to the end-of-day report and nowhere else.
//
// PURE and eval-pinned, because "what interrupts him" is a policy, not a mood.

// The gate's own doctrine boilerplate says nothing about what is waiting. Same string that poisoned the
// approval-queue titles and the catch-up feed; it must never reach his phone either.
const BOILERPLATE = /treated as irreversible|gated for your approval|doctrine\s*§|requires (?:your )?approval|awaiting approval/i;

// Actions worth a buzz. Everything is a DECISION with a deadline or money attached, or a person waiting.
const WORTH_IT = /^(proposal\.(submit|ready)|bid\.submit|invoice|payment|contract\.(award|sign)|sub\.reply\.needs_you|deal\.priced)/i;

// Never, under any circumstances — these are the ones that trained him to ignore the channel.
const NEVER = /^(scan\.|trace|inbox\.triage|outreach\.(auto_)?sent|outreach\.followup|sub\.reply\.(parsed|auto)|approvals\.nudged|gov\.digest|heartbeat|watcher\.|eod\.)/i;

// PURE: should this event interrupt him RIGHT NOW? Eval-pinned. Fails CLOSED (silent) on anything unknown —
// the default for a channel he has stopped reading must be "don't", not "probably".
export function worthABuzz(ev = {}) {
  const action = String(ev.action || '').trim();
  const kind = String(ev.kind || '').trim();
  if (!action && !kind) return false;
  // ERRORS FIRST, before the never-list. A failing scan is on the never-list as routine — but a scan that
  // ERRORS is not routine, it is the pipeline quietly dying. Silent failure is the exact thing that let a
  // dropped sub question kill a bid with nothing in the log. The burst cap and dedup below keep a repeated
  // fault from becoming its own spam.
  if (ev.status === 'error') return true;
  if (NEVER.test(action)) return false;
  if (WORTH_IT.test(action)) return true;
  // An approval request only earns a buzz if it is a REAL decision — a submit or a spend. A routine
  // outreach send is not something to stop his day for; it lands in the end-of-day count.
  if (kind === 'approval.request') return /submit|invoice|payment|award|sign/i.test(String(ev.action || ''));
  return false;
}

// PURE: the one-line message. Returns null when there is nothing honest to say — a buzz with no subject is
// exactly the "gated for your approval" noise that broke his trust in the channel.
export function buzzText(ev = {}) {
  const p = ev.payload || {};
  const raw = String(ev.rationale || '').trim();
  const subject = String(p.title || p.subject || '').trim()
    || (BOILERPLATE.test(raw) ? '' : raw);
  if (!subject) return null;
  const s = subject.length > 160 ? subject.slice(0, 157) + '…' : subject;
  if (ev.status === 'error') return `⚠️ ${s}`;
  if (/^sub\.reply\.needs_you/.test(String(ev.action))) return s;      // already written for him
  if (/^deal\.priced/.test(String(ev.action))) return `🧮 ${s}`;
  if (ev.kind === 'approval.request') return `✋ Needs your decision — ${s}`;
  return s;
}

// PURE: a hard ceiling per cycle. Even purposeful messages become noise in a burst, and a burst is exactly
// what a backlog produces the first time this runs. The rest are not lost — they are in the queue and
// counted in the end-of-day report.
export function pickBuzzes(events = [], { max = 3 } = {}) {
  const out = [];
  for (const ev of Array.isArray(events) ? events : []) {
    if (out.length >= max) break;
    if (!worthABuzz(ev)) continue;
    const text = buzzText(ev);
    if (!text) continue;
    if (out.some((o) => o.text === text)) continue;     // the same thing twice is noise by definition
    out.push({ id: ev.id, text, action: ev.action });
  }
  return out;
}
