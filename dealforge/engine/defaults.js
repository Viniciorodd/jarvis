// DealForge — default assumptions, ported from "Updated Deal Calculator Jul 2025".
// Every rate here is an editable assumption. The engine NEVER hard-codes money math
// against magic numbers — it always reads from an assumptions object derived from these
// defaults (merged with per-deal / per-lender overrides). Pure data, no DOM, no network.

export const FLIP_DEFAULTS = {
  // Max-offer logic (the "70% rule" + target profit), verified against the sheet:
  //   maxOffer70 = arvFactor*ARV - rehab ;  targetProfit = targetProfitPct*ARV
  arvFactor: 0.70,
  targetProfitPct: 0.15,
  ltcMax: 0.90, // hard-money max loan-to-cost

  // Hard money loan (interest-only during the flip)
  downPaymentPctOfProjectCost: 0.10, // down = 10% of (purchase + rehab)
  hmlInterestRate: 0.085,
  hmlTermMonths: 12,

  // Buy-side transaction costs
  pointsPct: 0.035, // origination points, % of loan amount
  brokeragePct: 0.03, // % of purchase price
  titleClosingBuyPct: 0.0255, // title insurance / closing, % of purchase price

  // Sell-side transaction costs (flip exit)
  realtorPct: 0.05, // % of sale price (ARV)
  titleClosingSellPct: 0.0153, // % of sale price

  // Private money / OPM (optional second-position capital)
  usePrivateMoney: false,
  pmInterestRate: 0.16,
  pmTermMonths: 6,
  pmPointsPct: 0.0,
  pmPrepaymentPenaltyPct: 0.0,
  pmProfitSplitPct: 0.0,

  // BRRRR refinance exit
  refinanceLtv: 0.75 // refi at 75% of ARV
};

// Post-deal profit allocation (the "After the Deal ✅" block). Must sum to 1.0.
export const ALLOCATION_DEFAULTS = {
  taxes: 0.35,
  reinvest: 0.25,
  ownerPay: 0.15,
  longTerm: 0.05,
  marketing: 0.10,
  emergency: 0.10
};

export const RENTAL_DEFAULTS = {
  vacancyPct: 0.05,
  propertyManagementPct: 0.10,
  buildingReservesPct: 0.05,
  maintenanceReservesPct: 0.05,
  otherReservesPct: 0.0,
  appreciationPct: 0.03,
  loanLtv: 0.80,
  loanRate: 0.0725,
  loanTermYears: 30,
  // closing assumptions for "cash to close"
  titleClosingPct: 0.013,
  bankFeesPct: 0.014,
  brokeragePct: 0.01,
  reservesPerDoor: 5000,
  // cap-rate sensitivity rows shown in the valuation table
  capRateRows: [0.05, 0.06, 0.07, 0.08, 0.09]
};

export const WHOLESALE_DEFAULTS = {
  arvFactor: 0.70, // same 70% rule
  assignmentFeePct: 0.15 // assignment fee as % of ARV (target profit)
};

// Rehab tiers: dollars-per-square-foot ranges, ported from the sheet's "Rehab Estimate"
// block. Flat items are fixed dollars. These are GUIDANCE used to suggest a rehab number;
// the deal's actual rehab cost is still a direct, editable input.
export const REHAB_PRESETS = {
  perSqftTiers: [
    { key: "cleanUp", label: "Clean Up", low: 10, high: 20 },
    { key: "lipstick", label: "Lipstick", low: 30, high: 35 },
    { key: "interior", label: "Interior Remodel", low: 40, high: 45 },
    { key: "full", label: "Full Remodel", low: 50, high: 55 },
    { key: "roof", label: "Roof", low: 5, high: 7 }
  ],
  flatItems: [
    { key: "ac", label: "AC", amount: 5000 },
    { key: "pool", label: "Pool Equipment", amount: 5000 }
  ]
};

// CRM pipeline stages, ported from the CRM tab.
export const CRM_STAGES = [
  "New Lead",
  "Contacted",
  "Follow-Up",
  "Under Contract",
  "Closed",
  "Dead Lead"
];

// Deep-merge helper so callers can pass sparse override objects.
export function mergeAssumptions(defaults, overrides = {}) {
  const out = { ...defaults };
  for (const k of Object.keys(overrides)) {
    const v = overrides[k];
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}
