// Regression suite for the chat anti-confabulation guard (pods/chat-truth.mjs, Lessons L-014). Pins the
// deterministic line between "a real action the tool-less free brain must HONESTLY refuse" (so it can't
// confabulate a fake success like the L-014 vault-note / photo-album bug) and "ordinary chat / prose it can
// answer normally". Over-refusing is annoying; under-refusing lets the local model LIE — this pins both edges.

import { looksLikeAction, needsRealData } from '../pods/chat-truth.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'chat-truth',
  cases: [
    // ── L-014 part two (live confabulation, 2026-07-29). Asked "What do I know about Ana's NIH evaluation?
    // Check my vault.", the tool-less brain invented a filename, a folder, a surname Ana does not have, and an
    // NIH GRANT review with h-index metrics — for a transplant patient. It called zero tools. Questions must
    // reach the tool brain, because a question is exactly when memory matters.
    { name: 'THE LIVE BUG: "What do I know about Ana\'s NIH evaluation? Check my vault." needs real data', run: () =>
      ok(needsRealData("What do I know about Ana's NIH evaluation? Check my vault.")) },

    { name: 'recall questions are caught ("what did we decide about the Brick Ave agreement")', run: () =>
      ok(needsRealData('what did we decide about the Brick Ave operating agreement')) },

    { name: 'his own live data is caught (calendar / inbox / pipeline / money)', run: () =>
      ok(needsRealData('what is on my calendar tomorrow')
        && needsRealData('anything important in my inbox')
        && needsRealData('how much profit did we make')
        && needsRealData('what is next on my pipeline')) },

    { name: 'an explicit vault lookup is caught even without the word "my"', run: () =>
      ok(needsRealData('search the second brain for janitorial pricing') && needsRealData('pull up the notes on Fort Indiantown Gap')) },

    { name: 'ordinary conversation is NOT hijacked to the tool brain', run: () =>
      ok(!needsRealData('what is a good way to structure an LLC operating agreement')
        && !needsRealData('explain how SCA wage determinations work')
        && !needsRealData('write me a short thank-you note')
        && !needsRealData('hello'), 'over-routing general chat') },

    { name: 'garbage input does not throw', run: () =>
      ok(needsRealData() === false && needsRealData(null) === false) },

    { name: 'CATCHES the L-014 bug: "create a note in my vault"', run: () =>
      ok(looksLikeAction('Create a note called "Places We Can Go Now" in my Obsidian vault')
        && looksLikeAction('make a new markdown file for my trip ideas')
        && looksLikeAction('save this as a document')) },

    { name: 'CATCHES the L-014 photo-album confabulation: "locate/open my photo album"', run: () =>
      ok(looksLikeAction('locate the Vacation Photos 2021 file')
        && looksLikeAction('open my photo album')
        && looksLikeAction('find the folder with my pictures')) },

    { name: 'CATCHES explicit send / submit / delete', run: () =>
      ok(looksLikeAction('send an email to the contracting officer')
        && looksLikeAction('submit the proposal')
        && looksLikeAction('delete that file')) },

    { name: 'does NOT catch ordinary questions / prose generation (no over-refusal)', run: () => {
      const clean = [
        "what's the weather today?",
        'write me a short cover letter',
        'explain how set-asides work',
        'how do I create a good resume?',
        'add 2 and 2 for me',
        'find out who the incumbent is',
        'make a plan for next week',
      ];
      const leaked = clean.filter((t) => looksLikeAction(t));
      return ok(leaked.length === 0, 'over-refused: ' + JSON.stringify(leaked));
    } },

    { name: 'never throws on empty / non-string input', run: () =>
      ok(looksLikeAction('') === false && looksLikeAction(null) === false && looksLikeAction(undefined) === false) },
  ],
};
