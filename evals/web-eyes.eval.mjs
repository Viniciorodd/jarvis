// Regression suite for web-eyes (pods/web-eyes.mjs) — the clean web→Markdown "eyes". Pins the pure
// html→markdown extraction (Readability strips nav/footer boilerplate; Turndown yields real Markdown) and the
// honest never-throw contract. Network (readWeb) is verified live separately; here everything runs on fixtures.

import { htmlToMarkdown, readWeb } from '../pods/web-eyes.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const ARTICLE = `<html><head><title>Rodgate Test Article</title></head><body>
<nav><a href="/">Home</a> <a href="/about">About Us</a> <a href="/contact">Contact</a></nav>
<article><h1>Janitorial Services Overview</h1>
<p>Rodgate provides commercial custodial and floor-care services to federal and commercial facilities, sized to each requirement, with an on-site supervisor per shift and a documented quality-control plan.</p>
<p>Our crews are cross-trained and backed by on-call relief so that scheduled coverage is never missed, and we comply with the applicable Service Contract Labor Standards wage determination for the place of performance.</p></article>
<footer>Copyright 2026 Rodgate LLC — all rights reserved</footer></body></html>`;

export default {
  agent: 'web-eyes',
  cases: [
    { name: 'htmlToMarkdown extracts the article heading + body as Markdown', run: () => {
      const r = htmlToMarkdown(ARTICLE, 'https://rodgatelimited.com/x');
      return ok(/Janitorial Services Overview/.test(r.markdown) && /on-site supervisor per shift/.test(r.markdown) && r.markdown.length > 50, r.markdown.slice(0, 80));
    } },

    { name: 'strips boilerplate — the footer copyright line is not in the extracted article', run: () => {
      const r = htmlToMarkdown(ARTICLE, 'https://rodgatelimited.com/x');
      return ok(!/all rights reserved/i.test(r.markdown), r.markdown.slice(-80));
    } },

    { name: 'empty / garbage HTML → empty markdown, never throws', run: () => {
      const r = htmlToMarkdown('');
      return ok(typeof r.markdown === 'string' && r.markdown === '', JSON.stringify(r).slice(0, 60));
    } },

    { name: 'readWeb rejects a non-URL honestly (no fetch, no throw)', run: async () => {
      const r = await readWeb('not a url');
      return ok(r.ok === false && /URL/i.test(r.error), JSON.stringify(r));
    } },

    { name: 'readWeb uses the injected fetch → returns clean markdown of the fetched HTML', run: async () => {
      const fetchImpl = async () => ({ ok: true, text: async () => ARTICLE });
      const r = await readWeb('https://rodgatelimited.com/services', { fetchImpl });
      return ok(r.ok && /Janitorial Services Overview/.test(r.markdown) && r.chars > 50, JSON.stringify({ ok: r.ok, chars: r.chars }));
    } },
  ],
};
