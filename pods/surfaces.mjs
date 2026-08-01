// surfaces.mjs — every screen Jarvis can put in front of him, in ONE place.
//
// Operator, 2026-08-01: *"Everything should be reachable by talking to Jarvis. Tabs are just a fallback.
// We want Jarvis to open up these tabs, pull information, pull data together, show it to me cleanly."*
//
// Two problems this solves at once:
//
//  1. VOICE. "show me the gov board" has to resolve to a real route. Resolving it in the model's head means
//     it invents `/pipeline` and he gets a 404 — the same confabulation class as everything else this week.
//     `resolveSurface()` matches against a fixed list and returns null when nothing matches, so Jarvis says
//     "I don't have a screen for that" instead of navigating him into a wall.
//
//  2. TOO MANY TABS. He had twelve destinations. The nav and the voice router now read the SAME list, so a
//     surface can be demoted from the drawer without becoming unreachable — it just stops being a tab and
//     stays a thing he can ask for. That is the whole point: fewer tabs, not fewer capabilities.
//
// `primary: true` = earns a place in the drawer. Everything else is voice-and-More-menu only.

export const SURFACES = [
  // ── the four that earn a permanent tab ──
  { id: 'home',      route: '/',            name: 'Home',            primary: true,
    says: 'the one thing, approvals, the day at a glance',
    aliases: ['home', 'cockpit', 'dashboard', 'the glance', 'main screen', 'start'] },
  { id: 'today',     route: '/#today',      name: 'Today',           primary: true,
    says: 'tasks, calendar, capture',
    aliases: ['today', 'my day', 'tasks', 'to do', 'todo', 'task list', 'calendar', 'schedule', 'agenda'] },
  { id: 'talk',      route: '/#talk',       name: 'Jarvis',          primary: true,
    says: 'the conversation',
    aliases: ['jarvis', 'talk', 'chat', 'conversation', 'assistant'] },
  { id: 'ops',       route: '/#ops',        name: 'Ops',             primary: true,
    says: 'every business and whose move is next',
    aliases: ['ops', 'operations', 'businesses', 'business', 'my businesses', 'the hub'] },

  // ── reachable by asking; no permanent tab ──
  { id: 'govcon',    route: '/govcon',      name: 'GovCon OS',
    says: 'the gov pipeline, deal room, subs, teaming',
    aliases: ['gov', 'govcon', 'gov board', 'pipeline', 'gov pipeline', 'bids', 'the board', 'government', 'contracts', 'opportunities'] },
  { id: 'control',   route: '/control',     name: 'Control Center',
    says: 'every agent, its switch and its autonomy tier',
    aliases: ['control', 'control center', 'agents', 'the team', 'roster', 'kill switch', 'autonomy', 'tiers'] },
  { id: 'eyes',      route: '/eyes',        name: 'Eyes',
    says: 'the camera, with gesture control',
    aliases: ['eyes', 'camera', 'gestures', 'webcam', 'vision'] },
  { id: 'finances',  route: '/finances',    name: 'Finances',
    says: 'money in, tax, credit, debts',
    aliases: ['money', 'finances', 'finance', 'cash', 'p&l', 'pnl', 'profit', 'tax', 'credit', 'debt'] },
  { id: 'realestate', route: '/real-estate', name: 'Real Estate',
    says: 'the portfolio and the deal analyzer',
    aliases: ['real estate', 'property', 'properties', 'rentals', 'units', 'deal analyzer', 'flips'] },
  { id: 'ideas',     route: '/ideas',       name: 'Ideas',
    says: 'ideas waiting on your yes',
    aliases: ['ideas', 'idea vault', 'suggestions'] },
  { id: 'focus',     route: '/focus',       name: 'Focus',
    says: 'time and focus',
    aliases: ['focus', 'time', 'deep work'] },
  { id: 'quickwins', route: '/quickwins',   name: 'Quick wins',
    says: 'fast-close one-off jobs',
    aliases: ['quick wins', 'quickwins', 'easy money', 'small jobs'] },
  { id: 'teaming',   route: '/teaming',     name: 'Teaming',
    says: 'primes who need small-business subs',
    aliases: ['teaming', 'primes', 'partners'] },
  { id: 'lendability', route: '/lendability', name: 'Lendability',
    says: 'business credit and borrowing power',
    aliases: ['lendability', 'lending', 'borrow', 'business credit', 'loans'] },
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// PURE: spoken words → a surface, or null. Never guesses: an unmatched phrase returns null so Jarvis can say
// "I don't have a screen for that" rather than navigating him somewhere invented. Eval-pinned.
export function resolveSurface(text = '') {
  const t = norm(text);
  if (!t) return null;
  // Strip the framing verbs so "open up the gov board please" matches the same as "gov board".
  // Strip how people actually ask, not just imperatives — "what about tax" and "how are my debts" are the
  // same request as "tax" and "debts". Leaving the filler in made the extra-words guard below reject them.
  const core = t
    .replace(/^(please\s+)?(can you\s+|could you\s+)?(go to|take me to|bring up|pull up|pull|open up|open|show me|show|display|navigate to|jump to|switch to|see|check|what about|how about|hows|how is|how are|where is|where are|whats|what is|lets see|i want|i need)\s+/, '')
    .replace(/^(the|my|our)\s+/, '')
    .replace(/\s+(please|now|screen|page|tab|view|at|doing|looking)$/g, '')
    .trim();
  const hay = (core || t).replace(/^(the|my)\s+/, '');
  const bare = (a) => norm(a).replace(/^(the|my|our)\s+/, '');
  // Plural tolerance: he says "my debts", the alias is "debt". Only a trailing s, deliberately — anything
  // cleverer starts matching words that merely look alike.
  const sing = (x) => x.replace(/(\w{3,})s$/, '$1');
  const forms = [hay, sing(hay)];
  // Exact alias first — "ops" must not lose to a longer alias that happens to contain it.
  for (const s of SURFACES) if (s.aliases.some((a) => forms.includes(bare(a)) || forms.includes(sing(bare(a))))) return s;
  // Then longest WHOLE-PHRASE alias inside what he said, preferring the more specific screen.
  // Only this direction: allowing an alias to contain the phrase made "board" match "dashboard" and sent
  // "take me to the board" to Home. And a match must not be swamped by unrelated words — "quarterly unicorn
  // dashboard" is not a request for the dashboard, so more than one extra word means no match at all.
  const words = hay.split(' ').filter(Boolean).length;
  let best = null, bestLen = 0;
  for (const s of SURFACES) {
    for (const a of s.aliases) {
      const na = bare(a);
      if (na.length < 3 || na.length <= bestLen) continue;
      if (!new RegExp('(^|\\s)' + na.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|\\s)').test(hay)) continue;
      if (words - na.split(' ').length > 1) continue;
      best = s; bestLen = na.length;
    }
  }
  return best;
}

// PURE: the drawer list — only the surfaces that earn a permanent tab.
export function primarySurfaces() { return SURFACES.filter((s) => s.primary); }

// PURE: what Jarvis can offer when she doesn't recognise a request — real options only, never invented ones.
export function surfaceMenu() { return SURFACES.map((s) => s.name + ' (' + s.says + ')'); }
