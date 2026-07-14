// The org — the chain of command you talk to (doctrine §2: "you are a CEO, not a wizard with a genie").
// Each agent is a PERSON with a human nickname + a codename + a title + who they report to. You address
// anyone by name ("ask Victor for a P&L", "have Camille review this lease") and the Chief-of-Staff router
// resolves it. Nicknames are yours to rename — this is just config.
//
// Gating is NEVER per-person; it is per action_kind, decided in code (doctrine §9 rule 2). Seniority here
// is for routing + reporting lines + which model tier the role uses, not for bypassing gates.

export const ROSTER = [
  { codename: 'EXEC-01', nickname: 'Marcus', title: 'CEO', pod: 'exec', reports_to: null, tier: 'reflect',
    aliases: ['ceo', 'marcus', 'strategy', 'priorities', 'focus this week', 'big picture', 'what should i focus on'],
    does: 'Sets weekly strategy, priorities, and focus. Frames the week and reviews performance.' },
  { codename: 'LEDGER-01', nickname: 'Victor', title: 'CFO', pod: 'exec', reports_to: 'EXEC-01', tier: 'draft',
    aliases: ['cfo', 'victor', 'finance', 'financial', 'money', 'p&l', 'pnl', 'profit', 'cash', 'cashflow', 'budget', 'invoice', 'pricing', 'margin', 'runway', 'how much did we'],
    does: 'Tracks spend / P&L / cash, pricing, invoices; reads the spend ledger. Never moves money without you.' },
  { codename: 'TAX-01', nickname: 'Sage', title: 'Tax & Wealth', pod: 'exec', reports_to: 'LEDGER-01', tier: 'draft',
    aliases: ['tax', 'taxes', 'tax guy', 'what do i owe', 'set aside', 'deduction', 'deductions', 'quarterly', 'write-off', 'write off', 'debt', 'payoff', 'credit score', 'irs'],
    does: 'Year-round tax ops: live set-aside estimate, deduction ledger, savings buckets, debt payoff plan. Never files or pays — computes and reminds.' },
  { codename: 'MAILROOM-01', nickname: 'Elle', title: 'Chief of Staff', pod: 'chief-of-staff', reports_to: 'EXEC-01', tier: 'cheap',
    aliases: ['elle', 'chief of staff', 'route', 'brief', 'briefing', 'calendar', 'schedule', 'inbox', 'agenda', 'my day', 'morning'],
    does: 'The front door: classifies + dispatches + aggregates. Email & calendar triage.' },

  { codename: 'SAM-SCOUT', nickname: 'Gideon', title: 'Gov Scout', pod: 'gov', reports_to: 'MAILROOM-01', tier: 'cheap',
    aliases: ['sam.gov', 'sam ', 'solicitation', 'sources sought', 'scout', 'gov scout', 'opportunit', 'naics', 'federal'],
    does: 'Scans SAM.gov + state portals for opportunities (1 scan/day by policy).' },
  { codename: 'GOV-ANALYST', nickname: 'Patricia', title: 'Bid Analyst', pod: 'gov', reports_to: 'MAILROOM-01', tier: 'draft',
    aliases: ['bid', 'no-bid', 'proposal', 'rfp', 'rfq', 'capability statement', 'win theme', 'west point', 'contract'],
    does: 'Bid/no-bid scoring + proposal drafting. You sign & submit (targets 3–5 proposals/week).' },
  { codename: 'CONNECT-01', nickname: 'Hector', title: 'Procurement Lead', pod: 'gov', reports_to: 'MAILROOM-01', tier: 'draft',
    aliases: ['subcontractor', 'subcontract', 'sub ', 'vendor', 'supplier', 'quote', 'sourcing', 'local crew', 'teaming'],
    does: 'Sources subcontractors for the labor each bid needs; drafts targeted outreach (you send). Keeps the sub CRM.' },
  { codename: 'OPERATOR-01', nickname: 'Sloane', title: 'Project Operations', pod: 'gov', reports_to: 'MAILROOM-01', tier: 'draft',
    aliases: ['post-award', 'cpars', 'milestone', 'progress report', 'status update', 'deliverable', 'contract performance', 'cor', 'period of performance'],
    does: 'After a win: tracks milestones, chases subs for status, drafts CPARS-grade progress reports for the CO/COR. Protects your past-performance rating.' },
  { codename: 'STUDIO-01', nickname: 'Remy', title: 'Creative Director', pod: 'fiverr', reports_to: 'MAILROOM-01', tier: 'draft',
    aliases: ['thumbnail', 'cover', 'logo', 'design', 'gig', 'fiverr', 'image', 'artwork', 'mockup', 'banner', 'poster'],
    does: 'Thumbnails, covers, product art, gig delivery (real image gen, code-capped spend).' },
  { codename: 'RECON-DEV', nickname: 'Theo', title: 'SaaS Lead', pod: 'saas', reports_to: 'MAILROOM-01', tier: 'draft',
    aliases: ['recon', 'recontweaks', 'saas', 'support ticket', 'support', 'bug', 'release', 'changelog', 'feature', 'churn', 'patch'],
    does: 'ReconTweaks / SaaS support triage, releases, growth.' },
  { codename: 'VAULT-01', nickname: 'Iris', title: 'Archivist', pod: 'vault', reports_to: 'MAILROOM-01', tier: 'cheap',
    aliases: ['vault', 'ingest', 'transcribe', 'note', 'notes', 'journal', 'recall', 'remember', 'organize', 'file this', 'document'],
    does: 'Ingest / transcribe / organize / recall knowledge.' },
  { codename: 'WATCHTOWER-01', nickname: 'Dana', title: 'Risk Analyst', pod: 'research-risk', reports_to: 'LEDGER-01', tier: 'draft',
    aliases: ['market', 'stocks', 'stock market', 'crypto', 'watchlist', 'earnings', 'risk', 'portfolio', 'options', 'ticker', 'meme coin'],
    does: 'MONITOR + JOURNAL only — never executes trades (doctrine §7).' },

  { codename: 'ESTATE-01', nickname: 'Camille', title: 'Real Estate Pro', pod: 're', reports_to: 'EXEC-01', tier: 'draft',
    aliases: ['real estate', 'property', 'deal', 'comps', 'cap rate', 'rental', 'mortgage', 'tenant', 'escrow', 'closing', 'duplex', 'mls', 'walkthrough'],
    does: 'Analyzes RE deals (comps, cap rate, cash flow), guides decisions, drafts leases (Legal reviews).' },
  { codename: 'COUNSEL-01', nickname: 'Robert', title: 'Legal & Contracts', pod: 'legal', reports_to: 'EXEC-01', tier: 'draft',
    aliases: ['legal', 'contract', 'lease', 'nda', 'agreement', 'terms', 'clause', 'liability', 'compliance', 'sign this', 'review this contract'],
    does: 'Drafts/reviews leases, NDAs, contracts. Flags "get a real lawyer" on anything high-stakes.' },
  { codename: 'CONCIERGE-01', nickname: 'Nina', title: 'Personal Assistant', pod: 'personal', reports_to: 'MAILROOM-01', tier: 'cheap',
    aliases: ['remind', 'reminder', 'personal', 'errand', 'appointment', 'book a', 'travel', 'flight', 'gift', 'family', 'todo', 'to-do', 'grocery'],
    does: 'Calendar, reminders, errands, travel, personal-life logistics.' },

  // ── The LOCAL layer — free, private, on-device. Jarvis's own brain + hands, so the operator runs ONE
  //    Jarvis instead of juggling a separate model and a separate bot. HERMES is the free local BRAIN
  //    (Hermes 3 on Ollama, wired as LOCAL_MODEL in pods/model-router.mjs — the default when Claude tokens
  //    run out or privacy work must stay on the PC). OPENCLAW is the free local HANDS (the on-device CLI
  //    agent in pods/openclaw.mjs). ⚠ OpenClaw dispatch is OPERATOR-TRIGGERED ONLY — it never acts on
  //    untrusted content; this roster seat is for visibility/addressing, not an autonomous executor.
  { codename: 'HERMES', nickname: 'Hermes', title: 'Local Brain (free, private)', pod: 'local', reports_to: 'EXEC-01', tier: 'draft',
    aliases: ['hermes', 'local brain', 'local model', 'offline', 'private brain', 'free brain', 'on-device model', 'ollama'],
    does: 'Jarvis\'s free, private, on-device reasoning model (Hermes 3 via Ollama). Runs $0 and keeps private work on the PC; the fallback when cloud tokens run out.' },
  { codename: 'OPENCLAW', nickname: 'OpenClaw', title: 'Local Hands (free, on-device)', pod: 'local', reports_to: 'EXEC-01', tier: 'draft',
    aliases: ['openclaw', 'hands', 'local hands', 'run a command', 'local agent', 'on-device agent', 'do it locally'],
    does: 'Jarvis\'s free, on-device HANDS (the OpenClaw CLI agent) — runs commands / touches files / browses locally. OPERATOR-TRIGGERED ONLY (explicit "openclaw:"/"hands:" prefix); keeps its own owner-approval gate.' },
];

// Model tiers — EXPERT defaults: Haiku for high-volume scanning, Sonnet for the real work (proposals,
// analysis, outreach), Opus for hard strategy. This is what makes the agents "best in field." Override any
// tier via env (e.g. MODEL_DRAFT=claude-haiku-4-5 to economize, or MODEL_CHEAP=ollama/llama3.1 for local).
// Cost rises vs all-Haiku, but the control-plane spend cap (per-action + per-day) still bounds it.
export const MODEL_TIERS = {
  cheap: process.env.MODEL_CHEAP || 'claude-haiku-4-5',      // scans, classification, idle polls
  draft: process.env.MODEL_DRAFT || 'claude-sonnet-5',       // proposals, replies, analysis — expert tier (intro $2/$10 per MTok through 2026-08-31, then $3/$15 — same sticker as sonnet-4-6)
  reflect: process.env.MODEL_REFLECT || 'claude-opus-4-8',   // weekly strategy / hard reasoning — top tier
};
export const modelFor = (tier) => MODEL_TIERS[tier] || MODEL_TIERS.cheap;

// Unique pods present in the roster (the work-areas / rooms agents sit in).
export const POD_IDS = [...new Set(ROSTER.map((r) => r.pod))];

export const findPerson = (codename) => ROSTER.find((r) => r.codename === codename) || null;
export const peopleInPod = (pod) => ROSTER.filter((r) => r.pod === pod);
export const reportsTo = (codename) => ROSTER.filter((r) => r.reports_to === codename);

// Resolve a free-text reference ("the cfo", "victor", "real estate guy") to a person by alias/nickname/title.
export function matchPerson(text) {
  const t = String(text || '').toLowerCase();
  let best = null, score = 0;
  for (const r of ROSTER) {
    let s = 0;
    if (t.includes(r.nickname.toLowerCase())) s += 3;
    if (t.includes(r.title.toLowerCase())) s += 2;
    if (t.includes(r.codename.toLowerCase())) s += 3;
    s += r.aliases.filter((a) => t.includes(a)).length;
    if (s > score) { score = s; best = r; }
  }
  return score > 0 ? best : null;
}
