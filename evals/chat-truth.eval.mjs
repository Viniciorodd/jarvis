// Regression suite for the chat anti-confabulation guard (pods/chat-truth.mjs, Lessons L-014). Pins the
// deterministic line between "a real action the tool-less free brain must HONESTLY refuse" (so it can't
// confabulate a fake success like the L-014 vault-note / photo-album bug) and "ordinary chat / prose it can
// answer normally". Over-refusing is annoying; under-refusing lets the local model LIE — this pins both edges.

import { looksLikeAction } from '../pods/chat-truth.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'chat-truth',
  cases: [
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
