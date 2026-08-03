// goals.mjs — the goal graph, and the one number that makes it useful.
//
// From `☑️ Goal Visualizer & Reverse-Engineering Engine`. His problem, in his words: *"having written goals
// sometimes feels like writing something and putting it in a shelf and never seeing them again... if you're
// not constantly thinking about a goal, seeing it, you're not pursuing it."* Ten years of goal notes,
// scattered, with no connections drawn between them.
//
// THE INSIGHT WORTH BUILDING FOR — and it's his, not mine: *"for most of them it's the same set of actions
// that need to take place."* A private jet and a Lamborghini look unrelated on paper and are the same goal
// underneath: build a company that throws off cash. So the product is not a prettier goal list. It is
// **shared-action detection** — the thing that turns a scattered wish list into a RANKED list, where the top
// item moves six goals at once.
//
// PURE and eval-pinned, because the ranking is the product. An LLM does the reverse-engineering (breaking
// "own a private jet" into a chain) — that's language work. The overlap maths, the leverage score and the
// ordering are code, because a model that reshuffles his priorities differently on every run is a toy.

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Words that carry no meaning for matching two actions. Without this, "build a company" and "build a habit"
// look similar because they share "build".
const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'my', 'your', 'get',
  'have', 'that', 'with', 'from', 'at', 'by', 'is', 'be', 'it', 'this', 'each', 'per', 'into', 'more']);

// PURE: the meaningful words of an action, singularised loosely so "companies" matches "company".
export function actionTerms(text = '') {
  return norm(text).split(' ')
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => w.replace(/ies$/, 'y').replace(/(\w{4,})s$/, '$1'));
}

// PURE: do two actions mean the same thing? Jaccard over meaningful terms. Deliberately strict — merging two
// actions that AREN'T the same would invent leverage that doesn't exist, and a wrong "this moves 6 goals"
// is worse than missing an overlap, because he'd reorganise his year around it.
export function sameAction(a = '', b = '', threshold = 0.6) {
  const A = new Set(actionTerms(a)), B = new Set(actionTerms(b));
  if (!A.size || !B.size) return false;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  const union = new Set([...A, ...B]).size;
  return union > 0 && shared / union >= threshold;
}

// PURE: collapse every goal's action chain into unique actions, each carrying the goals it serves.
// `goals` = [{ id, title, actions: [string] }]. Returns actions sorted by LEVERAGE — how many goals move.
export function sharedActions(goals = []) {
  const list = (Array.isArray(goals) ? goals : []).filter((g) => g && g.id);
  const buckets = [];
  for (const g of list) {
    for (const raw of (g.actions || [])) {
      const text = String(raw || '').trim();
      if (!text) continue;
      const hit = buckets.find((b) => sameAction(b.action, text));
      if (hit) {
        if (!hit.goals.includes(g.id)) hit.goals.push(g.id);
        // Keep the shortest phrasing — it reads as the general action rather than one goal's version of it.
        if (text.length < hit.action.length) hit.action = text;
      } else {
        buckets.push({ action: text, goals: [g.id] });
      }
    }
  }
  return buckets
    .map((b) => ({ ...b, leverage: b.goals.length }))
    // Highest leverage first; ties broken by the shorter (more general) action, then alphabetically so the
    // order is STABLE. A ranked list that reshuffles between runs is one he stops trusting.
    .sort((x, y) => y.leverage - x.leverage || x.action.length - y.action.length || x.action.localeCompare(y.action));
}

// PURE: the graph. Nodes = goals, edges = a shared action between two goals. This is the picture he's after —
// the thing that shows a jet and a Lamborghini are the same problem.
export function goalGraph(goals = []) {
  const list = (Array.isArray(goals) ? goals : []).filter((g) => g && g.id);
  const shared = sharedActions(list).filter((a) => a.leverage > 1);
  const edges = [];
  for (const a of shared) {
    for (let i = 0; i < a.goals.length; i++) {
      for (let j = i + 1; j < a.goals.length; j++) {
        const from = a.goals[i], to = a.goals[j];
        const found = edges.find((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from));
        if (found) found.via.push(a.action);
        else edges.push({ from, to, via: [a.action] });
      }
    }
  }
  const nodes = list.map((g) => ({
    id: g.id,
    title: g.title || g.id,
    category: g.category || '',
    status: g.status || 'not started',
    actionCount: (g.actions || []).length,
    // How connected this goal is — a goal sharing nothing with anything is a genuine outlier worth seeing.
    links: edges.filter((e) => e.from === g.id || e.to === g.id).length,
  }));
  return { nodes, edges };
}

// PURE: the answer to "what do I do this week". The top actions by leverage, with what they unlock named —
// a number with no names attached is not motivating, and naming them is the whole point of the graph.
export function nextActions(goals = [], { limit = 5 } = {}) {
  const byId = new Map((Array.isArray(goals) ? goals : []).map((g) => [g.id, g.title || g.id]));
  return sharedActions(goals).slice(0, limit).map((a) => ({
    action: a.action,
    leverage: a.leverage,
    unlocks: a.goals.map((id) => byId.get(id) || id),
    line: a.leverage > 1
      ? `${a.action} — moves ${a.leverage} goals: ${a.goals.map((id) => byId.get(id) || id).join(' · ')}`
      : `${a.action} — ${byId.get(a.goals[0]) || a.goals[0]}`,
  }));
}

// PURE: goals that share nothing with anything else. Honest signal, not a scolding — sometimes the outlier
// is the most important thing he wants, and sometimes it's a stray wish that crept onto the list.
export function orphanGoals(goals = []) {
  const g = goalGraph(goals);
  return g.nodes.filter((n) => n.links === 0).map((n) => n.title);
}
