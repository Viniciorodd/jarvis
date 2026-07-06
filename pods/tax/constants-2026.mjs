// TY2026 tax parameters — ONE auditable file per tax year (spec: new year = new file + rerun evals).
// Every number carries verified:true|false. UNVERIFIED numbers must be confirmed against the IRS/SSA
// source before filing season; status.mjs surfaces them as warnings. Sources: IRS Rev. Proc. 2025-32
// (TY2026 inflation adjustments, Oct 2025), SSA 2026 COLA fact sheet, post-OBBBA rules.

const $ = (dollars) => Math.round(dollars * 100); // whole-dollar param → cents

const PARAMS = {
  year:            { v: 2026, verified: true },
  // Federal brackets, SINGLE filer (upper bound of each rate band, in cents).
  bracketsSingle:  { v: [
      { rate: 0.10, uptoCents: $(12400) },
      { rate: 0.12, uptoCents: $(50400) },
      { rate: 0.22, uptoCents: $(105700) },
      { rate: 0.24, uptoCents: $(201775) },
      { rate: 0.32, uptoCents: $(256225) },
      { rate: 0.35, uptoCents: $(640600) },
      { rate: 0.37, uptoCents: Infinity },
    ], verified: false }, // VERIFY against Rev. Proc. 2025-32 before filing season
  stdDeductionSingle:   { v: $(16100),  verified: false }, // VERIFY (post-OBBBA TY2026 figure)
  ssWageBase:           { v: $(184500), verified: false }, // VERIFY against SSA 2026 announcement
  seRate:               { v: 0.153,  verified: true },  // 12.4% SS + 2.9% Medicare
  seSsRate:             { v: 0.124,  verified: true },
  seMedicareRate:       { v: 0.029,  verified: true },
  seBase:               { v: 0.9235, verified: true },  // net SE × 92.35% is the taxed base
  addlMedicareRate:     { v: 0.009,  verified: true },  // additional Medicare over threshold
  addlMedicareThreshold:{ v: $(200000), verified: true }, // single
  qbiRate:              { v: 0.20,   verified: true },
  qbiThresholdSingle:   { v: $(201775), verified: false }, // phase-in start; VERIFY
  paRate:               { v: 0.0307, verified: true },  // PA flat personal income tax
  residentialDeprYears: { v: 27.5,   verified: true },  // residential rental, straight line, mid-month
  mileageBusinessCents: { v: 70,     verified: false }, // ¢/mile — 2025 rate carried; VERIFY 2026 notice
  // 1099-NEC: track contractors from $600 (conservative); the OBBBA filing threshold for TY2026
  // payments is higher — verify the exact figure at filing. Over-preparing is harmless.
  necTrackCents:        { v: $(600), verified: true },
  // 1040-ES due dates for TY2026 (Q4 lands in Jan 2027).
  estDueDates:          { v: ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15'], verified: true },
  safeHarborPriorPct:       { v: 1.00, verified: true }, // 100% of prior-year tax…
  safeHarborPriorHighPct:   { v: 1.10, verified: true }, // …110% if prior AGI > $150k
  safeHarborCurrentPct:     { v: 0.90, verified: true }, // or 90% of current year
  safeHarborHighAgiCents:   { v: $(150000), verified: true },
};

export const TY2026 = {
  year: PARAMS.year.v,
  brackets: { single: PARAMS.bracketsSingle.v },
  stdDeductionCents: { single: PARAMS.stdDeductionSingle.v },
  ssWageBaseCents: PARAMS.ssWageBase.v,
  seRate: PARAMS.seRate.v, seSsRate: PARAMS.seSsRate.v, seMedicareRate: PARAMS.seMedicareRate.v,
  seBase: PARAMS.seBase.v,
  addlMedicareRate: PARAMS.addlMedicareRate.v, addlMedicareThresholdCents: PARAMS.addlMedicareThreshold.v,
  qbiRate: PARAMS.qbiRate.v, qbiThresholdCents: { single: PARAMS.qbiThresholdSingle.v },
  paRate: PARAMS.paRate.v,
  residentialDeprYears: PARAMS.residentialDeprYears.v,
  mileageBusinessCents: PARAMS.mileageBusinessCents.v,
  necTrackCents: PARAMS.necTrackCents.v,
  estDueDates: PARAMS.estDueDates.v,
  safeHarbor: {
    priorPct: PARAMS.safeHarborPriorPct.v, priorHighPct: PARAMS.safeHarborPriorHighPct.v,
    currentPct: PARAMS.safeHarborCurrentPct.v, highAgiCents: PARAMS.safeHarborHighAgiCents.v,
  },
  // Names of every param whose value still needs confirmation against the official source.
  unverified: () => Object.entries(PARAMS).filter(([, p]) => !p.verified).map(([k]) => k)
    .map((k) => (k === 'bracketsSingle' ? 'bracketsSingle' : k)),
};
