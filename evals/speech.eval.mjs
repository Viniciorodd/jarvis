// Regression suite for spoken-text cleanup (pods/speech.mjs). From a live voice test on 2026-07-29 — the
// operator heard Jarvis read the literal asterisks out of "**does exist**". Markdown is a screen format;
// the voice must never pronounce it. The transcript on screen keeps its emphasis.

import { speakable } from '../pods/speech.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'speech',
  cases: [
    { name: 'THE BUG HE HEARD: "**does exist**" is spoken as "does exist"', run: () => {
      const s = speakable('the agreement **does exist** — drawn up around **October 2024**');
      return ok(!s.includes('*') && /does exist/.test(s) && /October 2024/.test(s), s);
    } },

    { name: 'no asterisk or underscore survives any emphasis form', run: () => {
      const s = speakable('***triple*** **double** *single* __under__ _one_');
      return ok(!/[*_]/.test(s) && /triple double single under one/.test(s), s);
    } },

    { name: 'an em-dash becomes a real breath, not silence', run: () =>
      ok(/81%, 19%/.test(speakable('81% — 19%')), speakable('81% — 19%')) },

    { name: 'wikilinks and markdown links speak their words, never their paths or URLs', run: () => {
      const s = speakable('see [[00 - System/Notes.md|the care note]] and [NIH](https://nih.gov)');
      return ok(/the care note/.test(s) && /NIH/.test(s) && !/https|\.md|\[\[/.test(s), s);
    } },

    { name: 'bullets and headings do not become "dash" / "hash"', run: () => {
      const s = speakable('## Next steps\n- locate the copy\n- review terms');
      return ok(!/[#-]/.test(s) && /Next steps/.test(s) && /locate the copy/.test(s), s);
    } },

    { name: 'money and percentages are LEFT ALONE (every engine says them well)', run: () =>
      ok(speakable('bid $4,956 at 18%') === 'bid $4,956 at 18%', speakable('bid $4,956 at 18%')) },

    { name: 'a code block is not read aloud character by character', run: () =>
      ok(!/const|=>/.test(speakable('run this:\n```js\nconst x = () => 1\n```\ndone')), speakable('run this:\n```js\nconst x = () => 1\n```\ndone')) },

    { name: 'line breaks become sentence breaks, never run-on speech', run: () => {
      const s = speakable('first line\nsecond line');
      return ok(/first line\. second line/.test(s), s);
    } },

    { name: 'no doubled or floating punctuation is left behind', run: () => {
      const s = speakable('**Done.**\n\n- next\n');
      return ok(!/\.\s*\./.test(s) && !/\s\./.test(s), JSON.stringify(s));
    } },

    { name: 'ordinary prose is returned untouched', run: () =>
      ok(speakable('We confirmed the agreement exists.') === 'We confirmed the agreement exists.') },

    { name: 'empty / garbage input does not throw', run: () =>
      ok(speakable() === '' && speakable(null) === '' && speakable('   ') === '') },
  ],
};
