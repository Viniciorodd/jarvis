// Regression suite for the absorb transcript cleaner (scripts/absorb.mjs). Pins the VTT → readable-text
// logic so transcripts in the notes stay clean (no timestamps, tags, or rolling auto-caption duplicates).

import { vttToText, paragraphs } from '../scripts/absorb.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const SAMPLE_VTT = `WEBVTT
Kind: captions
Language: en

00:00:01.000 --> 00:00:03.000
hey it's jared and today

00:00:03.000 --> 00:00:05.000
hey it's jared and today
i want to show you

00:00:05.000 --> 00:00:07.000
<00:00:05.500><c> i want to show you</c> my system`;

export default {
  agent: 'absorb',
  cases: [
    { name: 'vttToText strips timestamps, headers, and inline tags', run: () => {
      const t = vttToText(SAMPLE_VTT);
      return ok(!/-->/.test(t) && !/WEBVTT|Kind:|Language:/.test(t) && !/<[^>]+>/.test(t) && !/\d{2}:\d{2}/.test(t), t);
    } },
    { name: 'vttToText drops rolling auto-caption duplicate lines', run: () => {
      const t = vttToText(SAMPLE_VTT);
      const hey = (t.match(/hey it's jared and today/g) || []).length;
      return ok(hey === 1 && /i want to show you my system/.test(t), t);
    } },
    { name: 'paragraphs groups sentences with blank lines', run: () => {
      const p = paragraphs('One. Two. Three. Four. Five. Six.');
      return ok(p.includes('\n\n') && /One\. Two\. Three\. Four\./.test(p), JSON.stringify(p));
    } },
  ],
};
