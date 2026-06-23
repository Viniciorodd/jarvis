// Generates DealForge icon assets (icon.png 256×256, tray.png 32×32) using only Node built-ins.
// Design: blue→violet gradient rounded square + white house mark + accent door (matches public/icon.svg).
// Run: node dealforge/desktop/make-icons.mjs
'use strict';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CRC32 + PNG builder ──────────────────────────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii'), d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(d.length, 0);
  const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([t, d])), 0);
  return Buffer.concat([len, t, d, crc]);
}
function makePng(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  const stride = w * 4;
  const raw = Buffer.allocUnsafe((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ── geometry helpers ─────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
function inRoundRect(x, y, w, h, r) {
  if (x >= r && x <= w - r) return y >= 0 && y <= h;
  if (y >= r && y <= h - r) return x >= 0 && x <= w;
  const cx = x < r ? r : w - r, cy = y < r ? r : h - r;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inTri(px, py, ax, ay, bx, by, cx, cy) {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const b = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  const c = 1 - a - b;
  return a >= 0 && b >= 0 && c >= 0;
}
const inRect = (px, py, x, y, w, h) => px >= x && px <= x + w && py >= y && py <= y + h;

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const S = size / 512; // design space is 512
  const put = (x, y, r, g, b, a = 255) => { const i = (y * size + x) * 4; const ia = a / 255; buf[i] = lerp(buf[i], r, ia); buf[i + 1] = lerp(buf[i + 1], g, ia); buf[i + 2] = lerp(buf[i + 2], b, ia); buf[i + 3] = Math.max(buf[i + 3], a); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!inRoundRect(x, y, size, size, 112 * S)) continue;
    const t = (x / size + y / size) / 2;                 // diagonal gradient
    let r = lerp(0x5b, 0x8b, t), g = lerp(0x8c, 0x6b, t), b = lerp(0xff, 0xff, t);
    // house silhouette (white), coords from the SVG, scaled
    const X = x / S, Y = y / S;
    const roof = inTri(X, Y, 256, 104, 408, 200, 104, 200);
    const body = inRect(X, Y, 104, 200, 304, 192) && (X <= 192 || X >= 320 || Y <= 288); // notch via door
    if (roof || (inRect(X, Y, 104, 200, 304, 192))) { r = 255; g = 255; b = 255; }
    if (inRect(X, Y, 232, 320, 48, 72)) { r = 0x5b; g = 0x8c; b = 0xff; } // door
    put(x, y, r | 0, g | 0, b | 0, 255);
  }
  return buf;
}

writeFileSync(join(__dirname, 'icon.png'), makePng(256, 256, draw(256)));
writeFileSync(join(__dirname, 'tray.png'), makePng(32, 32, draw(32)));
console.log('Wrote dealforge/desktop/icon.png (256) + tray.png (32)');
