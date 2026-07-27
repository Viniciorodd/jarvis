// web-eyes.mjs — clean web → Markdown, in Node, at $0 (the Firecrawl/Crawl4AI *capability*, ported into Jarvis
// rather than installing a hosted API or a Python service). Fetches a page, extracts the readable article with
// Mozilla Readability (strips nav/ads/boilerplate), and converts it to Markdown with Turndown — so Jarvis (and
// the action brain) can actually READ the web, not just link to it. Best-effort: never throws; a failure returns
// { ok:false, error } so a caller degrades honestly (doctrine: never fabricate what it couldn't read).
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

const td = () => new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
const CAP = 24000; // keep a page's markdown bounded so it doesn't blow a prompt/response

// PURE (given html): extract the readable article → Markdown. Falls back to the whole body when Readability
// can't isolate an article. Returns { title, markdown, excerpt }. Never throws. Eval-pinned.
export function htmlToMarkdown(html, url = '') {
  try {
    const dom = new JSDOM(String(html || ''), { url: /^https?:/i.test(url) ? url : 'https://example.invalid/' });
    const doc = dom.window.document;
    const docTitle = (doc.title || '').trim();
    let article = null;
    try { article = new Readability(doc.cloneNode(true)).parse(); } catch { /* readability failed → body fallback */ }
    const html2 = (article && article.content) || (doc.body && doc.body.innerHTML) || '';
    const markdown = td().turndown(html2).replace(/\n{3,}/g, '\n\n').trim().slice(0, CAP);
    return { title: (article && article.title) || docTitle, markdown, excerpt: (article && article.excerpt) || '' };
  } catch (e) { return { title: '', markdown: '', excerpt: '', error: e.message }; }
}

// Best-effort network: fetch a URL and return its clean Markdown. `render:true` uses the Playwright browser
// (pods/browser.mjs) for JS-heavy pages that ship no server-rendered HTML. Never throws.
export async function readWeb(url, { render = false, timeoutMs = 20000, fetchImpl = fetch } = {}) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return { ok: false, error: 'a full http(s):// URL is required' };
  let html = '';
  try {
    if (render) {
      const { renderHtml } = await import('./browser.mjs').catch(() => ({}));
      if (typeof renderHtml === 'function') html = await renderHtml(u, { timeoutMs });
    }
    if (!html) {
      const r = await fetchImpl(u, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; JarvisWebEyes/1.0)' }, signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
      html = await r.text();
    }
  } catch (e) { return { ok: false, error: e.message }; }
  const md = htmlToMarkdown(html, u);
  if (!md.markdown) {
    // static fetch got nothing readable → try rendering once before giving up
    if (!render) return readWeb(u, { render: true, timeoutMs, fetchImpl });
    return { ok: false, error: md.error || 'no readable content on the page' };
  }
  return { ok: true, url: u, title: md.title, excerpt: md.excerpt, markdown: md.markdown, chars: md.markdown.length };
}
