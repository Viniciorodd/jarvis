// DealForge — Stripe billing. Dependency-free: talks to Stripe's REST API with global fetch
// and verifies webhooks with node:crypto. NO Stripe SDK, NO keys in code.
//
// Required env to go live (set by the operator, never committed — least privilege):
//   STRIPE_SECRET_KEY            sk_live_… / sk_test_…
//   STRIPE_WEBHOOK_SECRET        whsec_…
//   STRIPE_PRICE_MONTHLY / _QUARTERLY / _YEARLY / _LIFETIME   price IDs
//
// When STRIPE_SECRET_KEY is absent the system is INERT — checkout returns 503 and no money can
// move. This is the safe default; the doctrine requires explicit operator action to enable it.

import crypto from "node:crypto";
import { store } from "./store.js";
import { planById, periodEnd } from "../engine/plans.js";

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function form(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === "object") form(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join("&");
}

async function stripe(path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe error (${res.status})`);
  return data;
}

// Create a Checkout Session for a plan. Subscription for recurring plans, one-time for lifetime.
export async function createCheckoutSession({ planId, user, origin }) {
  if (!stripeConfigured()) { const e = new Error("Billing is not configured"); e.code = 503; throw e; }
  const plan = planById(planId);
  if (!plan) { const e = new Error("Unknown plan"); e.code = 400; throw e; }
  const priceId = process.env[plan.stripePriceEnv];
  if (!priceId) { const e = new Error(`Missing price for ${planId} (${plan.stripePriceEnv})`); e.code = 503; throw e; }

  const session = await stripe("checkout/sessions", {
    mode: plan.interval === "lifetime" ? "payment" : "subscription",
    "line_items": [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.email,
    success_url: `${origin}/?billing=success#/settings`,
    cancel_url: `${origin}/?billing=cancel#/upgrade`,
    metadata: { userId: user.id, plan: planId }
  });
  return { url: session.url, id: session.id };
}

// Verify a Stripe webhook signature (t=…,v1=…) over the raw body.
export function verifyWebhook(rawBody, sigHeader) {
  const wh = process.env.STRIPE_WEBHOOK_SECRET;
  if (!wh || !sigHeader) return null;
  const parts = Object.fromEntries(String(sigHeader).split(",").map((p) => p.split("=")));
  if (!parts.t || !parts.v1) return null;
  const expected = crypto.createHmac("sha256", wh).update(`${parts.t}.${rawBody}`).digest("hex");
  const a = Buffer.from(parts.v1), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(rawBody); } catch { return null; }
}

// Apply a verified Stripe event to a user's entitlement.
export function applyWebhookEvent(event) {
  if (!event || !event.type) return false;
  const obj = event.data?.object || {};
  const userId = obj.client_reference_id || obj.metadata?.userId;

  if (event.type === "checkout.session.completed") {
    const planId = obj.metadata?.plan;
    const plan = planById(planId);
    if (!userId || !plan) return false;
    store.update("users", null, userId, {
      entitlement: {
        plan: planId, status: "active", source: "stripe",
        stripeCustomerId: obj.customer || null,
        stripeSubscriptionId: obj.subscription || null,
        currentPeriodEnd: periodEnd(plan, new Date())
      }
    });
    return true;
  }
  if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.canceled") {
    // find user by subscription id and mark canceled
    const u = store.findRaw("users", (x) => x.entitlement?.stripeSubscriptionId === obj.id);
    if (u) store.update("users", null, u.id, { entitlement: { ...u.entitlement, status: "canceled" } });
    return true;
  }
  return false;
}

// Activate an offline license key (lifetime / air-gapped). Returns the new entitlement.
export function activateLicense(user, validated) {
  const ent = {
    plan: validated.plan || "lifetime", status: "active", source: "license",
    currentPeriodEnd: periodEnd(planById(validated.plan), new Date())
  };
  store.update("users", null, user.id, { entitlement: ent });
  return ent;
}
