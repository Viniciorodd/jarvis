// DealForge — Total Costs engine (the "Total Costs" tab, as code). A line-item flip P&L:
// acquisition + holding + rehab vs exit proceeds -> net proceeds. Deterministic.
//
// Verified exactly against the sheet ($60k buy / $150k ARV example):
//   acquisition  62,220  |  holding (3mo) 4,605  |  rehab 58,500  |  exit proceeds 139,950
//   netProceeds  = 139,950 - 62,220 - 4,605 - 58,500 = 14,625

import { mergeAssumptions } from "./defaults.js";

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v, d = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : v;
  return Number.isFinite(n) ? n : d;
};
const sum = (obj) => Object.values(obj || {}).reduce((s, v) => s + num(v), 0);

export const COSTS_DEFAULTS = {
  acqClosingPct: 0.012, // closing costs, % of purchase
  loanOriginationPct: 0.015, // % of purchase
  loanRate: 0.12, // interest-only holding payment
  agentCommissionPct: 0.055, // % of sale price
  exitClosingPct: 0.012 // % of sale price
};

// Standard rehab line items from the sheet (any can be 0/blank).
export const REHAB_LINE_ITEMS = [
  "kitchen", "floors", "bathrooms", "paint", "demolition", "dumpster", "siding",
  "plumbing", "electrical", "roof", "labor", "landscaping", "hvac", "additions"
];

export function computeCosts(input = {}, assumptions = {}) {
  const a = mergeAssumptions(COSTS_DEFAULTS, assumptions);

  const purchase = num(input.sellerAskingPrice);
  const rehab = input.rehab || {};
  const totalRehab = sum(rehab);

  // ── Acquisition ──
  const acqClosing = a.acqClosingPct * purchase;
  const insurance = num(input.insurance);
  const wholesaleAgentFee = num(input.wholesaleAgentFee);
  const loanOrigination = num(input.loanOrigination, a.loanOriginationPct * purchase);
  const totalAcquisition = purchase + acqClosing + insurance + wholesaleAgentFee + loanOrigination;

  // ── Loan + holding ──
  const loanAmount = num(input.loanAmount, purchase + totalRehab);
  const monthlyLoanPayment = num(input.monthlyLoanPayment, (loanAmount * a.loanRate) / 12);
  const holdMonths = num(input.holdMonths, 3);
  const monthlyHolding =
    num(input.electric) + num(input.waterTrash) + num(input.landscapingHold) +
    monthlyLoanPayment + num(input.gas);
  const totalHolding = monthlyHolding * holdMonths;

  // ── Exit ──
  const sellingPrice = num(input.sellingPrice);
  const agentCommission = a.agentCommissionPct * sellingPrice;
  const exitClosing = a.exitClosingPct * sellingPrice;
  const sellerConcession = num(input.sellerConcession);
  const totalExitProceeds = sellingPrice - agentCommission - exitClosing - sellerConcession;

  // ── Profit ──
  const netProceeds = totalExitProceeds - totalAcquisition - totalHolding - totalRehab;
  const totalInvested = totalAcquisition + totalHolding + totalRehab;
  const roi = totalInvested > 0 ? netProceeds / totalInvested : 0;

  return {
    acquisition: {
      purchase: round2(purchase), closing: round2(acqClosing), insurance: round2(insurance),
      wholesaleAgentFee: round2(wholesaleAgentFee), loanOrigination: round2(loanOrigination),
      total: round2(totalAcquisition)
    },
    holding: {
      holdMonths, monthlyLoanPayment: round2(monthlyLoanPayment),
      monthly: round2(monthlyHolding), total: round2(totalHolding)
    },
    rehab: { items: rehab, total: round2(totalRehab) },
    exit: {
      sellingPrice: round2(sellingPrice), agentCommission: round2(agentCommission),
      closing: round2(exitClosing), sellerConcession: round2(sellerConcession),
      totalProceeds: round2(totalExitProceeds)
    },
    netProceeds: round2(netProceeds),
    totalInvested: round2(totalInvested),
    roi: round2(roi * 10000) / 10000
  };
}
