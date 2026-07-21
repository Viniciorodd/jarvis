// book-to-ops.mjs — "turn a saved highlight into a concrete change to a business system, not just a filed
// note" (vault [[Jarvis]]). The vault holds 250+ books of Apple Books highlights that never become action.
// This is the pure core: parse a highlights file, map each highlight to the business system(s) it could
// improve, and emit a review card that PROMPTS a concrete operational change. Deterministic + eval-pinned;
// READ-ONLY on the vault (it never edits the operator's notes — it produces a review queue).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// The business systems a highlight can improve, keyed to the real pods, with trigger keywords.
export const SYSTEMS = [
  { key: 'gov', label: 'Gov contracting', kw: ['contract', 'bid', 'proposal', 'government', 'federal', 'rfp', 'procure', 'agency', 'past performance', 'subcontract'] },
  { key: 'offers', label: 'Offers & pricing', kw: ['offer', 'price', 'pricing', 'sell', 'sales', 'demand', 'value', 'guarantee', 'discount', 'margin', 'upsell'] },
  { key: 'fiverr', label: 'Fiverr / services', kw: ['gig', 'freelance', 'service', 'client', 'delivery', 'niche', 'portfolio'] },
  { key: 'realestate', label: 'Real estate', kw: ['property', 'rent', 'tenant', 'real estate', 'landlord', 'mortgage', 'cash flow', 'cap rate', 'flip'] },
  { key: 'finance', label: 'Money & finance', kw: ['cash', 'debt', 'invest', 'revenue', 'profit', 'budget', 'expense', 'capital', 'income'] },
  { key: 'ops', label: 'Systems & ops', kw: ['system', 'process', 'sop', 'automate', 'delegate', 'workflow', 'checklist', 'leverage', 'scale'] },
  { key: 'personal-dev', label: 'Personal effectiveness', kw: ['habit', 'focus', 'discipline', 'mindset', 'routine', 'energy', 'procrastin', 'consisten'] },
];

// PURE: parse an Apple-Books highlights markdown file → { title, author, highlights: [text] }.
export function parseBook(md = '') {
  const lines = String(md).split(/\r?\n/);
  let title = '', author = '';
  const highlights = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!title && line.startsWith('# ')) { title = line.slice(2).trim(); continue; }
    const am = line.match(/^\*by\s+(.+?)\*$/i); if (am && !author) { author = am[1].trim(); continue; }
    if (line.startsWith('>')) {
      const t = line.replace(/^>+\s?/, '').trim();
      if (!t || /highlights?\s+from\s+apple\s+books/i.test(t)) continue; // skip the "N highlights…" header
      highlights.push(t);
    }
  }
  return { title, author, highlights };
}

// PURE: which business systems a highlight could improve (keyword match, deduped, in SYSTEMS order).
export function mapToSystems(text = '') {
  const s = String(text).toLowerCase();
  return SYSTEMS.filter((sys) => sys.kw.some((k) => s.includes(k))).map((sys) => sys.key);
}

export function cardId(book, text) { return 'bo-' + crypto.createHash('sha1').update(`${book}|${text}`).digest('hex').slice(0, 10); }

// PURE: build review cards for the highlights that actually map to a system (skip fluff). Each card prompts
// a concrete change. seenIds dedupes across runs so a highlight only surfaces once until acted on.
export function buildReviewCards({ title = '', author = '', highlights = [] } = {}, seenIds = new Set(), { minLen = 25 } = {}) {
  const seen = seenIds instanceof Set ? seenIds : new Set(seenIds || []);
  const out = [];
  for (const text of highlights) {
    if (!text || text.length < minLen) continue;         // one-liners rarely carry an operational lever
    const systems = mapToSystems(text);
    if (!systems.length) continue;                        // not obviously actionable → don't nag with it
    const id = cardId(title, text);
    if (seen.has(id)) continue;
    const labels = systems.map((k) => (SYSTEMS.find((s) => s.key === k) || {}).label || k);
    out.push({
      id, book: title, author, text, systems,
      prompt: `From "${title}": “${text.slice(0, 180)}${text.length > 180 ? '…' : ''}” → what concrete change does this imply for your ${labels.join(' / ')} system (an SOP, a prompt, a pricing rule, a checklist step)? If none, skip it.`,
    });
  }
  return out;
}

// PURE: rank cards so the review queue leads with the highest-leverage systems (gov/offers/money first).
const PRIORITY = { gov: 0, offers: 1, finance: 2, realestate: 3, fiverr: 4, ops: 5, 'personal-dev': 6 };
export function rankCards(cards = []) {
  return [...cards].sort((a, b) => (PRIORITY[a.systems[0]] ?? 9) - (PRIORITY[b.systems[0]] ?? 9) || b.text.length - a.text.length);
}

// ── IO (kept out of the pure core above; evals import only the pure fns) ─────────────────────────────
export const HIGHLIGHTS_SUBDIR = path.join('05 - Knowledge', 'Book Highlights (Apple Books)');
export const STATE_FILE = path.join(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'book-ops-state.json');

export function loadSeen(file = STATE_FILE) { try { return new Set(JSON.parse(fs.readFileSync(file, 'utf8')).reviewed || []); } catch { return new Set(); } }
export function markReviewed(ids = [], file = STATE_FILE) {
  const seen = loadSeen(file); for (const id of ids) seen.add(id);
  try { fs.writeFileSync(file, JSON.stringify({ reviewed: [...seen] }, null, 2)); } catch { /* best-effort */ }
  return seen.size;
}

// READ-ONLY scan of the vault's Book Highlights folder → top-ranked, un-reviewed review cards. Never edits
// the operator's notes. Does NOT mark anything reviewed (that's an explicit action) so nothing is lost.
export function scanBooks({ vaultDir, seenIds, limit = 12 } = {}) {
  const dir = path.join(vaultDir, HIGHLIGHTS_SUBDIR);
  const seen = seenIds || loadSeen();
  let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { return { books: 0, total: 0, cards: [] }; }
  const cards = [];
  for (const f of files) {
    let md = ''; try { md = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    const b = parseBook(md);
    if (!b.title || /^unknown$/i.test(b.title)) b.title = f.replace(/\.md$/, ''); // fall back to the filename
    cards.push(...buildReviewCards(b, seen));
  }
  return { books: files.length, total: cards.length, cards: rankCards(cards).slice(0, limit) };
}
