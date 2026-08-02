// reply-triage.mjs — what a subcontractor's reply actually MEANS, and who has to act on it.
//
// Operator, 2026-08-01: *"the AI agents are emailing, but who is checking for responses? What are we doing
// with those responses? Maybe the sub is asking questions that I might need to jump in."*
//
// He found a real hole. `parseReply` in replies.mjs extracts a quote, past performance, and can_perform —
// and nothing else. A sub who writes back *"what's the square footage?"* produced NO quote, so the reply was
// effectively discarded: the sub got silence, the operator never heard about it, and the bid died quietly
// weeks later for no visible reason. That is the worst kind of failure, because nothing ever errors.
//
// So every reply now lands in exactly one bucket, and each bucket names WHOSE move it is:
//   quote     → Jarvis prices it and the deal advances          (him: nothing, unless he wants to look)
//   question  → HIS move. A human has to answer it, fast.        (this is the one that was being dropped)
//   decline   → close the loop, activate the backup sub
//   auto      → out-of-office / autoresponder → still waiting, do NOT treat as contact
//   unclear   → say so; never force it into a bucket to look tidy
//
// Deterministic first (doctrine #1: code disposes). The AI extraction still runs for the quote AMOUNT, but
// which bucket a reply falls into is decided by rules we can test — a model deciding "is this a question?"
// would eventually mislabel one and drop it right back into the hole.

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// An autoresponder is not a human answering. Treating it as contact restarts the follow-up ladder and makes
// a silent sub look responsive — so it gets its own bucket and the ladder keeps running.
const AUTO_RE = /\b(out of (the )?office|automatic reply|auto-?reply|on vacation|on holiday|away from my desk|will be back|currently out|do not reply|undeliverable|delivery status notification|mailer-daemon)\b/i;

const DECLINE_RE = /\b(not interested|no thank|we(?:'| a)?re (?:not|unable)|unable to (?:bid|quote|help)|can(?:no|')t (?:help|bid|quote|take)|decline|pass on this|not a (?:good )?fit|too far|outside our (?:area|scope)|no capacity|fully booked)\b/i;

// A question that needs HIM: they are asking for information only he has (scope, site, dates, terms).
// Includes the auxiliaries a question actually starts with — "Does that include the windows?" was slipping
// through because only "how does" was covered, and a dropped question is the whole bug this file exists for.
const ASK_RE = /\b(what|when|where|which|why|who|how|do|does|did|is|are|was|were|will|would|can|could|should|any chance|clarif|confirm|let me know)\b/;

// PURE: pull the actual question(s) out, so the push says what they asked instead of "a sub has a question".
export function extractQuestions(body = '', max = 3) {
  const out = [];
  for (const raw of String(body || '').split(/(?<=[.?!])\s+|\n+/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line || line.length < 8 || line.length > 240) continue;
    if (/^(>|on .* wrote:|from:|sent:|to:|subject:)/i.test(line)) continue;   // quoted history, not their words
    if (line.includes('?') && ASK_RE.test(norm(line))) out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

// PURE: the bucket + whose move. `parsed` is the AI extraction (may be null — we must still decide).
// Eval-pinned. Order matters: autoresponders and declines are checked BEFORE questions, because a bounce
// message full of question marks is not a subcontractor asking anything.
export function triageReply({ body = '', subject = '', parsed = null } = {}) {
  const text = norm(subject + ' ' + body);
  if (!text) return { kind: 'unclear', who: 'jarvis', reason: 'empty reply', questions: [] };

  if (AUTO_RE.test(text) || AUTO_RE.test(norm(subject))) {
    return { kind: 'auto', who: 'jarvis', reason: 'autoresponder — still waiting on a real answer', questions: [] };
  }
  if (DECLINE_RE.test(text)) {
    return { kind: 'decline', who: 'jarvis', reason: 'they passed — activate the backup sub', questions: [] };
  }
  const quote = parsed && String(parsed.quote || '').trim();
  const questions = extractQuestions(body);
  if (quote) {
    // A quote WITH a question still needs him — they priced it but want something confirmed.
    return questions.length
      ? { kind: 'quote', who: 'you', reason: 'quoted, but they also asked you something', quote, questions }
      : { kind: 'quote', who: 'jarvis', reason: 'quote captured — the deal prices itself', quote, questions: [] };
  }
  if (questions.length) {
    return { kind: 'question', who: 'you', reason: 'they need an answer before they can quote', questions };
  }
  if (parsed && parsed.can_perform === true) {
    return { kind: 'interested', who: 'jarvis', reason: 'interested, no price yet — chase the number', questions: [] };
  }
  return { kind: 'unclear', who: 'you', reason: 'a real reply we could not classify — read it yourself', questions: [] };
}

// PURE: the Telegram line for a reply that needs HIM. Everything else waits for the end-of-day report —
// he asked for "barely important ones" live, and this is the definition of one.
export function replyAlert({ subName = 'A sub', oppTitle = '', triage = {} } = {}) {
  const who = subName || 'A sub';
  const on = oppTitle ? ` · ${String(oppTitle).slice(0, 60)}` : '';
  if (triage.kind === 'quote' && triage.quote) {
    const q = String(triage.quote).slice(0, 40);
    return triage.questions && triage.questions.length
      ? `💰 QUOTE IN — ${who}${on}\n${q}\n\n❓ They also asked:\n· ${triage.questions.join('\n· ')}`
      : `💰 QUOTE IN — ${who}${on}\n${q}`;
  }
  if (triage.kind === 'question') {
    return `❓ ${who} needs an answer${on}\n· ${(triage.questions || []).join('\n· ')}\n\nThey can't quote until you reply.`;
  }
  if (triage.kind === 'unclear') return `📩 ${who} replied${on} — I couldn't tell what they meant. Worth a read.`;
  return null;   // quote-no-question, decline, auto, interested → end-of-day report, not a ping
}
