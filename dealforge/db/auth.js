// DealForge — auth. Dependency-free: scrypt password hashing + HMAC-signed tokens.
// Secret comes from env DEALFORGE_SECRET (least privilege; never in code/Notion). If unset
// (local dev) a persisted random secret is used so tokens survive restarts.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { store, newId } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = path.join(__dirname, "..", "data", ".secret");

function getSecret() {
  if (process.env.DEALFORGE_SECRET) return process.env.DEALFORGE_SECRET;
  try {
    return fs.readFileSync(SECRET_FILE, "utf8").trim();
  } catch {
    const s = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
    return s;
  }
}
const SECRET = getSecret();

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const fromB64u = (s) => Buffer.from(s, "base64url");

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(":");
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  const a = Buffer.from(hashHex, "hex");
  return a.length === hash.length && crypto.timingSafeEqual(a, hash);
}

// Signed token: base64url(payload).base64url(hmac). 30-day expiry.
export function signToken(userId) {
  const payload = b64u(JSON.stringify({ uid: userId, exp: Date.now() + 30 * 864e5 }));
  const sig = b64u(crypto.createHmac("sha256", SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = b64u(crypto.createHmac("sha256", SECRET).update(payload).digest());
  const a = fromB64u(sig);
  const b = fromB64u(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(fromB64u(payload).toString("utf8"));
    if (!data.exp || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export function registerUser({ email, password, name }) {
  email = String(email || "").trim().toLowerCase();
  if (!email || !password) return { error: "Email and password are required." };
  if (String(password).length < 8) return { error: "Password must be at least 8 characters." };
  if (store.findRaw("users", (u) => u.email === email)) {
    return { error: "An account with that email already exists." };
  }
  const user = store.insert("users", {
    email,
    name: name || email.split("@")[0],
    passwordHash: hashPassword(password),
    plan: "owner" // single-tenant default; billing phase will manage entitlements
  });
  return { user: publicUser(user), token: signToken(user.id) };
}

export function loginUser({ email, password }) {
  email = String(email || "").trim().toLowerCase();
  const user = store.findRaw("users", (u) => u.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid email or password." };
  }
  return { user: publicUser(user), token: signToken(user.id) };
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

export { newId };
