// DealForge — Wholesale engine (the "Wholesale Calculator" tabs, as code). Deterministic.
//
// Verified exactly against the source sheet:
//   assignmentFee = assignmentFeePct * ARV
//   MAO           = arvFactor*ARV - rehab - assignmentFee
//   buyerPrice    = MAO + assignmentFee
// Example: ARV 200,000, rehab 35,000, fee 15% -> MAO 75,000, buyer 105,000.

import { WHOLESALE_DEFAULTS, mergeAssumptions } from "./defaults.js";

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v, d = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : v;
  return Number.isFinite(n) ? n : d;
};

export function computeWholesale(input = {}, assumptions = {}) {
  const a = mergeAssumptions(WHOLESALE_DEFAULTS, assumptions);

  const arv = num(input.arv);
  const rehab = num(input.rehabCost);
  // Assignment fee may be a flat $ (input.assignmentFee) or derived from % of ARV.
  const assignmentFee =
    num(input.assignmentFee) || a.assignmentFeePct * arv;

  const mao = a.arvFactor * arv - rehab - assignmentFee;
  const buyerPrice = mao + assignmentFee;

  // Profit ladder: for a range of assignment prices, profit = price - MAO.
  const ladder = [];
  for (let i = -2; i <= 5; i++) {
    const assignPrice = round2(buyerPrice + i * 10000);
    ladder.push({ assignmentPrice: assignPrice, profit: round2(assignPrice - mao) });
  }

  return {
    inputs: { arv, rehab },
    assignmentFee: round2(assignmentFee),
    assignmentFeePct: a.assignmentFeePct,
    maxAllowableOffer: round2(mao),
    buyerPrice: round2(buyerPrice),
    ladder
  };
}
