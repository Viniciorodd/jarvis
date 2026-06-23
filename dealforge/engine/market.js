// DealForge — Market Analysis engine (the "Market Analysis" tabs, as code). Turns a list of
// KPIs (each with a target, an actual value, and a direction) into a performance-to-target
// score with the sheet's traffic-light bands. Deterministic.
//
// Sheet bands: >= 100% green, 90%–100% yellow, < 90% red.

const num = (v, d = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : v;
  return Number.isFinite(n) ? n : d;
};
const round = (n, p = 2) => { const f = 10 ** p; return Math.round((n + Number.EPSILON) * f) / f; };

export const KPI_BANDS = { pass: 1.0, warn: 0.9 }; // >=1 pass, >=0.9 warn, else fail

// Default KPI template ported from the Scranton market sheet (editable per market).
export const MARKET_KPI_TEMPLATE = [
  { category: "Demographics", measurement: "Population growth since 2000", target: 25, direction: "gte", unit: "%" },
  { category: "Demographics", measurement: "Poverty rate", target: 20, direction: "lte", unit: "%" },
  { category: "Demographics", measurement: "College graduates", target: 25, direction: "gte", unit: "%" },
  { category: "Demographics", measurement: "Crime index", target: 275, direction: "lte", unit: "" },
  { category: "Income", measurement: "Median household income", target: 50000, direction: "gte", unit: "$" },
  { category: "Income", measurement: "Median HH income growth since 2000", target: 42, direction: "gte", unit: "%" },
  { category: "Housing", measurement: "Median home price", target: 200000, direction: "lte", unit: "$" },
  { category: "Housing", measurement: "Rent-to-price ratio", target: 1, direction: "gte", unit: "%" }
];

// Performance-to-target ratio. For "gte" goals, value/target; for "lte" goals, target/value.
export function perfToTarget(kpi) {
  const target = num(kpi.target);
  const value = num(kpi.value);
  if (kpi.direction === "lte") {
    if (value <= 0) return target > 0 ? 2 : 1; // unbounded-good
    return target / value;
  }
  if (target === 0) return value >= 0 ? 1 : 0;
  return value / target;
}

export function kpiStatus(ratio) {
  if (ratio >= KPI_BANDS.pass) return "pass";
  if (ratio >= KPI_BANDS.warn) return "warn";
  return "fail";
}

export function computeMarket(kpis = []) {
  const rows = kpis.map((k) => {
    const ratio = perfToTarget(k);
    return {
      ...k,
      ratio: round(ratio, 4),
      perfPct: round(ratio * 100, 1),
      status: kpiStatus(ratio)
    };
  });

  const scored = rows.filter((r) => r.value !== "" && r.value != null);
  const avg = scored.length
    ? scored.reduce((s, r) => s + Math.min(r.ratio, 1.5), 0) / scored.length
    : 0;
  const passes = rows.filter((r) => r.status === "pass").length;
  const fails = rows.filter((r) => r.status === "fail").length;

  // Letter grade from the average performance-to-target.
  const score100 = round(Math.min(avg, 1) * 100, 0);
  const grade =
    score100 >= 90 ? "A" : score100 >= 80 ? "B" : score100 >= 70 ? "C" : score100 >= 60 ? "D" : "F";

  // Group by category for the scorecard UI.
  const byCategory = {};
  for (const r of rows) (byCategory[r.category] = byCategory[r.category] || []).push(r);

  return { rows, byCategory, score100, grade, passes, fails, total: rows.length };
}
