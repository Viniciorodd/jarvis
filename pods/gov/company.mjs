// company.mjs — RODGATE's canonical business facts, ONE source of truth for the capability statement,
// proposal letterhead, and outreach. Pulled from the live capability data (site/index.html + SAM record).
// Doctrine L-005: SDB is SELF-certified — never claim a state/federal certification we don't hold.
// If a fact changes in SAM, change it HERE (and the site) — nothing should hard-code these elsewhere.

export const COMPANY = {
  legalName: 'Rodgate, LLC',
  dba: 'Rodgate Group',
  uei: 'Z1SWBFEK7EM4',
  cage: '18S75',
  naics: [
    { code: '561720', title: 'Janitorial Services' },
    { code: '561210', title: 'Facilities Support Services' },
    { code: '561990', title: 'All Other Support Services' },
  ],
  psc: ['S201', 'S205', 'S208', 'S214', 'S216', 'M1AZ', 'Z1AA', 'Z1AZ'],
  // Self-certified socio-economic status ONLY (no 8(a)/HUBZone/SDVOSB/WOSB — we are not those).
  socioEconomic: ['Small Business', 'Small Disadvantaged Business (self-certified)', 'Minority-Owned', 'Hispanic American Owned'],
  sam: 'Active · "All Awards" · registered through Feb 2027',
  statePipeline: 'PA Commonwealth procurement vendor · COSTARS cooperative',
  serviceArea: ['Pennsylvania', 'New Jersey', 'Florida'],
  bonding: 'No bonding required to bid (per SAM record)',
  businessType: 'Pennsylvania LLC · Congressional District PA-08',
  competencies: [
    'Custodial & janitorial services',
    'Carpet & floor care',
    'Grounds maintenance & landscaping support',
    'Facilities support & general services',
    'Post-construction & one-time deep cleaning',
  ],
  differentiators: [
    'Owner-managed — direct accountability, fast response, no layers',
    'Scalable American crews sized to each job',
    'Dual pipeline — SAM.gov registered AND a PA COSTARS / Commonwealth vendor',
    'Small Disadvantaged, Minority-Owned (Hispanic American Owned) small business',
  ],
  contact: {
    name: 'Vinicio Rodriguez',
    role: 'Managing Member',
    address: '218 W Ridge St, Nanticoke, PA 18634',
    email: 'RodGateGroup@gmail.com',
    phone: '201-920-8457',
  },
};
