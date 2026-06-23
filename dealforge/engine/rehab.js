// DealForge — rehab estimator. Turns the sheet's "Rehab Estimate" block into
// square-footage-driven ranges so the user can pick a tier as a starting number.

import { REHAB_PRESETS } from "./defaults.js";

const round0 = (n) => Math.round(n);

export function rehabEstimate(squareFootage = 0, presets = REHAB_PRESETS) {
  const sqft = Number(squareFootage) || 0;
  const tiers = presets.perSqftTiers.map((t) => ({
    key: t.key,
    label: t.label,
    low: round0(t.low * sqft),
    high: round0(t.high * sqft)
  }));
  const flatItems = presets.flatItems.map((f) => ({ ...f }));
  return { sqft, tiers, flatItems };
}
