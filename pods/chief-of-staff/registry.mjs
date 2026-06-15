// Pod registry — the org chart the Chief of Staff routes across (doctrine §2: "you are a CEO").
// Each pod: id, name, aliases (keywords the deterministic classifier matches), what it does.
// NOTE: gating is NOT per-pod — it is per action_kind, decided in code (doctrine §9 rule 2).
// This file is only the routing map (which department handles a request).

export const PODS = [
  // CoS is the default pod, so its aliases are only true domain words — NOT generic action verbs
  // (summarize/plan/status), which would otherwise hijack routing away from the real owner pod.
  { id: 'chief-of-staff', name: 'Chief of Staff', icon: '📬',
    aliases: ['brief', 'briefing', 'calendar', 'schedule', 'inbox', 'agenda', 'my day', 'morning'],
    does: 'email/calendar triage, briefings, routing — the front door' },
  { id: 'gov', name: 'Gov War Room', icon: '🏛️',
    aliases: ['sam.gov', 'sam ', 'solicitation', 'rfp', 'rfq', 'sources sought', 'bid', 'no-bid', 'proposal', 'contract', 'naics', 'federal', 'west point', 'subcontract', 'capability statement'],
    does: 'SAM.gov scout, bid/no-bid scoring, proposal assembly — operator signs & submits' },
  { id: 'fiverr', name: 'Fiverr Studio', icon: '🎨',
    aliases: ['thumbnail', 'thumbnails', 'cover', 'logo', 'gig', 'fiverr', 'image', 'design', 'mockup', 'poster', 'banner', 'artwork', 'illustration'],
    does: 'thumbnails, covers, product art, gig delivery (real image gen, code-capped spend)' },
  { id: 'saas', name: 'Software Lab', icon: '🛠️',
    aliases: ['recon', 'recontweaks', 'saas', 'support ticket', 'support', 'bug', 'release', 'changelog', 'feature', 'churn', 'onboarding', 'patch'],
    does: 'ReconTweaks / SaaS support triage, releases, growth' },
  { id: 'vault', name: 'Knowledge Vault', icon: '🧠',
    aliases: ['ingest', 'transcribe', 'note', 'notes', 'journal', 'recall', 'remember', 'organize', 'document', 'upload', 'file this'],
    does: 'ingest / transcribe / organize / recall knowledge' },
  { id: 'research-risk', name: 'Research & Risk Desk', icon: '📈',
    aliases: ['market', 'stock', 'crypto', 'watchlist', 'earnings', 'trade', 'trading', 'risk', 'portfolio', 'options', 'ticker', 'meme coin'],
    does: 'MONITOR + JOURNAL ONLY — never executes trades (doctrine §7)' },
  { id: 'etsy', name: 'Etsy & POD Workshop', icon: '👕',
    aliases: ['etsy', 'print on demand', 'pod ', 'listing', 'tshirt', 't-shirt', 'merch', 'printify'],
    does: 'trend scout + original (trademark-checked) design listings' },
  { id: 'content', name: 'Content Lab', icon: '🎬',
    aliases: ['blog', 'article', 'newsletter', 'short-form', 'script', 'seo', 'content', 'video idea'],
    does: 'blog / affiliate / short-form content' },
];

export function findPod(id) { return PODS.find((p) => p.id === id) || null; }
export const POD_IDS = PODS.map((p) => p.id);
