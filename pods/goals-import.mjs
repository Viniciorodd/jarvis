// goals-import.mjs — pull ten years of scattered goals out of the vault.
//
// From his note: *"I already have all of my goals that have been trying to track for the last 10 years. I've
// written them down... but again it's very very scattered."*
//
// So the import reads what he ALREADY WROTE rather than asking him to re-enter anything. A goal system whose
// first step is "now type in all your goals" is a system he abandons on day one — the whole complaint is that
// they're already written and invisible.
//
// PURE parsing here (eval-pinned); the file walk lives in the companion.
//
// It is deliberately conservative about what counts as a goal. A false goal ("Buy milk" scraped off a
// shopping list) pollutes the graph and drags the leverage ranking, which is the one number that has to stay
// trustworthy.

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Lines that look like an aspiration rather than a task or a note.
const GOAL_RE = /^(?:i (?:want|wish|would like|plan|aim|intend) to|own|buy|build|start|launch|reach|hit|achieve|become|acquire|get to|retire|travel|visit|learn|master|earn|make|save|pay off|invest)\b/i;

// Immediate rejects — the shape of a chore, a heading, or a note-to-self.
const NOT_A_GOAL = /^(?:call|email|text|reply|send|check|read|watch|listen|remember|note|ask|tell|schedule|book|order|pick up|drop off|clean|fix|update|review)\b/i;

const CATEGORIES = [
  ['financial', /\b(net worth|million|income|revenue|profit|cash ?flow|invest|portfolio|debt|save|savings|retire|passive)\b/i],
  ['real estate', /\b(house|home|property|properties|real estate|land|farm|vineyard|rental|unit|apartment|acre|cabin)\b/i],
  ['business', /\b(compan|business|llc|clients?|contracts?|agency|studio|saas|startup|brand)\b/i],
  ['lifestyle', /\b(jet|lamborghini|ferrari|bmw|cadillac|porsche|car|yacht|boat|watch|travel|vacation)\b/i],
  ['health', /\b(weight|gym|fit|run|marathon|health|sleep|diet|strength)\b/i],
  ['family', /\b(ana|wife|kids?|children|family|mother|father|parents|wedding|marry)\b/i],
  ['skill', /\b(learn|master|fluent|language|course|degree|certif|read \d+)\b/i],
];

// PURE: category from the text. 'other' when nothing matches — never guess a bucket, a wrong category
// splits goals that belong together in the graph.
export function categorize(text = '') {
  const t = String(text || '');
  for (const [name, re] of CATEGORIES) if (re.test(t)) return name;
  return 'other';
}

// Artefacts of the vault itself, learned from a real import over 6,142 notes. Template links dominated the
// results — "Master Journal Year: 2022 (../../Vault/Database/Master%20Journal…)" matched on the word
// "master" and appeared 25×, which would have put a navigation link at the top of his life's goals.
const ARTEFACT = /\.\.\/|%20|https?:|\]\(|\{\{|^\||\bdataview\b|\btemplat/i;

// PURE: is this line a goal? Conservative on purpose — a false goal drags the leverage ranking, and that
// ranking is the one number the whole product depends on being trustworthy.
export function looksLikeGoal(line = '') {
  const raw = clean(line);
  const s = raw.replace(/^[-*+•]\s*/, '').replace(/^\[[ xX]\]\s*/, '');
  if (s.length < 8 || s.length > 160) return false;
  if (/^#{1,6}\s/.test(raw)) return false;                    // a heading is a section, not a goal
  if (ARTEFACT.test(raw)) return false;                       // a template/link, not an ambition
  if (NOT_A_GOAL.test(s)) return false;
  if (/\?$/.test(s)) return false;                            // a question is not a goal
  // "Master Journal Month: September" — a short "Label: value" line is a field, not something he wants.
  // Allows up to four words before the colon; two was not enough for the real ones in his vault.
  if (/^(?:\w+[\s-]+){1,4}\w+:\s/.test(s)) return false;
  // After metadata is stripped, what's LEFT has to carry meaning. "Save the **x** ✅ 2026-07-06 #tag"
  // reduces to "Save the x" — technically long enough, actually nothing.
  // Stopwords don't count — "Save the x" has two 3-letter words and says nothing.
  const FILLER = /^(the|and|for|with|that|this|from|into|its|our|your|out|off|all|any)$/i;
  const words = cleanTitle(s).split(/\s+/).filter((w) => w.length > 2 && !FILLER.test(w));
  if (words.length < 2) return false;
  return GOAL_RE.test(s);
}

// PURE: strip the task metadata his vault carries — tags, completion ticks, priority marks, due dates and
// "(overdue from …)" — so a goal reads as the ambition rather than as a row from a task manager.
export function cleanTitle(text = '') {
  return clean(text)
    .replace(/^[-*+•]\s*/, '')
    .replace(/^\[[ xX]\]\s*/, '')
    .replace(/^i (?:want|wish|would like|plan|aim|intend) to\s+/i, '')
    .replace(/[📅⏳🛫➕✅]\s*\d{4}-\d{2}-\d{2}/g, '')
    .replace(/\((?:overdue|due|from)[^)]*\)/gi, '')
    .replace(/(?:^|\s)#[A-Za-z0-9_/-]+/g, '')
    .replace(/[🔺⏫🔼🔽⏬]/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/[.,;]$/, '')
    .trim();
}

// PURE: one file's lines → goals. `file` is carried so he can trace any goal back to where he wrote it —
// without that, an imported list is just another shelf.
export function goalsFromLines(lines = [], file = '') {
  const out = [];
  let section = '';
  for (const raw of (Array.isArray(lines) ? lines : [])) {
    const h = /^#{1,6}\s+(.*)$/.exec(String(raw));
    if (h) { section = clean(h[1]); continue; }
    if (!looksLikeGoal(raw)) continue;
    const title = cleanTitle(raw);
    if (title.length < 8) continue;                           // metadata-stripping can leave a stub
    const done = /^\s*[-*+]?\s*\[x\]/i.test(String(raw));
    out.push({
      id: 'G-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/-+$/, ''),
      title: title.charAt(0).toUpperCase() + title.slice(1),
      category: categorize(title),
      status: done ? 'achieved' : 'not started',
      source: file,
      section,
      actions: [],
    });
  }
  return out;
}

// PURE: merge goals found across many files. The same ambition written in three notes over ten years is ONE
// goal — deduping is the first thing that makes a scattered pile feel like a system.
export function mergeGoals(lists = []) {
  const out = [];
  for (const g of (Array.isArray(lists) ? lists : []).flat()) {
    if (!g || !g.id) continue;
    const hit = out.find((x) => x.id === g.id);
    if (!hit) { out.push({ ...g, sources: [g.source].filter(Boolean) }); continue; }
    if (g.source && !hit.sources.includes(g.source)) hit.sources.push(g.source);
    // Written more than once over the years = he kept coming back to it. That is signal worth keeping.
    hit.mentions = (hit.mentions || 1) + 1;
    if (g.status === 'achieved') hit.status = 'achieved';
  }
  return out.map((g) => ({ ...g, mentions: g.mentions || 1 }));
}
