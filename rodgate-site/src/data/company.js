// ────────────────────────────────────────────────────────────
// CANONICAL FACTS — single source of truth for the whole site.
// Copied verbatim from the vault Canonical Facts table
// (00 - System/🧠 Lessons Ledger.md) via the website PRD §2.
// NEVER re-compose these from memory. Any edit must be checked
// against that table. NEVER add 8(a)/HUBZone/SDVOSB/WOSB or any
// "certified" status beyond self-certified SDB.
// ────────────────────────────────────────────────────────────

// ─── Brand switch ───────────────────────────────────────────
// The keystone mark is an original proposal, not a recovered asset.
// Flip to false to run the system on a plain-type wordmark instead —
// every other asset still works. See /logo-options to compare.
export const SHOW_MARK = true;

export const company = {
  legalName: 'Rodgate, LLC',
  dba: 'Rodgate Group',
  // Voice: sell the outcome, not the thing. Sentence case. No emoji.
  tagline: 'Facilities kept to standard, on contract.',

  uei: 'Z1SWBFEK7EM4',
  cage: '18S75',

  naics: [
    { code: '561210', label: 'Facilities Support Services', primary: true },
    { code: '561720', label: 'Janitorial Services' },
    { code: '561990', label: 'All Other Support Services' },
  ],

  psc: ['S201', 'S205', 'S208', 'S214', 'S216', 'M1AZ', 'Z1AA', 'Z1AZ'],

  // Exact self-certified statuses — do not embellish.
  status: [
    'Small Business',
    'Self-Certified Small Disadvantaged Business (SDB)',
    'Minority-Owned',
    'Hispanic American Owned',
  ],

  sam: 'Active · "All Awards" · registered through Feb 2, 2027',
  statePipeline: 'PA Commonwealth procurement vendor (Vendor #0000568553) · COSTARS cooperative',

  // Authoritative per Vinicio (2026-07-24): all four.
  serviceArea: ['Pennsylvania', 'New Jersey', 'New York', 'Florida'],
  serviceAreaAbbr: ['PA', 'NJ', 'NY', 'FL'],

  // Careful phrasing — registration-level only, NOT per-solicitation.
  bonding:
    'No registration-level bonding required to bid (per SAM record). Individual solicitations may still require bid or performance bonds.',

  businessType: 'Pennsylvania LLC · incorporated Jan 14, 2026 · Congressional District PA-08',

  poc: 'Vinicio Rodriguez',
  pocTitle: 'Managing Member',
  email: 'vinicio@rodgategroup.com',
  phone: '201-920-8457',
  phoneHref: '+12019208457',
  address: '218 W Ridge St, Nanticoke, PA 18634',

  capabilityPdf: '/Rodgate-LLC-Capability-Statement.pdf',
};

export const services = [
  {
    slug: 'custodial-janitorial',
    icon: 'sparkles',
    name: 'Custodial & Janitorial',
    short:
      'Recurring cleaning for offices, public buildings, and federal facilities — daily, weekly, or by call.',
    scope: [
      'Routine and periodic custodial service for occupied government space',
      'Restroom sanitation, floor and carpet care, trash collection, window and glass',
      'Day porter and after-hours crews scaled to the building',
    ],
    engagement: 'Recurring service contracts, single buildings to multi-site portfolios.',
    psc: ['S201 Custodial/Janitorial', 'S214 Carpet Cleaning'],
  },
  {
    slug: 'grounds-landscaping',
    icon: 'trees',
    name: 'Grounds & Landscaping',
    short:
      'Grounds maintenance and upkeep that keeps installations presentable and compliant year-round.',
    scope: [
      'Mowing, edging, trimming, and seasonal grounds upkeep',
      'Snow and ice response where required',
      'Landscape maintenance for federal, state, and municipal sites',
    ],
    engagement: 'Seasonal or year-round grounds contracts.',
    psc: ['S205 Landscaping/Groundskeeping'],
  },
  {
    slug: 'trash-haul-away',
    icon: 'truck',
    name: 'Trash & Haul-Away',
    short:
      'Refuse collection, removal, and haul-away services scaled to the size of the requirement.',
    scope: [
      'Scheduled refuse collection and removal',
      'Bulk, debris, and clean-out haul-away',
      'Coordination with disposal partners for compliant handling',
    ],
    engagement: 'Recurring or project-based removal.',
    psc: ['S208 Garbage/Trash Removal'],
  },
  {
    slug: 'facilities-support',
    icon: 'building',
    name: 'Facilities Support',
    short:
      'Facilities operations and maintenance support, carpet care, and general building upkeep.',
    scope: [
      'General building operations and maintenance support',
      'Coordinated multi-service facilities packages under one point of accountability',
      'Support to prime contractors as a vetted subcontractor',
    ],
    engagement: 'Facilities support services, prime or subcontract.',
    psc: ['S216 Facilities Operations Support', 'M1AZ Facility Operation Support'],
  },
];

// Voice: plainspoken and provable. Diagnose, don't pitch.
export const differentiators = [
  {
    title: 'The owner answers the phone',
    body: 'No account layer, no call centre. You talk to the person accountable for the work.',
  },
  {
    title: 'Crews sized to the requirement',
    body: 'Vetted regional crews across PA, NJ, NY, and FL. We staff to the scope, not to a template.',
  },
  {
    title: 'Registered and current',
    body: 'Active SAM registration through February 2027, All Awards. PA Commonwealth vendor and COSTARS.',
  },
  {
    title: 'Only what we can back',
    body: 'Small Business, Small Disadvantaged (self-certified), Minority-Owned, Hispanic American Owned. Nothing else claimed.',
  },
];

export const nav = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/capabilities', label: 'Capabilities' },
  { href: '/past-performance', label: 'Past Performance' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];
