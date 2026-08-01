// Regression suite for the agent → required-reading map (pods/required-reading.mjs, PRD Control Center
// Part A). The failure this guards against is silent: a renamed note, or a new writing agent added without
// assignments, means the agent quietly stops reading his voice profile and nothing breaks — it just starts
// sounding like a generic LLM again. So the map is code, and the drift is detectable.

import { readingFor, writersMissingReading, verifyReading, READING, ALL_WRITERS } from '../pods/required-reading.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'required-reading',
  cases: [
    { name: 'EVERY agent that writes in his name gets the Writing Voice note', run: () => {
      const bad = Object.keys(READING).filter((c) => !readingFor(c).some((n) => /Writing Voice/.test(n)));
      return ok(bad.length === 0, JSON.stringify(bad));
    } },

    { name: 'Vera reads the social system, the copy profile AND the content bank', run: () => {
      const r = readingFor('SOCIAL-01');
      return ok(/Social Media System/.test(r.join('|')) && /Copy Profile/.test(r.join('|')) && /Content Bank/.test(r.join('|')), JSON.stringify(r));
    } },

    { name: 'a UI build pulls the design library (the PRD\'s acceptance #4)', run: () =>
      ok(readingFor('RECON-DEV').some((n) => /UI-UX Design Library/.test(n)), JSON.stringify(readingFor('RECON-DEV'))) },

    { name: 'the list is de-duplicated (the voice note is not listed twice)', run: () => {
      const r = readingFor('SOCIAL-01');
      return ok(new Set(r).size === r.length, JSON.stringify(r));
    } },

    { name: 'order is stable — a prompt built from this must not churn between runs', run: () =>
      ok(JSON.stringify(readingFor('STUDIO-01')) === JSON.stringify(readingFor('STUDIO-01'))) },

    { name: 'an agent with no assignments still gets the voice note, never an empty list', run: () => {
      const r = readingFor('SOME-NEW-AGENT');
      return ok(r.length === ALL_WRITERS.length && /Writing Voice/.test(r[0]), JSON.stringify(r));
    } },

    { name: 'DRIFT DETECTOR: a new agent with no reading list is reported, not ignored', run: () => {
      const missing = writersMissingReading([{ codename: 'SOCIAL-01' }, { codename: 'BRAND-NEW-99' }]);
      return ok(missing.length === 1 && missing[0] === 'BRAND-NEW-99', JSON.stringify(missing));
    } },

    { name: 'verifyReading REPORTS a missing note rather than failing silently', run: () => {
      const r = verifyReading(['✍️ Writing Voice — how Vinicio writes']);   // only one of them present
      return ok(r.checked > 1 && r.missing.length === r.checked - 1 && !r.missing.some((m) => /Writing Voice/.test(m)), JSON.stringify(r.missing));
    } },

    { name: 'matching ignores emoji and punctuation (titles vary by keyboard)', run: () => {
      const r = verifyReading(['Writing Voice how Vinicio writes']);
      return ok(!r.missing.some((m) => /Writing Voice/.test(m)), JSON.stringify(r.missing));
    } },

    { name: 'ALL notes present → nothing reported missing', run: () => {
      const all = [...new Set([...Object.values(READING).flat(), ...ALL_WRITERS])];
      return ok(verifyReading(all).missing.length === 0, JSON.stringify(verifyReading(all).missing));
    } },

    { name: 'an UNREADABLE vault does not cry wolf that every note vanished', run: () => {
      const r = verifyReading([]);
      return ok(r.missing.length === 0 && r.unknown === true, JSON.stringify(r));
    } },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(readingFor().length > 0 && writersMissingReading().length === 0 && writersMissingReading(null).length === 0) },
  ],
};
