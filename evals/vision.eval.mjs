// Regression suite for the camera layer (pods/vision.mjs). A camera pointed at the operator's desk — in a
// house where his partner's medical life happens — earns the strictest guards in the repo. The bar:
// on-demand only (never a standing watch), never a claim about how he FEELS, and gestures rare enough that
// the machine never "decides" something because he reached for his coffee.

import { canLook, stripPersonalRead, classifyGesture, motionCentre, observableNotes, LOOK_KINDS } from '../pods/vision.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const grid = (v) => Array(9).fill(v);

export default {
  agent: 'vision',
  cases: [
    // ── on-demand only ──
    { name: 'THE RULE: continuous watching is refused outright', run: () =>
      ok(canLook({ kind: 'object', reason: 'he asked', continuous: true }).allow === false) },

    { name: 'a rapid loop of "single" looks is refused — that is a watch with extra steps', run: () =>
      ok(canLook({ kind: 'object', reason: 'he asked', sinceLastLookMs: 200 }).allow === false) },

    { name: 'every look must carry a stated reason (it goes in the record)', run: () =>
      ok(canLook({ kind: 'object', reason: '' }).allow === false && canLook({ kind: 'object', reason: 'he asked what he is holding' }).allow === true) },

    { name: 'an unknown look type is refused, not guessed', run: () =>
      ok(canLook({ kind: 'read-his-mood', reason: 'x' }).allow === false) },

    // ── never reads the person ──
    { name: 'NO EMOTION READING: every prompt forbids describing the person', run: () => {
      const bad = Object.entries(LOOK_KINDS).filter(([, p]) => !/do not describe the person|not holding anything|no legible text/i.test(p));
      return ok(bad.length === 0, JSON.stringify(bad.map((b) => b[0])));
    } },

    { name: 'if the model volunteers a mood read anyway, it is STRIPPED', run: () => {
      const s = stripPersonalRead('A blue coffee mug. You look tired today. It has a chip on the handle.');
      return ok(!/tired|you look/i.test(s) && /coffee mug/.test(s) && /chip/.test(s), s);
    } },

    { name: 'stripping keeps a normal object description intact', run: () =>
      ok(stripPersonalRead('A Dell laptop and a notebook.') === 'A Dell laptop and a notebook.') },

    // ── gestures: rare and deliberate ──
    { name: 'THE DEFAULT IS null — idle movement is not a command', run: () =>
      ok(classifyGesture({ cells: grid(0.02), energy: 0.02 }) === null
        && classifyGesture({ cells: grid(0.5), energy: 0.05 }) === null) },

    { name: 'a palm over the lens = dismiss', run: () =>
      ok(classifyGesture({ cells: grid(0.8), energy: 0.8 }) === 'dismiss') },

    { name: 'a sweep right = next, a sweep left = prev', run: () => {
      const right = classifyGesture({ cells: [0, 0, 0.9, 0, 0, 0.9, 0, 0, 0.9], prevX: 0.1, energy: 0.6 });
      const left = classifyGesture({ cells: [0.9, 0, 0, 0.9, 0, 0, 0.9, 0, 0], prevX: 0.9, energy: 0.6 });
      return ok(right === 'next' && left === 'prev', JSON.stringify({ right, left }));
    } },

    { name: 'a small drift is NOT a sweep (he is just moving)', run: () =>
      ok(classifyGesture({ cells: [0, 0, 0.9, 0, 0, 0.9, 0, 0, 0.9], prevX: 0.85, energy: 0.6 }) !== 'next') },

    { name: 'a deliberate centred hold = capture', run: () =>
      ok(classifyGesture({ cells: [0, 0.8, 0, 0, 0.9, 0, 0, 0.8, 0], prevX: 0.5, energy: 0.6 }) === 'capture') },

    { name: 'a malformed grid never yields a gesture', run: () =>
      ok(classifyGesture({ cells: [1, 2, 3], energy: 1 }) === null && classifyGesture({}) === null && motionCentre([]) === null) },

    // ── wellbeing: observable only ──
    { name: 'HONEST WELLBEING: it reports hours at the desk, never a mood', run: () => {
      const now = Date.parse('2026-08-01T15:00:00');
      const n = observableNotes({ sessionStartMs: now - 4 * 3600000, now, hour: 15 });
      return ok(n.length === 1 && /4h/.test(n[0]) && !/tired|stressed|feel/i.test(n[0]), JSON.stringify(n));
    } },

    { name: 'it notices 1am, because that is a fact', run: () =>
      ok(observableNotes({ now: Date.now(), hour: 2 }).some((s) => /2am/.test(s))) },

    { name: 'a normal short session produces NOTHING (it does not nag)', run: () => {
      const now = Date.parse('2026-08-01T14:00:00');
      return ok(observableNotes({ sessionStartMs: now - 30 * 60000, now, hour: 14 }).length === 0);
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(observableNotes().length >= 0 && stripPersonalRead() === '' && stripPersonalRead(null) === '') },
  ],
};
