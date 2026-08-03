// gatekeeper-calendar.mjs — the ambient layer. The calendar defends itself whether or not he remembers.
//
// PRD §3d, and it names the weakness exactly: *"This fixes the system's biggest weakness: it currently
// requires him to remember to ask it. A calendar watcher runs whether or not he thinks to. That's the line
// between a tool and an assistant."*
//
// Same Cost Engine as pods/gatekeeper.mjs, pointed at a calendar event instead of a text message. The
// difference that matters is WHO STARTS IT — nobody. An event lands, it gets costed, and if it's expensive
// he hears about it before the day arrives rather than after it's eaten.
//
// GUARDRAIL (PRD §3d): Jarvis never cancels or reschedules anything on its own. It drafts and suggests; he
// taps. Everything here returns a RECOMMENDATION.

import { trueCost } from './gatekeeper.mjs';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ── The meeting cost model ───────────────────────────────────────────────────────────────────────
// PRD: `prep + travel there + the meeting + travel back + re-focus time + recovery`.
// The line he wanted made visible: a 30-minute coffee is not 30 minutes. 30 min + 50 driving + 25 refocus
// ≈ 1.75 hrs. Re-focus is the one everybody drops, and it is why a "quick" midday call costs a morning.
export const REFOCUS_MIN = 25;      // getting back into deep work after ANY interruption
export const PREP_MIN = 10;         // even a coffee has a "where am I going / what's this about"

export function meetingCost({ minutes = 30, travelMinutesEachWay = 0, isVirtual = false, startHour = null, hourRate = 60 } = {}) {
  const meet = num(minutes);
  const travel = isVirtual ? 0 : num(travelMinutesEachWay) * 2;
  const prep = PREP_MIN;
  // A virtual call still costs re-focus. That is the whole point — it is not free because you didn't drive.
  const refocus = REFOCUS_MIN;
  const totalMin = meet + travel + prep + refocus;
  const cost = trueCost({
    hours: totalMin / 60,
    drivingHours: travel / 60,
    startHour,
    hourRate,
  });
  return {
    ...cost,
    breakdown: { meetingMin: meet, travelMin: travel, prepMin: prep, refocusMin: refocus, totalMin: Math.round(totalMin) },
  };
}

// ── "Could this be an email?" ────────────────────────────────────────────────────────────────────
// PRD: flags long blocks with no agenda, no decision, and one attendee. Deliberately conservative — a false
// "this is pointless" about a real client call would be worse than staying quiet.
export function couldBeEmail({ summary = '', description = '', minutes = 30, attendees = 1 } = {}) {
  const text = `${summary} ${description}`.toLowerCase();
  const hasAgenda = /agenda|discuss|decide|decision|review|walk through|kickoff|scope|contract|interview|demo/.test(text);
  const isSocial = /coffee|lunch|dinner|drinks|catch ?up|check ?in|touch ?base|sync|hang/.test(text);
  const long = num(minutes) >= 45;
  if (hasAgenda) return { likely: false, why: '' };
  if (num(attendees) > 2) return { likely: false, why: '' };
  if (isSocial && long) return { likely: true, why: 'social, 45min+, no agenda' };
  if (long && !hasAgenda) return { likely: true, why: 'no agenda and no decision named' };
  return { likely: false, why: '' };
}

// ── Does it collide with something that matters? ─────────────────────────────────────────────────
// PURE: given the day's protected blocks, what does this event land on? This is what makes a decline TRUE —
// "I have work I can't move" is a fact when there is a real block on the calendar (PRD §6, no fabrication).
export function collisions(event = {}, protectedBlocks = []) {
  const s = Date.parse(event.start), e = Date.parse(event.end || event.start) || s + 30 * 60000;
  if (!Number.isFinite(s)) return [];
  return (Array.isArray(protectedBlocks) ? protectedBlocks : []).filter((b) => {
    const bs = Date.parse(b.start), be = Date.parse(b.end);
    if (!Number.isFinite(bs) || !Number.isFinite(be)) return false;
    return s < be && e > bs;                       // any overlap
  }).map((b) => b.summary || b.title || 'a protected block');
}

// ── The recommendation ───────────────────────────────────────────────────────────────────────────
// Four outcomes, mirroring the request verdicts. `keep` is the common and correct answer — a watcher that
// questions everything gets muted, and then it protects nothing.
export function evaluateEvent({ event = {}, protectedBlocks = [], recoveryDaysOutstanding = 0, hourRate = 60 } = {}) {
  const minutes = (() => {
    const s = Date.parse(event.start), e = Date.parse(event.end);
    return Number.isFinite(s) && Number.isFinite(e) && e > s ? Math.round((e - s) / 60000) : 30;
  })();
  const isVirtual = /zoom|meet\.google|teams|call|phone|virtual|http/i.test(`${event.location || ''} ${event.summary || ''} ${event.description || ''}`);
  const startHour = Number.isFinite(Date.parse(event.start)) ? new Date(event.start).getHours() : null;
  const travel = isVirtual ? 0 : num(event.travelMinutesEachWay) || (event.location ? 25 : 0);

  const cost = meetingCost({ minutes, travelMinutesEachWay: travel, isVirtual, startHour, hourRate });
  const hits = collisions(event, protectedBlocks);
  const email = couldBeEmail({ summary: event.summary, description: event.description, minutes, attendees: event.attendees });

  let action = 'keep', why = '';
  if (hits.length) {
    action = 'move';
    why = `It lands on ${hits[0]}.`;
  } else if (num(recoveryDaysOutstanding) > 0 && cost.totalHours >= 2) {
    action = 'move';
    why = `You're carrying ${num(recoveryDaysOutstanding)} recovery day${num(recoveryDaysOutstanding) > 1 ? 's' : ''} — this one will cost more than it looks.`;
  } else if (email.likely) {
    action = 'shorten';
    why = `${minutes} minutes with ${email.why}.`;
  } else if (cost.totalHours >= 3) {
    action = 'review';
    why = `${cost.totalHours}h once you count travel and getting back into work.`;
  }

  return {
    action,                                  // keep | shorten | move | review
    why,
    cost,
    collisions: hits,
    couldBeEmail: email.likely,
    isVirtual,
    // The number he asked to see: a "30-minute coffee" that is really 1.75 hours.
    headline: `${cost.totalHours}h real cost${isVirtual ? '' : ' (incl. travel)'} · $${cost.total}`,
  };
}

// PURE: the Telegram line. Silent (null) on `keep` — an ambient watcher that comments on every event is one
// he mutes within a week, and a muted watcher protects nothing.
export function eventAlert(event = {}, ev = {}) {
  // Silent on `keep` AND on anything unrecognised. An ambient watcher fails CLOSED to silence: a stray ping
  // from a state we didn't plan for is exactly how he learns to ignore the channel.
  if (!ev || !['shorten', 'move', 'review'].includes(ev.action)) return null;
  const when = (() => {
    const d = new Date(event.start);
    return Number.isFinite(d.getTime())
      ? d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : '';
  })();
  const suggest = {
    shorten: 'Make it 20 minutes, or an email.',
    move: 'Move it.',
    review: 'Worth a look before it lands.',
  }[ev.action] || '';
  return [
    `📅 ${event.summary || 'New event'}${when ? ' — ' + when : ''}`,
    ev.headline,
    ev.why,
    '',
    suggest,
  ].filter(Boolean).join('\n');
}
