// DealForge — regression evals. These assert the engine reproduces the ACTUAL numbers
// from "Updated Deal Calculator Jul 2025". This is the proof the app is built from the
// user's real workbook, not a generic clone. Run with: node evals/run.js
//
// Doctrine: evals from day one (operating-doctrine §11). Money math is code; this is its
// regression suite. Run before trusting any UI.

import { computeFlip } from "../engine/flip-brrrr.js";
import { computeRental } from "../engine/rental.js";
import { computeWholesale } from "../engine/wholesale.js";
import { computeCosts } from "../engine/costs.js";
import { computeMarket } from "../engine/market.js";

let passed = 0;
let failed = 0;
const fails = [];

function approx(actual, expected, tol, label) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) {
    passed++;
  } else {
    failed++;
    fails.push(`  ✗ ${label}: expected ≈ ${expected}, got ${actual} (tol ±${tol})`);
  }
}
function eq(actual, expected, label) {
  const ok = actual === expected;
  if (ok) passed++;
  else {
    failed++;
    fails.push(`  ✗ ${label}: expected ${expected}, got ${actual}`);
  }
}

// ───────────────────────── FLIP / BRRRR (Deal Profit Calculator) ─────────────────────────
// Source inputs: Purchase $450,000, Rehab $70,000, ARV $716,000, taxes $3,900,
// insurance $1,614.53, utilities $300/mo, 5-month flip.
{
  const r = computeFlip({
    purchasePrice: 450000,
    rehabCost: 70000,
    arv: 716000,
    taxes: 3900,
    insurancePremium: 1614.53,
    utilitiesMonthly: 300,
    flipMonths: 5
  });

  approx(r.maxOffer.maxOffer70, 431200, 1, "flip 70% rule max offer");
  approx(r.maxOffer.maxExpenseAllowed, 501200, 1, "flip max expense allowed (70% ARV)");
  approx(r.maxOffer.targetProfit, 107400, 1, "flip target profit (15% ARV)");
  approx(r.loan.projectCost, 520000, 1, "flip project cost");
  approx(r.loan.downPayment, 52000, 1, "flip down payment (10% project cost)");
  approx(r.loan.loanAmount, 468000, 1, "flip loan amount");
  approx(r.loan.monthlyInterest, 3315, 1, "flip HML monthly interest");
  approx(r.loan.interestDuringHold, 16575, 1, "flip interest over 5-month hold");
  approx(r.costs.brokerage, 13500, 1, "flip brokerage (3% purchase)");
  approx(r.costs.taxesInsuranceHold, 5514.53, 0.5, "flip taxes+insurance hold");
  approx(r.costs.utilitiesHold, 1500, 1, "flip utilities hold (5 mo)");
  approx(r.costs.costToPurchase, 93355, 50, "flip cost to purchase");
  approx(r.costs.totalCashOutflow, 116944.53, 50, "flip total cash outflow");
  approx(r.flipExit.realtorFee, 35800, 1, "flip realtor fee (5% ARV)");
  // Purchase 450k > 70% max offer 431.2k -> verdict must be NOT a deal.
  eq(r.flipExit.isDeal, false, "flip verdict: purchase above 70% rule => not a deal");
  // Profit allocation splits sum back to net profit (when positive).
  const base = Math.max(r.flipExit.netProfit, 0);
  const allocSum =
    r.allocation.taxes + r.allocation.reinvest + r.allocation.ownerPay +
    r.allocation.longTerm + r.allocation.marketing + r.allocation.emergency;
  approx(allocSum, base, 0.05, "flip profit allocation sums to net profit");
}

// ───────────────────────── RENTAL (Current / Turnkey Hold — Nanticoke) ─────────────────────────
// Two units @ $1,000, purchase $239,999, 80% loan @ 7.25% / 30yr,
// insurance $137.67/mo, taxes $138.05/mo, owner gas $157, trash $100, water $61.83.
{
  const r = computeRental({
    purchasePrice: 239999,
    units: [{ monthlyRent: 1000 }, { monthlyRent: 1000 }],
    insuranceMonthly: 137.67,
    taxesMonthly: 138.05,
    utilitiesOwnerMonthly: 157,
    trashMonthly: 100,
    waterSewerMonthly: 61.83
  }, { propertyManagementPct: 0 }); // PM was 0% on this turnkey deal

  approx(r.income.grossRentMonthly, 2000, 0.01, "rental gross rent monthly");
  approx(r.expenses.vacancy, 100, 0.01, "rental vacancy (5%)");
  approx(r.expenses.directExpensesMonthly, 694.55, 0.5, "rental direct expenses monthly");
  approx(r.noi.monthly, 1305.45, 0.5, "rental NOI monthly (before reserves)");
  approx(r.debt.loanAmount, 191999.2, 1, "rental loan amount (80%)");
  approx(r.debt.monthlyPayment, 1309.77, 1, "rental amortized P&I payment");
  approx(r.debt.firstMonthInterest, 1160, 1, "rental first-month interest");
  approx(r.ratios.dscr, 1.0, 0.02, "rental DSCR ≈ 1.00");
  approx(r.ratios.capRateAtPurchase, 0.0653, 0.002, "rental cap rate at purchase ≈ 6.53%");
  approx(r.ratios.cashFlowAfterDebtMonthly, -4.32, 1, "rental cash flow after debt ≈ -$4.32");
  // Cap valuation: NOI/5% should land near $313,308.
  const cap5 = r.capValuation.find((x) => x.capRate === 0.05);
  approx(cap5.value, 313308, 200, "rental cap-rate valuation @5%");
}

// ───────────────────────── WHOLESALE ─────────────────────────
// ARV 200,000, rehab 35,000, 15% fee -> MAO 75,000, buyer 105,000.
{
  const r = computeWholesale({ arv: 200000, rehabCost: 35000 }, { assignmentFeePct: 0.15 });
  approx(r.assignmentFee, 30000, 1, "wholesale assignment fee (15% ARV)");
  approx(r.maxAllowableOffer, 75000, 1, "wholesale MAO");
  approx(r.buyerPrice, 105000, 1, "wholesale buyer price");
}
// Second example: ARV 310,361, rehab 65,000, 10% fee -> MAO 121,217.
{
  const r = computeWholesale({ arv: 310361, rehabCost: 65000 }, { assignmentFeePct: 0.10 });
  approx(r.maxAllowableOffer, 121217, 1, "wholesale MAO (example 2)");
}

// ───────────────────────── TOTAL COSTS ─────────────────────────
// Seller $60,000 / ARV $150,000 example -> net proceeds $14,625.
{
  const r = computeCosts({
    sellerAskingPrice: 60000,
    insurance: 600,
    rehab: { kitchen: 15000, floors: 7500, bathrooms: 12500, paint: 5000, dumpster: 500, plumbing: 7500, labor: 8000, landscaping: 2500 },
    holdMonths: 3,
    electric: 150, waterTrash: 100, landscapingHold: 100, gas: 0,
    loanAmount: 118500,
    sellingPrice: 150000
  });
  approx(r.acquisition.total, 62220, 1, "costs total acquisition");
  approx(r.holding.monthlyLoanPayment, 1185, 1, "costs monthly loan payment (12% IO on 118,500)");
  approx(r.holding.total, 4605, 1, "costs total holding (3 mo)");
  approx(r.rehab.total, 58500, 1, "costs total rehab");
  approx(r.exit.totalProceeds, 139950, 1, "costs total exit proceeds");
  approx(r.netProceeds, 14625, 1, "costs net proceeds");
}

// ───────────────────────── MARKET ─────────────────────────
{
  const r = computeMarket([
    { category: "Demographics", measurement: "Poverty rate", target: 20, value: 10, direction: "lte" }, // 200% -> pass
    { category: "Income", measurement: "Median HH income", target: 50000, value: 49531, direction: "gte" } // ~99% -> warn
  ]);
  eq(r.rows[0].status, "pass", "market lte KPI well under target => pass");
  eq(r.rows[1].status, "warn", "market gte KPI just under target => warn");
  approx(r.rows[1].perfPct, 99.1, 0.3, "market perf-to-target ≈ 99%");
}

// ───────────────────────── report ─────────────────────────
console.log(`\nDealForge engine evals — ${passed} passed, ${failed} failed\n`);
if (failed) {
  console.log(fails.join("\n"));
  console.log("");
  process.exit(1);
} else {
  console.log("All anchors reproduce the source workbook. ✅\n");
}
