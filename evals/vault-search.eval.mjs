// Regression suite for vault search (pods/vault-search.mjs) — the read half of "the Second Brain IS Jarvis's
// memory". The bar: the right note first, real quoted excerpts (so the model never paraphrases from air), and
// a hard NO-match rather than a weak guess, because a confident wrong note is worse than "I don't know".

import { queryTerms, scoreNote, excerptFor, pickNoteToOpen } from '../pods/vault-search.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'vault-search',
  cases: [
    { name: 'stopwords are dropped (else every note matches "what is my")', run: () =>
      ok(JSON.stringify(queryTerms('what is my plan for the NIH')) === JSON.stringify(['plan', 'nih']), JSON.stringify(queryTerms('what is my plan for the NIH'))) },

    { name: 'tags and money survive tokenising (#jarvis, $4,956)', run: () => {
      const t = queryTerms('#jarvis budget');
      return ok(t.includes('#jarvis'), JSON.stringify(t));
    } },

    { name: 'THE POINT: a title match outranks a passing body mention', run: () => {
      const titled = scoreNote({ name: 'Ana — Medical.md', text: 'notes' }, ['ana', 'medical']);
      const passing = scoreNote({ name: 'Random.md', text: 'ana went to a medical appointment once' }, ['ana', 'medical']);
      return ok(titled > passing, JSON.stringify({ titled, passing }));
    } },

    { name: 'matching EVERY term beats matching one term repeatedly', run: () => {
      const both = scoreNote({ name: 'x.md', text: 'ana and the nih' }, ['ana', 'nih']);
      const oneLots = scoreNote({ name: 'y.md', text: 'ana ana ana ana ana ana' }, ['ana', 'nih']);
      return ok(both > oneLots, JSON.stringify({ both, oneLots }));
    } },

    { name: 'a note with NO term scores zero — never a weak guess', run: () =>
      ok(scoreNote({ name: 'Groceries.md', text: 'milk and eggs' }, ['nih', 'transplant']) === 0) },

    { name: 'an empty query matches nothing (never "here is your whole vault")', run: () =>
      ok(scoreNote({ name: 'a.md', text: 'b' }, []) === 0 && queryTerms('').length === 0 && queryTerms().length === 0) },

    { name: 'excerpts are REAL quoted lines, with their surrounding context', run: () => {
      const text = 'intro\nthe DICOM files are at Geisinger\ntrailing note';
      const ex = excerptFor(text, ['dicom']);
      return ok(ex.length === 1 && /DICOM files are at Geisinger/.test(ex[0]) && /intro/.test(ex[0]), JSON.stringify(ex));
    } },

    { name: 'excerpts are capped (a whole note is not an excerpt)', run: () => {
      const text = Array.from({ length: 50 }, (_, i) => 'line ' + i + ' nih').join('\n');
      return ok(excerptFor(text, ['nih']).length <= 3, String(excerptFor(text, ['nih']).length)) },
    },

    { name: 'no match yields no excerpt rather than an unrelated line', run: () =>
      ok(excerptFor('milk and eggs', ['nih']).length === 0) },

    // ── OPENING is stricter than searching (live catch, 2026-08-01) ──
    { name: 'THE CATCH: a body-only match is NEVER opened ("note" matching "Book Notes")', run: () => {
      const r = pickNoteToOpen('zzz nonexistent note xyzzy', [{ name: '📁 Book Notes', score: 30 }, { name: '📁 Course Notebooks', score: 20 }]);
      return ok(r.note === null && r.candidates.length === 2, JSON.stringify(r));
    } },

    { name: 'an exact title opens, emoji and punctuation ignored', run: () => {
      const r = pickNoteToOpen("Ana's Care", [{ name: "❤️ Ana's Care" }, { name: 'Other' }]);
      return ok(r.note && r.exact === true && /Ana/.test(r.note.name), JSON.stringify(r.note));
    } },

    { name: 'a title containing EVERY term opens (partial titles still work)', run: () => {
      const r = pickNoteToOpen('gov pipeline', [{ name: 'Gov Pipeline Board 2026' }]);
      return ok(r.note && r.exact === false, JSON.stringify(r));
    } },

    { name: 'a title missing one term does NOT open — it asks instead', run: () => {
      const r = pickNoteToOpen('gov pipeline budget', [{ name: 'Gov Pipeline Board' }]);
      return ok(r.note === null && r.candidates.includes('Gov Pipeline Board'), JSON.stringify(r));
    } },

    { name: 'no results at all → nothing opened, nothing invented', run: () => {
      const r = pickNoteToOpen('anything', []);
      return ok(r.note === null && r.candidates.length === 0, JSON.stringify(r));
    } },

    { name: 'garbage input does not throw', run: () =>
      ok(scoreNote({}, ['x']) === 0 && excerptFor(null, ['x']).length === 0 && queryTerms(null).length === 0
        && pickNoteToOpen().note === null && pickNoteToOpen('x', null).note === null) },
  ],
};
