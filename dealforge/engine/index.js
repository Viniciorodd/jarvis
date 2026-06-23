// DealForge — engine barrel. The same modules are imported by the Node server,
// the eval suite, AND the browser SPA (served from /engine/*), so the math is
// provably identical everywhere.

export { computeFlip } from "./flip-brrrr.js";
export { computeRental, amortizedPayment } from "./rental.js";
export { computeWholesale } from "./wholesale.js";
export { rehabEstimate } from "./rehab.js";
export {
  FLIP_DEFAULTS,
  ALLOCATION_DEFAULTS,
  RENTAL_DEFAULTS,
  WHOLESALE_DEFAULTS,
  REHAB_PRESETS,
  CRM_STAGES,
  mergeAssumptions
} from "./defaults.js";
