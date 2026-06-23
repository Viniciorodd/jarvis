// DealForge — Rental / Turnkey-Hold underwriting engine
// (the "BRRR Exit" and "Current (Turnkey Hold)" tabs, as code). Deterministic.
//
// Verified against the source sheet (Nanticoke turnkey example):
//   vacancy        = vacancyPct * grossRent
//   NOI(before reserves) = grossIncome - directExpenses
//   debtService    = amortized monthly P&I * 12
//   DSCR           = NOI / debtService                  (-> 1.00)
//   capRate        = NOI / purchasePrice                (-> 6.53%)
//   value(cap)     = NOI / capRate                      (5% -> $313,308)
//   appreciation   = value * (1+g)^year

import { RENTAL_DEFAULTS, mergeAssumptions } from "./defaults.js";

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v, d = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : v;
  return Number.isFinite(n) ? n : d;
};

// Standard amortized monthly payment.
export function amortizedPayment(principal, annualRate, years) {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return n > 0 ? principal / n : 0;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export function computeRental(input = {}, assumptions = {}) {
  const a = mergeAssumptions(RENTAL_DEFAULTS, assumptions);

  const purchase = num(input.purchasePrice);
  const units = Array.isArray(input.units) ? input.units : [];
  const doors = Math.max(units.length, num(input.doorCount, units.length || 1));

  // ---- Income ----------------------------------------------------------
  const grossRentMonthly =
    units.reduce((s, u) => s + num(u.monthlyRent), 0) || num(input.grossRentMonthly);
  const otherIncomeMonthly = num(input.otherIncomeMonthly);
  const grossIncomeMonthly = grossRentMonthly + otherIncomeMonthly;
  const grossIncomeAnnual = grossIncomeMonthly * 12;

  // ---- Operating expenses ---------------------------------------------
  const vacancy = a.vacancyPct * grossRentMonthly;
  const propertyManagement = a.propertyManagementPct * grossRentMonthly;
  const insurance = num(input.insuranceMonthly);
  const taxesMonthly = num(input.taxesMonthly);
  const utilitiesOwner = num(input.utilitiesOwnerMonthly);
  const trash = num(input.trashMonthly);
  const waterSewer = num(input.waterSewerMonthly);
  const otherExpense = num(input.otherExpenseMonthly);

  const directExpensesMonthly =
    vacancy + propertyManagement + insurance + taxesMonthly +
    utilitiesOwner + trash + waterSewer + otherExpense;

  const noiMonthly = grossIncomeMonthly - directExpensesMonthly; // before reserves
  const noiAnnual = noiMonthly * 12;

  // ---- Reserves --------------------------------------------------------
  const buildingReserves = a.buildingReservesPct * grossRentMonthly;
  const maintenanceReserves = a.maintenanceReservesPct * grossRentMonthly;
  const otherReserves = a.otherReservesPct * grossRentMonthly;
  const totalReservesMonthly = buildingReserves + maintenanceReserves + otherReserves;

  // ---- Debt service ----------------------------------------------------
  const loanAmount = a.loanLtv * purchase;
  const monthlyPayment = amortizedPayment(loanAmount, a.loanRate, a.loanTermYears);
  const firstMonthInterest = (loanAmount * a.loanRate) / 12;
  const firstMonthPrincipal = monthlyPayment - firstMonthInterest;
  const debtServiceAnnual = monthlyPayment * 12;

  // ---- Ratios + cash flow ---------------------------------------------
  const dscr = debtServiceAnnual > 0 ? noiAnnual / debtServiceAnnual : 0;
  const capRateAtPurchase = purchase > 0 ? noiAnnual / purchase : 0;
  const cashFlowAfterDebtMonthly = noiMonthly - monthlyPayment;
  const cashFlowAfterReservesMonthly = cashFlowAfterDebtMonthly - totalReservesMonthly;

  // ---- Cap-rate valuation table ---------------------------------------
  const capValuation = a.capRateRows.map((cap) => ({
    capRate: cap,
    value: round2(cap > 0 ? noiAnnual / cap : 0)
  }));

  // ---- Cash to close ---------------------------------------------------
  const downPayment = purchase - loanAmount;
  const titleClosing = a.titleClosingPct * purchase;
  const bankFees = a.bankFeesPct * purchase;
  const brokerage = a.brokeragePct * purchase;
  const rehab = num(input.rehabCost);
  const mxReserves = a.reservesPerDoor * doors;
  const cashToClose = downPayment + titleClosing + bankFees + brokerage + rehab + mxReserves;

  // ---- Appreciation projection ----------------------------------------
  const baseValue = num(input.arv, purchase);
  const appreciation = [];
  for (let year = 0; year <= 6; year++) {
    appreciation.push({
      year,
      value: round2(baseValue * Math.pow(1 + a.appreciationPct, year))
    });
  }

  return {
    income: {
      grossRentMonthly: round2(grossRentMonthly),
      grossIncomeMonthly: round2(grossIncomeMonthly),
      grossIncomeAnnual: round2(grossIncomeAnnual),
      doors
    },
    expenses: {
      vacancy: round2(vacancy),
      propertyManagement: round2(propertyManagement),
      insurance: round2(insurance),
      taxes: round2(taxesMonthly),
      utilitiesOwner: round2(utilitiesOwner),
      trash: round2(trash),
      waterSewer: round2(waterSewer),
      other: round2(otherExpense),
      directExpensesMonthly: round2(directExpensesMonthly)
    },
    noi: {
      monthly: round2(noiMonthly),
      annual: round2(noiAnnual)
    },
    reserves: {
      building: round2(buildingReserves),
      maintenance: round2(maintenanceReserves),
      other: round2(otherReserves),
      totalMonthly: round2(totalReservesMonthly)
    },
    debt: {
      loanAmount: round2(loanAmount),
      ltv: a.loanLtv,
      rate: a.loanRate,
      termYears: a.loanTermYears,
      monthlyPayment: round2(monthlyPayment),
      firstMonthInterest: round2(firstMonthInterest),
      firstMonthPrincipal: round2(firstMonthPrincipal),
      debtServiceAnnual: round2(debtServiceAnnual)
    },
    ratios: {
      dscr: round2(dscr),
      capRateAtPurchase: round2(capRateAtPurchase * 10000) / 10000,
      cashFlowAfterDebtMonthly: round2(cashFlowAfterDebtMonthly),
      cashFlowAfterReservesMonthly: round2(cashFlowAfterReservesMonthly),
      cashFlowAfterDebtAnnual: round2(cashFlowAfterDebtMonthly * 12),
      cashFlowAfterReservesAnnual: round2(cashFlowAfterReservesMonthly * 12)
    },
    capValuation,
    cashToClose: {
      downPayment: round2(downPayment),
      titleClosing: round2(titleClosing),
      bankFees: round2(bankFees),
      brokerage: round2(brokerage),
      rehab: round2(rehab),
      mxReserves: round2(mxReserves),
      total: round2(cashToClose)
    },
    appreciation
  };
}
