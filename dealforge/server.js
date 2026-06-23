// DealForge — dependency-free Node server (builtins only, like hq/server.js).
// Static host for the SPA + shared engine modules, plus a small JSON REST API with
// scrypt/HMAC auth. Runs identically on Windows (dev) and node:20-alpine (NAS / hosted).
//
// API
//   GET  /api/brand                     -> white-label config (public)
//   POST /api/auth/register {email,password,name}
//   POST /api/auth/login    {email,password}
//   GET  /api/auth/me                    (Bearer token)
//   GET/POST           /api/{deals|lenders|expenses|presets|markets}
//   GET/PUT/DELETE     /api/{collection}/:id
//   POST /api/uploads {filename,dataUrl} -> {url}   (Bearer token)
//
// All collection rows are scoped to the authenticated user (sync = server is source of truth).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { store, UPLOADS_DIR, newId } from "./db/store.js";
import {
  registerUser, loginUser, publicUser, verifyToken
} from "./db/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.DEALFORGE_PORT || process.env.PORT || 8096;

const PUBLIC_DIR = path.join(__dirname, "public");
const ENGINE_DIR = path.join(__dirname, "engine");
const CONFIG_DIR = path.join(__dirname, "config");

const COLLECTIONS = new Set(["deals", "lenders", "expenses", "presets", "markets"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json"
};

function send(res, status, body, headers = {}) {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(data);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, { error: "Not found" });
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function readBody(req, limitBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function authUser(req) {
  const h = req.headers["authorization"] || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  const uid = verifyToken(token);
  if (!uid) return null;
  return store.get("users", null, uid);
}

// Safe static path resolution (no traversal outside the served root).
function resolveStatic(root, urlPath) {
  const rel = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(root, rel);
  if (!full.startsWith(root)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;
  const method = req.method.toUpperCase();

  try {
    // ───────── API ─────────
    if (pathname.startsWith("/api/")) {
      // public
      if (pathname === "/api/brand" && method === "GET") {
        return sendFile(res, path.join(CONFIG_DIR, "brand.json"));
      }
      if (pathname === "/api/auth/register" && method === "POST") {
        const body = await readBody(req);
        const r = registerUser(body);
        return r.error ? send(res, 400, r) : send(res, 200, r);
      }
      if (pathname === "/api/auth/login" && method === "POST") {
        const body = await readBody(req);
        const r = loginUser(body);
        return r.error ? send(res, 401, r) : send(res, 200, r);
      }

      // everything below requires auth
      const user = authUser(req);
      if (!user) return send(res, 401, { error: "Unauthorized" });

      if (pathname === "/api/auth/me" && method === "GET") {
        return send(res, 200, { user: publicUser(user) });
      }

      if (pathname === "/api/uploads" && method === "POST") {
        const body = await readBody(req);
        const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(body.dataUrl || "");
        if (!m) return send(res, 400, { error: "Expected an image data URL" });
        const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/svg+xml": ".svg" }[m[1]] || ".bin";
        const id = newId();
        const file = `${id}${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, file), Buffer.from(m[2], "base64"));
        return send(res, 200, { url: `/uploads/${file}`, id });
      }

      // collection routes: /api/<col> and /api/<col>/:id
      const parts = pathname.split("/").filter(Boolean); // ["api","deals", id?]
      const col = parts[1];
      const id = parts[2];
      if (COLLECTIONS.has(col)) {
        if (!id) {
          if (method === "GET") {
            const filter = url.searchParams.get("archived") != null
              ? { archived: url.searchParams.get("archived") === "true" }
              : {};
            return send(res, 200, { items: store.list(col, user.id, filter) });
          }
          if (method === "POST") {
            const body = await readBody(req);
            delete body.id; delete body.userId;
            return send(res, 200, { item: store.insert(col, { ...body, userId: user.id }) });
          }
        } else {
          if (method === "GET") {
            const item = store.get(col, user.id, id);
            return item ? send(res, 200, { item }) : send(res, 404, { error: "Not found" });
          }
          if (method === "PUT") {
            const body = await readBody(req);
            delete body.id; delete body.userId;
            const item = store.update(col, user.id, id, body);
            return item ? send(res, 200, { item }) : send(res, 404, { error: "Not found" });
          }
          if (method === "DELETE") {
            return store.remove(col, user.id, id)
              ? send(res, 200, { ok: true })
              : send(res, 404, { error: "Not found" });
          }
        }
      }
      return send(res, 404, { error: "Unknown endpoint" });
    }

    // ───────── static ─────────
    if (pathname.startsWith("/engine/")) {
      const f = resolveStatic(ENGINE_DIR, pathname.slice("/engine".length));
      return f ? sendFile(res, f) : send(res, 404, { error: "Not found" });
    }
    if (pathname.startsWith("/uploads/")) {
      const f = resolveStatic(UPLOADS_DIR, pathname.slice("/uploads".length));
      return f ? sendFile(res, f) : send(res, 404, { error: "Not found" });
    }
    if (pathname === "/config/brand.json") {
      return sendFile(res, path.join(CONFIG_DIR, "brand.json"));
    }

    // SPA static + history fallback
    let staticPath = resolveStatic(PUBLIC_DIR, pathname === "/" ? "/index.html" : pathname);
    if (staticPath && fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
      return sendFile(res, staticPath);
    }
    return sendFile(res, path.join(PUBLIC_DIR, "index.html"));
  } catch (err) {
    return send(res, 500, { error: err.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`DealForge running → http://localhost:${PORT}`);
});
