// DealForge — Fix & Flip / BRRRR engine (the "Deal Profit Calculator" tab, as code).
// Deterministic. No DOM, no network. Money math is code, not prompts.
//
// Verified against the source sheet (anchors asserted in evals/):
//   maxOffer70   = arvFactor*ARV - rehab                 (70% rule)
//   targetProfit = targetProfitPct*ARV
//   projectCost  = purchase + rehab
//   hml.monthly  = loanAmount * rate / 12                (interest-only)
//   brokerage    = brokeragePct * purchase
//   realtor      = realtorPct * salePrice
//   costToPurchase   = down + points + brokerage + titleBuy
//   totalCashOutflow = costToPurchase + interest + taxesInsurance + utilitiesHold
//
// NOTE: the original sheet's single "Net Profit" cell did not reconcile from the HTML
// export (the workbook contains #REF! errors and cross-tab references). DealForge computes
// profit transparently from the itemized lines below — every cost is shown — so the number
// is auditable rather than a black box.

import { FLIP_DEFAULTS, ALLOCATION_DEFAULTS, mergeAssumptions } from "./defaults.js";

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v, d = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : v;
  return Number.isFinite(n) ? n : d;
};

/**
 * @param {object} input  Deal inputs (see fields below).
 * @param {object} assumptions  Sparse overrides for FLIP_DEFAULTS (e.g. from a lender preset).
 * @param {object} allocationOverrides  Sparse overrides for ALLOCATION_DEFAULTS.
 */
export function computeFlip(input = {}, assumptions = {}, allocationOverrides = {}) {
  const a = mergeAssumptions(FLIP_DEFAULTS, assumptions);
  const alloc = mergeAssumptions(ALLOCATION_DEFAULTS, allocationOverrides);

  const purchase = num(input.purchasePrice);
  const rehab = num(input.rehabCost);
  const arv = num(input.arv);
  const taxes = num(input.taxes); // annual property taxes (held during flip)
  const insurance = num(input.insurancePremium); // annual insurance
  const utilitiesMonthly = num(input.utilitiesMonthly);
  const flipMonths = num(input.flipMonths, a.hmlTermMonths);

  // ---- Max offer logic --------------------------------------------------
  const maxExpenseAllowed = a.arvFactor * arv; // 70% of ARV
  const maxOffer70 = maxExpenseAllowed - rehab; // classic 70% rule
  const targetProfit = a.targetProfitPct * arv;

  // ---- Project cost + hard money loan ----------------------------------
  const projectCost = purchase + rehab;
  const downPayment = a.downPaymentPctOfProjectCost * projectCost;
  const loanAmount = projectCost - downPayment;
  const maxLendingLtc = a.ltcMax * projectCost;
  const hmlMonthlyInterest = (loanAmount * a.hmlInterestRate) / 12; // interest-only
  const interestDuringHold = hmlMonthlyInterest * flipMonths;

  // ---- Buy-side costs ---------------------------------------------------
  const points = a.pointsPct * loanAmount;
  const brokerage = a.brokeragePct * purchase;
  const titleBuy = a.titleClosingBuyPct * purchase;
  const taxesInsuranceHold = taxes + insurance;
  const utilitiesHold = utilitiesMonthly * flipMonths;

  const costToPurchase = downPayment + points + brokerage + titleBuy;
  const totalOriginationCost = points + brokerage + titleBuy + taxesInsuranceHold;
  const totalHoldingCost = interestDuringHold + utilitiesHold;
  const totalCashOutflow =
    costToPurchase + interestDuringHold + taxesInsuranceHold + utilitiesHold;
  const totalMonthlyCost = hmlMonthlyInterest + utilitiesMonthly;

  // ---- Private money / OPM (optional) ----------------------------------
  let privateMoney = null;
  if (a.usePrivateMoney) {
    const pmLoan = num(input.pmLoanAmount);
    const pmMonthly = (pmLoan * a.pmInterestRate) / 12;
    const pmInterest = pmMonthly * a.pmTermMonths;
    const pmPoints = a.pmPointsPct * pmLoan;
    const pmPrepay = a.pmPrepaymentPenaltyPct * pmLoan;
    const pmTotal = pmInterest + pmPoints + pmPrepay;
    privateMoney = {
      loanAmount: round2(pmLoan),
      monthlyInterest: round2(pmMonthly),
      totalInterest: round2(pmInterest),
      points: round2(pmPoints),
      prepaymentPenalty: round2(pmPrepay),
      totalCost: round2(pmTotal)
    };
  }

  // ---- Exit 1: Flip -----------------------------------------------------
  const salePrice = num(input.salePrice, arv); // default exit at ARV
  const realtorFee = a.realtorPct * salePrice;
  const titleSell = a.titleClosingSellPct * salePrice;
  const sellingCosts = realtorFee + titleSell;

  // Transparent profit: sale proceeds minus everything invested + sold.
  const allInCost =
    purchase + rehab + totalOriginationCost + totalHoldingCost + sellingCosts +
    (privateMoney ? privateMoney.totalCost : 0);
  const netProfit = salePrice - allInCost;
  const afterLoanRepaying = salePrice - loanAmount - sellingCosts;
  const roi = totalCashOutflow > 0 ? netProfit / totalCashOutflow : 0;
  const returnOnArv = arv > 0 ? netProfit / arv : 0;

  // The deal verdict mirrors the sheet's logic: are you at/under the 70% max offer?
  const isDeal = purchase <= maxOffer70 + 1e-6 && netProfit > 0;

  // ---- Exit 2: BRRRR refinance -----------------------------------------
  const refiLoan = a.refinanceLtv * arv;
  const brrrAfterLoanRepaying = refiLoan - loanAmount; // cash position after refi pays off HML
  const brrrCashLeftInDeal = totalCashOutflow - brrrAfterLoanRepaying;

  // ---- Profit sensitivity ladder (sale price -> profit) ----------------
  const ladder = [];
  for (let i = -4; i <= 3; i++) {
    const sp = round2(arv + i * 5000);
    const sc = a.realtorPct * sp + a.titleClosingSellPct * sp;
    const profit = sp - (purchase + rehab + totalOriginationCost + totalHoldingCost + sc +
      (privateMoney ? privateMoney.totalCost : 0));
    ladder.push({ salePrice: sp, profit: round2(profit) });
  }

  // ---- Post-deal profit allocation -------------------------------------
  const base = Math.max(netProfit, 0);
  const allocation = {
    taxes: round2(base * alloc.taxes),
    reinvest: round2(base * alloc.reinvest),
    ownerPay: round2(base * alloc.ownerPay),
    longTerm: round2(base * alloc.longTerm),
    marketing: round2(base * alloc.marketing),
    emergency: round2(base * alloc.emergency)
  };

  return {
    inputs: { purchase, rehab, arv, taxes, insurance, utilitiesMonthly, flipMonths, salePrice },
    maxOffer: {
      maxExpenseAllowed: round2(maxExpenseAllowed),
      maxOffer70: round2(maxOffer70),
      targetProfit: round2(targetProfit),
      maxLendingLtc: round2(maxLendingLtc)
    },
    loan: {
      projectCost: round2(projectCost),
      downPayment: round2(downPayment),
      loanAmount: round2(loanAmount),
      interestRate: a.hmlInterestRate,
      termMonths: a.hmlTermMonths,
      monthlyInterest: round2(hmlMonthlyInterest),
      interestDuringHold: round2(interestDuringHold)
    },
    privateMoney,
    costs: {
      points: round2(points),
      brokerage: round2(brokerage),
      titleBuy: round2(titleBuy),
      taxesInsuranceHold: round2(taxesInsuranceHold),
      utilitiesHold: round2(utilitiesHold),
      costToPurchase: round2(costToPurchase),
      totalOriginationCost: round2(totalOriginationCost),
      totalHoldingCost: round2(totalHoldingCost),
      totalCashOutflow: round2(totalCashOutflow),
      totalMonthlyCost: round2(totalMonthlyCost)
    },
    flipExit: {
      salePrice: round2(salePrice),
      realtorFee: round2(realtorFee),
      titleSell: round2(titleSell),
      sellingCosts: round2(sellingCosts),
      afterLoanRepaying: round2(afterLoanRepaying),
      netProfit: round2(netProfit),
      roi: round2(roi * 100) / 100,
      returnOnArv: round2(returnOnArv * 100) / 100,
      isDeal
    },
    brrrExit: {
      refinanceLtv: a.refinanceLtv,
      refiLoan: round2(refiLoan),
      afterLoanRepaying: round2(brrrAfterLoanRepaying),
      cashLeftInDeal: round2(brrrCashLeftInDeal)
    },
    ladder,
    allocation
  };
}
