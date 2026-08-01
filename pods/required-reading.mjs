// required-reading.mjs — which vault notes each agent MUST read before it writes anything (PRD "Control
// Center" Part A: "make the agents actually USE what we built this week").
//
// This is code, not a doc, for one reason: a "small agent → required-reading map" kept in prose drifts the
// moment a note is renamed, and nothing fails — the agent just quietly stops reading it and goes back to
// writing in a generic voice. Here it is resolvable, testable, and `verifyReading()` will TELL us when a
// note has gone missing instead of silently degrading.
//
// The vault is the source of truth (doctrine), so these are note TITLES, resolved at runtime by
// pods/vault-search.mjs — not paths, which move every time he reorganises.

// Every draft written in Vinicio's name gets the voice note. That is the whole point of having a voice.
export const ALL_WRITERS = ['✍️ Writing Voice — how Vinicio writes'];

export const READING = {
  // Vera — social ghostwriting
  'SOCIAL-01': ['📣 Social Media System + Ghostwriter Agent', '📈 Copy Profile — Sales Copy & Emails', '📣 Content Bank — Batch 1 (approve + schedule)'],
  // Remy — creative / gig copy and art direction
  'STUDIO-01': ['📈 Copy Profile — Sales Copy & Emails', '🎨 UI-UX Design Library (dashboards + landing pages)'],
  // Theo — SaaS builds are UI work
  'RECON-DEV': ['🎨 UI-UX Design Library (dashboards + landing pages)', '🖥️ Landing Page Profile — pages that convert'],
  // Hector — outreach emails to real subs and primes
  'CONNECT-01': ['📈 Copy Profile — Sales Copy & Emails'],
  // Patricia — proposals carry his name and his voice
  'GOV-ANALYST': ['📈 Copy Profile — Sales Copy & Emails'],
  // Marcus — strategy is judged against the North Star, not vibes
  'EXEC-01': ['🌟 Vision, Goals & Autonomy (North Star)'],
};

// PURE: the full reading list for one agent — its own notes plus the voice note every writer needs.
// De-duplicated and order-stable so a prompt built from this doesn't churn between runs. Eval-pinned.
export function readingFor(codename = '') {
  const own = READING[codename] || [];
  const out = [];
  for (const n of [...own, ...ALL_WRITERS]) if (n && !out.includes(n)) out.push(n);
  return out;
}

// PURE: agents that write in his name but have NO reading list — the drift detector. A new writing agent
// added without reading assignments is exactly how the voice quietly stops being his.
export function writersMissingReading(roster = []) {
  return (Array.isArray(roster) ? roster : [])
    .filter((p) => p && p.codename && !READING[p.codename])
    .map((p) => p.codename);
}

// PURE: does every assigned note exist among the vault's note NAMES? Takes the name list rather than a
// search function — existence-by-name is a directory walk, and doing it through content search read all
// 6,115 notes once per title and made the Control Center take 19.7s to answer (measured 2026-08-01).
// Comparison is normalised because the titles carry emoji and punctuation that vary by keyboard.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function verifyReading(noteNames = []) {
  const have = new Set((Array.isArray(noteNames) ? noteNames : []).map(norm));
  const titles = [];
  for (const list of [...Object.values(READING), ALL_WRITERS]) {
    for (const t of list) if (!titles.includes(t)) titles.push(t);
  }
  // An empty vault listing means we could not read the vault — report nothing missing rather than claiming
  // every note is gone, which would cry wolf on the panel every time the disk hiccups.
  if (!have.size) return { checked: titles.length, missing: [], unknown: true };
  return { checked: titles.length, missing: titles.filter((t) => !have.has(norm(t))) };
}
