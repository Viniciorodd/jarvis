// stopwatch.mjs — the timer that follows him around.
//
// Operator, 2026-08-05: *"can we create a stop watch inside jarvis focus, for me to track my time. I want it
// accessible from everywhere, i want to be able to pause it and continue whenever, after i am done, i want to
// be able to click a button log the time in."*
//
// THE STATE LIVES ON THE SERVER, not in the tab. Every word of that request rules out a browser timer:
// "accessible from everywhere" means the same clock on the phone and the PC; "pause it and continue
// whenever" means it survives closing the laptop; and a timer that resets when a tab reloads would lose him
// two hours of real work, which is worse than having no timer at all.
//
// TIME IS DERIVED FROM TIMESTAMPS, NEVER ACCUMULATED BY A TICKER. A setInterval that adds a second each
// second drifts, stops when the machine sleeps, and double-counts across two open tabs. Here a running
// stopwatch is just "started at T", and the elapsed time is arithmetic done at the moment you ask. Sleep the
// machine for an hour and the hour is still there, because nobody was counting — it was recorded.
//
// PURE and eval-pinned. Persistence lives in the companion.

const ms = (x) => { const t = Date.parse(String(x || '')); return Number.isFinite(t) ? t : null; };

// A fresh, stopped stopwatch.
export function blank() { return { running: false, startedAt: '', accumulatedMs: 0, label: '', since: '' }; }

// PURE: how long has been clocked, as of `now`. A stopped watch is just its accumulated total; a running one
// adds the open segment.
export function elapsedMs(state = {}, now = '') {
  const acc = Number(state && state.accumulatedMs) || 0;
  if (!state || !state.running) return Math.max(0, acc);
  const from = ms(state.startedAt), to = ms(now);
  if (from === null || to === null) return Math.max(0, acc);
  // A clock that went backwards (NTP correction, timezone change) must never subtract from real work.
  return Math.max(0, acc + Math.max(0, to - from));
}

// PURE: start a new run. Starting an already-running watch is a NO-OP rather than a restart — he hit the
// button twice, he did not ask to lose the first hour.
export function start(state = {}, now = '', label = '') {
  if (state && state.running) return { ...state };
  return {
    running: true,
    startedAt: String(now || ''),
    accumulatedMs: Number(state && state.accumulatedMs) || 0,
    label: String(label || (state && state.label) || ''),
    since: (state && state.since) || String(now || ''),   // when this whole session first began
  };
}

// PURE: pause. Banks the open segment into the total and stops the clock.
export function pause(state = {}, now = '') {
  if (!state || !state.running) return { ...blank(), ...state, running: false };
  return { ...state, running: false, startedAt: '', accumulatedMs: elapsedMs(state, now) };
}

// PURE: resume from where he left off.
export function resume(state = {}, now = '', label = '') { return start(state, now, label); }

// PURE: throw it away without logging. Used only on an explicit discard.
export function reset() { return blank(); }

// PURE: minutes, for the focus log. ROUNDED, and never to zero while any real time was clocked — logging a
// 40-second call as "0 minutes" reads as a bug and teaches him the button does nothing.
export function minutesOf(state = {}, now = '') {
  const e = elapsedMs(state, now);
  if (e <= 0) return 0;
  return Math.max(1, Math.round(e / 60000));
}

// PURE: h:mm:ss for the readout, and never a jumping-width string — the widget is on screen for hours.
export function format(msTotal = 0) {
  const total = Math.max(0, Math.floor(Number(msTotal) || 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// PURE: everything a surface needs to draw itself.
export function view(state = {}, now = '') {
  const e = elapsedMs(state, now);
  return {
    running: !!(state && state.running),
    elapsedMs: e,
    display: format(e),
    minutes: minutesOf(state, now),
    label: (state && state.label) || '',
    since: (state && state.since) || '',
    // Nothing to show until he actually starts one — an idle 0:00 pill on every screen is clutter.
    active: e > 0 || !!(state && state.running),
  };
}

// PURE: is this state stale enough to be suspicious? A watch left running overnight is almost always one he
// forgot to stop, and silently logging nine hours would poison his focus history. The surface asks him.
export function looksForgotten(state = {}, now = '', hours = 8) {
  return elapsedMs(state, now) > hours * 3600000;
}
