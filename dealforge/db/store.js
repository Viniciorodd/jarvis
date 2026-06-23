// DealForge — data layer. Dependency-free JSON collection store with atomic writes and an
// in-memory write-through cache. Behind this small interface so a SQLite/Postgres adapter can
// drop in for the hosted multi-tenant product without touching any route code.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DEALFORGE_DATA_DIR lets the packaged desktop app point at a writable user-data location
// (the app bundle itself is read-only). Defaults to ../data for local/dev/NAS runs.
export const DATA_DIR = process.env.DEALFORGE_DATA_DIR || path.join(__dirname, "..", "data");
const COLLECTIONS_DIR = path.join(DATA_DIR, "collections");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

for (const d of [DATA_DIR, COLLECTIONS_DIR, UPLOADS_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

const cache = new Map(); // collection name -> array of records

function fileFor(name) {
  return path.join(COLLECTIONS_DIR, `${name}.json`);
}

function load(name) {
  if (cache.has(name)) return cache.get(name);
  const f = fileFor(name);
  let rows = [];
  try {
    rows = JSON.parse(fs.readFileSync(f, "utf8"));
    if (!Array.isArray(rows)) rows = [];
  } catch {
    rows = [];
  }
  cache.set(name, rows);
  return rows;
}

function persist(name) {
  const f = fileFor(name);
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache.get(name) ?? [], null, 2));
  fs.renameSync(tmp, f); // atomic on same volume
}

export function newId() {
  return crypto.randomBytes(9).toString("base64url");
}

// ── Generic collection CRUD, all user-scoped ──────────────────────────────
export const store = {
  list(name, userId, filter = {}) {
    return load(name).filter((r) => {
      if (userId != null && r.userId !== userId) return false;
      for (const k of Object.keys(filter)) {
        if (r[k] !== filter[k]) return false;
      }
      return true;
    });
  },

  get(name, userId, id) {
    return load(name).find((r) => r.id === id && (userId == null || r.userId === userId)) || null;
  },

  insert(name, record) {
    const rows = load(name);
    const now = new Date().toISOString();
    const row = { id: newId(), createdAt: now, updatedAt: now, ...record };
    rows.push(row);
    persist(name);
    return row;
  },

  update(name, userId, id, patch) {
    const rows = load(name);
    const i = rows.findIndex((r) => r.id === id && (userId == null || r.userId === userId));
    if (i === -1) return null;
    rows[i] = { ...rows[i], ...patch, id: rows[i].id, userId: rows[i].userId, updatedAt: new Date().toISOString() };
    persist(name);
    return rows[i];
  },

  remove(name, userId, id) {
    const rows = load(name);
    const i = rows.findIndex((r) => r.id === id && (userId == null || r.userId === userId));
    if (i === -1) return false;
    rows.splice(i, 1);
    persist(name);
    return true;
  },

  // Find one record across all users (used for auth lookups by email).
  findRaw(name, predicate) {
    return load(name).find(predicate) || null;
  }
};
