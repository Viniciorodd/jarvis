// eod-report.mjs — one end-of-day Telegram instead of a day of pings.
//
// Operator, 2026-08-01: *"instead of me having a whole bunch of notifications that are pretty much useless…
// at the end of the day, how many times we reached out to subs, how many opportunities we sorted. An end of
// day report instead of a live one. However, I want the most important ones — we receive a quote for x
// contractor for x opportunity."*
//
// So the rule is now explicit, and it is the OPPOSITE of what the schedule did:
//   LIVE  → a quote landed · a sub asked something only he can answer. That's it.
//   EOD   → everything else: outreach sent, opportunities scanned, follow-ups, declines, what's stalled.
//
// Before this there were three scheduled Telegrams a day (an 8am growth digest, a midday nudge, an
// afternoon nudge) plus a gate push every 15s — and NOTHING at end of day. He was interrupted all day and
// then told nothing when the day was done.
//
// Built from the control-plane event log, which is the system of record. PURE so the wording is eval-pinned:
// this is the report he'll actually judge the business by, and a number that quietly means something else is
// worse than no number.

const isToday = (ts, day) => String(ts || '').slice(0, 10) === day;

// PURE: the day's numbers from the raw event log. Counts only what actually happened — an event is written
// when a thing is DONE, so these can't drift into "attempted".
export function eodStats(events = [], day = '') {
  const todays = (Array.isArray(events) ? events : []).filter((e) => e && isToday(e.ts, day));
  const act = (re) => todays.filter((e) => re.test(String(e.action || '')));
  const quotes = act(/^sub\.reply\.parsed$/).filter((e) => e.payload && e.payload.quote);
  return {
    day,
    outreachSent: act(/^outreach\.(auto_)?sent$/).length,
    followUps: act(/^outreach\.followup/).length,
    scanned: act(/^scan\.done$/).reduce((n, e) => n + (Number(e.payload && e.payload.count) || 0), 0),
    quotesIn: quotes.length,
    quoteLines: quotes.map((e) => String(e.rationale || '').slice(0, 90)),
    needsYou: act(/^sub\.reply\.needs_you$/).length,
    declines: todays.filter((e) => /decline/i.test(String(e.rationale || ''))).length,
    autoReplies: act(/^sub\.reply\.auto$/).length,
    proposals: act(/^proposal\.(draft|submitted)$/).length,
    priced: act(/^deal\.priced$/).length,
    errors: todays.filter((e) => e.status === 'error').length,
  };
}

// PURE: the message. Silent (null) on a day where nothing happened — a report that arrives every evening
// saying "0, 0, 0" is the same noise he just asked to stop, wearing a different hat.
export function eodMessage(stats = {}, { pendingApprovals = 0, stalled = [] } = {}) {
  const s = stats || {};
  const moved = (s.outreachSent || 0) + (s.followUps || 0) + (s.quotesIn || 0) + (s.proposals || 0) + (s.scanned || 0);
  if (!moved && !pendingApprovals && !(stalled || []).length) return null;

  const L = [`📊 End of day — ${s.day || ''}`.trim(), ''];
  if (s.scanned) L.push(`🔭 ${s.scanned} opportunities scanned`);
  if (s.outreachSent) L.push(`📤 ${s.outreachSent} sub${s.outreachSent === 1 ? '' : 's'} contacted`);
  if (s.followUps) L.push(`🔁 ${s.followUps} follow-up${s.followUps === 1 ? '' : 's'}`);
  if (s.quotesIn) {
    L.push(`💰 ${s.quotesIn} quote${s.quotesIn === 1 ? '' : 's'} in`);
    for (const q of (s.quoteLines || []).slice(0, 4)) L.push(`   · ${q}`);
  }
  if (s.priced) L.push(`🧮 ${s.priced} bid${s.priced === 1 ? '' : 's'} priced off a real quote`);
  if (s.proposals) L.push(`📝 ${s.proposals} proposal${s.proposals === 1 ? '' : 's'} drafted`);
  if (s.declines) L.push(`✋ ${s.declines} declined — backups activated`);
  if (s.autoReplies) L.push(`💤 ${s.autoReplies} auto-repl${s.autoReplies === 1 ? 'y' : 'ies'} (still waiting on a human)`);

  if ((stalled || []).length) {
    L.push('', `⏳ Stalled — no reply past the window:`);
    for (const t of stalled.slice(0, 5)) L.push(`   · ${t}`);
  }
  // His move goes LAST, because it is the thing he acts on and the last line is what he reads first on a
  // phone. Zero waiting is worth saying out loud — it is the whole point of the system working.
  L.push('', pendingApprovals ? `✋ ${pendingApprovals} waiting on you.` : '✅ Nothing waiting on you.');
  if (s.errors) L.push(`⚠️ ${s.errors} error${s.errors === 1 ? '' : 's'} today — check the record.`);
  return L.join('\n');
}
