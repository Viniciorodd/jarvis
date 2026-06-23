// DealForge — license keys. HMAC-signed, offline-verifiable keys for lifetime / air-gapped
// activation (no Stripe round-trip needed to validate). Dependency-free (node:crypto).
//
// Secret comes from env DEALFORGE_LICENSE_SECRET (falls back to the app signing secret).
// Keys are base32 (A–Z2–7), dash-grouped for legibility: DF-XXXXX-XXXXX-… The signed payload
// {plan, email, issuedAt} validates purely from the signature — no server lookup, works offline.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./store.js";

function secret() {
  if (process.env.DEALFORGE_LICENSE_SECRET) return process.env.DEALFORGE_LICENSE_SECRET;
  try { return fs.readFileSync(path.join(DATA_DIR, ".secret"), "utf8").trim(); }
  catch { return "dealforge-dev-license-secret"; }
}

// ── base32 (RFC 4648, no padding) ───────────────────────────────────────────
const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32enc(buf) {
  let bits = 0, val = 0, out = "";
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += A[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += A[(val << (5 - bits)) & 31];
  return out;
}
function b32dec(str) {
  let bits = 0, val = 0; const bytes = [];
  for (const c of String(str).toUpperCase()) {
    const idx = A.indexOf(c); if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(bytes);
}

const SIG_BYTES = 8; // 8-byte (64-bit) truncated HMAC tag
function sigFor(payloadBuf) {
  return crypto.createHmac("sha256", secret()).update(payloadBuf).digest().subarray(0, SIG_BYTES);
}
const group = (s) => "DF-" + (s.match(/.{1,5}/g) || [s]).join("-");

export function generateLicenseKey({ plan = "lifetime", email = "", kid = "" } = {}) {
  const payload = Buffer.from(JSON.stringify({ p: plan, e: email, t: Date.now(), k: kid }), "utf8");
  const token = b32enc(Buffer.concat([payload, sigFor(payload)]));
  return group(token);
}

export function validateLicenseKey(key) {
  const raw = b32dec(String(key || "").replace(/^DF-/i, "").replace(/-/g, ""));
  if (raw.length <= SIG_BYTES) return { valid: false, error: "Malformed key" };
  const payload = raw.subarray(0, raw.length - SIG_BYTES);
  const givenSig = raw.subarray(raw.length - SIG_BYTES);
  const expectSig = sigFor(payload);
  if (givenSig.length !== expectSig.length || !crypto.timingSafeEqual(givenSig, expectSig)) {
    return { valid: false, error: "Invalid signature" };
  }
  try {
    const data = JSON.parse(payload.toString("utf8"));
    return { valid: true, plan: data.p, email: data.e, issuedAt: data.t };
  } catch {
    return { valid: false, error: "Corrupt payload" };
  }
}
