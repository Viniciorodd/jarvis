// DealForge — entitlement logic (the license gate). Pure, deterministic: given a user's
// billing record + the brand config, decide whether the product is unlocked. No network.
//
// Doctrine: code disposes. Access is decided here, never by an LLM, never ad hoc in the UI.
//
// Unlock order:
//   1. single-tenant build (the owner's personal JARVIS instance) -> always unlocked
//   2. billing disabled (brand.billing.enabled === false) -> always unlocked
//   3. lifetime plan, active -> unlocked forever
//   4. subscription active and not past currentPeriodEnd -> unlocked
//   5. within free-trial window (createdAt + trialDays) -> unlocked (trialing)
//   6. otherwise -> locked

import { planById } from "./plans.js";

const DEFAULT_TRIAL_DAYS = 14;

export function entitlementFor(user = {}, brand = {}, now = Date.now()) {
  const billing = brand.billing || {};
  if (brand.mode === "single-tenant") return ok("owner", { plan: "owner" });
  if (billing.enabled === false) return ok("disabled", { plan: "free" });

  const ent = user.entitlement || {};
  const plan = planById(ent.plan);

  if (ent.status === "active" && plan && plan.interval === "lifetime") {
    return ok("lifetime", { plan: ent.plan, status: "active" });
  }
  if (ent.status === "active" && ent.currentPeriodEnd && Date.parse(ent.currentPeriodEnd) > now) {
    return ok("active", { plan: ent.plan, status: "active", currentPeriodEnd: ent.currentPeriodEnd });
  }

  // free trial measured from account creation
  const trialDays = Number(billing.trialDays ?? DEFAULT_TRIAL_DAYS);
  const created = Date.parse(user.createdAt || 0);
  const trialEnd = created + trialDays * 864e5;
  if (created && now < trialEnd) {
    return ok("trial", { plan: "trial", trialDaysLeft: Math.ceil((trialEnd - now) / 864e5) });
  }

  return { entitled: false, reason: "expired", plan: ent.plan || null, status: ent.status || "none", trialDaysLeft: 0 };
}

function ok(reason, extra) {
  return { entitled: true, reason, trialDaysLeft: extra.trialDaysLeft ?? null, ...extra };
}
