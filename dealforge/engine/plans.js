// DealForge — membership plan catalog (the sellable product's pricing). Pure data.
// Prices are display defaults; the actual charge is whatever the matching Stripe Price is set
// to. `stripePriceEnv` names the env var holding that Stripe Price ID — never hard-coded, never
// committed (least privilege). `interval` drives entitlement period math in entitlements.js.

export const PLANS = [
  { id: "monthly",   label: "Monthly",   price: 29,  interval: "month",   intervalCount: 1,  stripePriceEnv: "STRIPE_PRICE_MONTHLY",   blurb: "Billed monthly. Cancel anytime." },
  { id: "quarterly", label: "Quarterly", price: 75,  interval: "month",   intervalCount: 3,  stripePriceEnv: "STRIPE_PRICE_QUARTERLY", blurb: "Billed every 3 months. Save 14%." },
  { id: "yearly",    label: "Yearly",    price: 249, interval: "year",    intervalCount: 1,  stripePriceEnv: "STRIPE_PRICE_YEARLY",    blurb: "Billed yearly. Save 28%.", highlight: true },
  { id: "lifetime",  label: "Lifetime",  price: 599, interval: "lifetime", intervalCount: 0, stripePriceEnv: "STRIPE_PRICE_LIFETIME",  blurb: "One payment. Yours forever." }
];

export const planById = (id) => PLANS.find((p) => p.id === id) || null;

// Advance a period end by a plan's interval, from a starting date.
export function periodEnd(plan, from = new Date()) {
  const d = new Date(from);
  if (!plan || plan.interval === "lifetime") return null; // lifetime never expires
  if (plan.interval === "year") d.setFullYear(d.getFullYear() + plan.intervalCount);
  else d.setMonth(d.getMonth() + plan.intervalCount); // month / quarter
  return d.toISOString();
}
