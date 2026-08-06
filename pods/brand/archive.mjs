// archive.mjs — reading his own published posts back out of the vault.
//
// THE SEEDING STEP EVERYONE MISSES. From the Rogoff teardown: his first auto-research run returned
// nothing, because the scraper only looked at posts the pipeline itself had made. He fixed it by
// scraping his last 25 posts to seed a baseline. *"Without seeding, the loop has nothing to learn
// from on day one."*
//
// There are 897 here, exported 2026-07-19, and they are better than a scrape: no transcription
// layer, no OCR, no third-party API. `X Archive (own posts).md` in the vault, retweets and
// @-replies already stripped, so what remains is only what he typed and published.
//
// AND THEY CARRY ENGAGEMENT. Each post stores its likes and retweets:
//
//     **2018-10-24** · ❤️ 3 🔁 1
//     > 2 minutes of my life I'll never get back.
//
// That matters more than it looks. The Rogoff read assumed "the outcome half attaches the day you
// start posting again" — it does not have to. There are eight years of real outcomes sitting in the
// vault, so the features table has a baseline before the first new post rather than after.
//
// WHAT THIS CANNOT GIVE YOU, and it is the important limit: the archive holds his posts and their
// COUNTS. It holds no commenters. The question worth six dollars — *is anyone who follows me someone
// who would ever buy this* — needs the people who replied, and they are not in this file. `score()`
// in features.mjs returns null without audience composition, and that is the correct answer here.
//
// PURE and eval-pinned. The file read lives in the seeder.

const clean = (s) => String(s || '').replace(/\r\n/g, '\n');

// **2026-07-19** · ❤️ 12 🔁 3   — the counts are optional; a post with neither still parses.
const HEAD = /^\*\*(\d{4}-\d{2}-\d{2})\*\*(?:\s*·\s*(?:❤️\s*(\d+))?\s*(?:🔁\s*(\d+))?)?\s*$/;

// PURE: the archive markdown → one record per post, in file order.
//
// Body lines are the `> ` block under each header. Blank `>` lines are real line breaks in the post,
// so they are kept — line count and average line length are two of the tracked features, and
// flattening them would quietly change the shape of every multi-line post.
export function parseArchive(md = '') {
  const lines = clean(md).split('\n');
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const text = cur.body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text) out.push({ date: cur.date, likes: cur.likes, retweets: cur.retweets, text });
    cur = null;
  };
  for (const raw of lines) {
    const h = HEAD.exec(raw.trim());
    if (h) {
      flush();
      cur = { date: h[1], likes: h[2] === undefined ? null : Number(h[2]), retweets: h[3] === undefined ? null : Number(h[3]), body: [] };
      continue;
    }
    if (!cur) continue;
    if (/^>/.test(raw)) { cur.body.push(raw.replace(/^>\s?/, '')); continue; }
    // A heading or a horizontal rule ends the post; ordinary blank lines inside it do not.
    if (/^(#{1,6}\s|---\s*$)/.test(raw.trim())) flush();
  }
  flush();
  return out;
}

// PURE: total engagement. Nulls stay null rather than becoming zero — an unknown count and a post
// nobody touched are different facts, and only one of them is bad news.
export function engagement(p = {}) {
  // `== null` on purpose: a missing property is undefined, not null, and treating that as 0 was the
  // exact "unknown becomes zero" mistake this function exists to avoid.
  const l = p && p.likes, r = p && p.retweets;
  if (l == null && r == null) return null;
  return (Number(l) || 0) + (Number(r) || 0);
}

// Someone ELSE's words that he posted. "Nothing important comes with instructions. —JAMES RICHARDSON"
// is a real archive entry, and it is a quote, not his voice.
//
// This matters only for the examples corpus: a producer told to imitate these would learn to write
// like a quote account. They stay in the features table, because he did publish them and they did
// draw engagement — the point is that they are not a model for his sentences.
const ATTRIB = /[—–-]\s*[A-Z][A-Za-z. ]{2,30}$/;
export function isQuotePost(text = '') {
  const t = String(text || '').trim();
  if (!t) return false;
  const quoted = /^["“”']/.test(t);
  // Strip a trailing quote mark before matching the attribution. The closing “ on
  // `—JAMES RICHARDSON”` defeated the `$` anchor, so the most obviously-a-quote posts in the whole
  // archive were the ones slipping past — they are exactly the ones that end with a closing quote.
  const lastLine = (t.split('\n').map((s) => s.trim()).filter(Boolean).pop() || '')
    .replace(/["“”']+\s*$/, '').trim();
  return (quoted && ATTRIB.test(lastLine)) || (ATTRIB.test(lastLine) && t.split(/\s+/).length < 40);
}

// A retweet-shaped or link-only post carries no writing to learn from.
export function isThin(text = '') {
  const t = String(text || '').trim();
  const withoutLinks = t.replace(/https?:\/\/\S+/g, '').trim();
  return withoutLinks.split(/\s+/).filter(Boolean).length < 4;
}

// PURE: the posts worth showing a model as "this is how he writes".
//
// Ranked by engagement, with quotes and stubs removed. Nulls sort last: a post with no recorded
// counts is not evidence of anything, in either direction.
export function topPerformers(posts = [], limit = 40) {
  return (Array.isArray(posts) ? posts : [])
    .filter((p) => p && p.text && !isQuotePost(p.text) && !isThin(p.text))
    .map((p) => ({ ...p, engagement: engagement(p) }))
    .filter((p) => p.engagement !== null)
    .sort((a, b) => b.engagement - a.engagement || String(a.date).localeCompare(String(b.date)))
    .slice(0, Math.max(1, limit));
}

// PURE: what the archive actually contains, for the seeder to report honestly.
export function summary(posts = []) {
  const list = Array.isArray(posts) ? posts : [];
  const scored = list.filter((p) => engagement(p) !== null);
  return {
    posts: list.length,
    withCounts: scored.length,
    quotes: list.filter((p) => isQuotePost(p.text)).length,
    thin: list.filter((p) => isThin(p.text)).length,
    first: list.length ? list[0].date : '',
    last: list.length ? list[list.length - 1].date : '',
    // Deliberately NOT reported as an average engagement "score" — see the file header. Composition
    // is unknown, so any ranking here is reach, and reach is the thing this system refuses to chase.
  };
}
