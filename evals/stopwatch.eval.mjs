// Regression suite for the stopwatch (pods/stopwatch.mjs).
//
// "I want it accessible from everywhere, i want to be able to pause it and continue whenever, after i am
// done, i want to be able to click a button log the time in."
//
// Every case here protects one thing: real work already clocked must never be lost or invented. Time is
// derived from timestamps rather than counted by a ticker, so the machine can sleep, a tab can reload, and
// two tabs can be open at once without the number changing.

import { blank, start, pause, resume, reset, elapsedMs, minutesOf, format, view, looksForgotten }
  from '../pods/stopwatch.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const T = (s) => '2026-08-05T10:00:' + String(s).padStart(2, '0') + 'Z';
// Rolls into hours: M(60) as "10:60:00Z" is not a time, and Date.parse quietly returns NaN for it — which
// showed up as a stopwatch that had apparently lost an hour.
const M = (m) => '2026-08-05T' + String(10 + Math.floor(m / 60)).padStart(2, '0')
  + ':' + String(m % 60).padStart(2, '0') + ':00Z';

export default {
  agent: 'stopwatch',
  cases: [
    { name: 'a fresh stopwatch is stopped and empty', run: () => {
      const v = view(blank(), T(0));
      return ok(!v.running && v.elapsedMs === 0 && v.display === '0:00' && !v.active, JSON.stringify(v));
    } },

    { name: 'a running watch counts from when it started', run: () => {
      const s = start(blank(), M(0));
      return ok(elapsedMs(s, M(25)) === 25 * 60000, String(elapsedMs(s, M(25))));
    } },

    // ── pause and continue, which is the whole request ─────────────────────────────────────────────
    { name: 'pausing banks the time; the clock then stands still', run: () => {
      const s = pause(start(blank(), M(0)), M(25));
      return ok(!s.running && elapsedMs(s, M(25)) === 25 * 60000
        && elapsedMs(s, M(90)) === 25 * 60000, JSON.stringify(s));
    } },

    { name: 'resuming continues from where he left off — nothing is lost', run: () => {
      let s = start(blank(), M(0));
      s = pause(s, M(25));
      s = resume(s, M(40));
      return ok(elapsedMs(s, M(50)) === 35 * 60000, String(elapsedMs(s, M(50)) / 60000));
    } },

    { name: 'pause / resume survives many rounds', run: () => {
      let s = blank();
      for (let i = 0; i < 4; i++) { s = start(s, M(i * 10)); s = pause(s, M(i * 10 + 5)); }
      return ok(elapsedMs(s, M(99)) === 20 * 60000, String(elapsedMs(s, M(99)) / 60000));
    } },

    { name: '⚠ pressing start twice does NOT restart the clock', run: () => {
      // He tapped it again because the widget was off-screen. That must not cost him the first hour.
      let s = start(blank(), M(0));
      s = start(s, M(30));
      return ok(elapsedMs(s, M(60)) === 60 * 60000, String(elapsedMs(s, M(60)) / 60000));
    } },

    { name: 'pausing an already-paused watch changes nothing', run: () => {
      let s = pause(start(blank(), M(0)), M(20));
      s = pause(s, M(45));
      return ok(elapsedMs(s, M(90)) === 20 * 60000, String(elapsedMs(s, M(90)) / 60000));
    } },

    // ── the reasons this is not a browser ticker ───────────────────────────────────────────────────
    { name: '⚠ a sleeping machine still records the time', run: () => {
      // A setInterval stops when the laptop closes. Timestamps do not — nobody was counting, it was recorded.
      const s = start(blank(), '2026-08-05T09:00:00Z');
      return ok(elapsedMs(s, '2026-08-05T12:00:00Z') === 3 * 3600000);
    } },

    { name: '⚠ asking twice at the same instant gives the same answer', run: () => {
      // Two tabs open must not double-count: elapsed is arithmetic, not accumulation.
      const s = start(blank(), M(0));
      return ok(elapsedMs(s, M(30)) === elapsedMs(s, M(30)));
    } },

    { name: '⚠ a clock that jumps backwards never subtracts real work', run: () => {
      // NTP correction or a timezone change mid-session.
      const s = start(blank(), M(30));
      return ok(elapsedMs(s, M(10)) === 0 && elapsedMs(pause(s, M(10)), M(10)) === 0);
    } },

    // ── logging it ─────────────────────────────────────────────────────────────────────────────────
    { name: 'minutes are rounded for the focus log', run: () =>
      ok(minutesOf(pause(start(blank(), M(0)), M(25)), M(25)) === 25) },

    { name: '⚠ a short session logs 1 minute, never 0', run: () => {
      // "0 minutes" reads as a broken button and teaches him to stop pressing it.
      const s = pause(start(blank(), T(0)), T(40));
      return ok(minutesOf(s, T(40)) === 1, String(minutesOf(s, T(40))));
    } },

    { name: 'an untouched stopwatch logs nothing at all', run: () =>
      ok(minutesOf(blank(), M(0)) === 0) },

    { name: 'discarding clears it completely', run: () =>
      ok(elapsedMs(reset(), M(99)) === 0 && !reset().running) },

    // ── the readout ────────────────────────────────────────────────────────────────────────────────
    { name: 'the readout is stable width and rolls over to hours', run: () =>
      ok(format(0) === '0:00' && format(9000) === '0:09' && format(65000) === '1:05'
        && format(3600000) === '1:00:00' && format(3725000) === '1:02:05',
        [format(0), format(9000), format(65000), format(3600000), format(3725000)].join(' '))},

    { name: 'the widget stays hidden until there is something to show', run: () =>
      ok(!view(blank(), M(0)).active && view(start(blank(), M(0)), M(1)).active) },

    { name: 'a label rides along and survives a pause', run: () => {
      const s = pause(start(blank(), M(0), 'SCTA proposal'), M(20));
      return ok(view(s, M(20)).label === 'SCTA proposal');
    } },

    // ── the one he WILL do ─────────────────────────────────────────────────────────────────────────
    { name: '⚠ a watch left running overnight is flagged, not logged', run: () => {
      // Silently banking nine hours would poison his focus history, and that history is what /focus reports.
      const s = start(blank(), '2026-08-05T09:00:00Z');
      return ok(looksForgotten(s, '2026-08-05T23:00:00Z') && !looksForgotten(s, '2026-08-05T12:00:00Z'));
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(elapsedMs() === 0 && minutesOf() === 0 && format() === '0:00' && format('x') === '0:00'
        && !view().running && !start(null, 'nonsense').running === false) },
  ],
};
