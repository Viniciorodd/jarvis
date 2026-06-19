// Generates JARVIS icon assets (icon.png 256×256, tray.png 32×32) using only Node built-ins.
// Design: dark #04070f bg + two teal (#39e0d0) rings + solid teal core, inside a rounded rect.
// Run once: node companion/desktop/make-icons.mjs
'use strict';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CRC32 ─────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG builder ───────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const typeB = Buffer.from(type, 'ascii');
  const dataB = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const lenB = Buffer.allocUnsafe(4); lenB.writeUInt32BE(dataB.length, 0);
  const crcB = Buffer.allocUnsafe(4); crcB.writeUInt32BE(crc32(Buffer.concat([typeB, dataB])), 0);
  return Buffer.concat([lenB, typeB, dataB, crcB]);
}

function makePng(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0; // 8-bit RGBA
  const stride = w * 4;
  const raw = Buffer.allocUnsafe(h * (1 + stride));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + stride)] = 0; // filter byte: None
    rgba.copy(raw, y * (1 + stride) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── JARVIS design renderer ────────────────────────────────────────────────────
function renderJarvis(size) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const s = size / 512;                             // scale: original SVG viewBox is 512x512
  const bg = [4, 7, 15];                            // #04070f
  const teal = [57, 224, 208];                      // #39e0d0
  const rrx = Math.max(2, 104 * s);                 // rounded-rect corner radius (SVG rx=104)
  const hw = size / 2;

  function inRR(x, y) {
    const dx = Math.abs(x - hw), dy = Math.abs(y - hw);
    if (dx > hw || dy > hw) return false;
    if (dx <= hw - rrx || dy <= hw - rrx) return true;
    return (dx - (hw - rrx)) ** 2 + (dy - (hw - rrx)) ** 2 <= rrx * rrx;
  }

  // SVG values scaled to size; half-widths with minimums for small sizes
  const r1 = 156 * s, r1hw = Math.max(1, 2.5 * s);   // outer ring (stroke-width=5)
  const r2 = 116 * s, r2hw = Math.max(1.5, 4 * s);   // inner ring (stroke-width=8)
  const rc = 48 * s;                                   // core dot

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const px = x + 0.5, py = y + 0.5;
      if (!inRR(px, py)) { buf[i + 3] = 0; continue; } // transparent outside icon shape
      const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      let R = bg[0], G = bg[1], B = bg[2];
      if (d <= rc) {
        R = teal[0]; G = teal[1]; B = teal[2];        // solid teal core
      } else if (d >= r2 - r2hw && d <= r2 + r2hw) {
        const a = 0.7;
        R = Math.round(teal[0] * a + bg[0] * (1 - a));
        G = Math.round(teal[1] * a + bg[1] * (1 - a));
        B = Math.round(teal[2] * a + bg[2] * (1 - a));
      } else if (d >= r1 - r1hw && d <= r1 + r1hw) {
        const a = 0.35;
        R = Math.round(teal[0] * a + bg[0] * (1 - a));
        G = Math.round(teal[1] * a + bg[1] * (1 - a));
        B = Math.round(teal[2] * a + bg[2] * (1 - a));
      }
      buf[i] = R; buf[i + 1] = G; buf[i + 2] = B; buf[i + 3] = 255;
    }
  }
  return buf;
}

writeFileSync(join(__dirname, 'icon.png'), makePng(256, 256, renderJarvis(256)));
console.log('icon.png  256x256  done');
writeFileSync(join(__dirname, 'tray.png'), makePng(32, 32, renderJarvis(32)));
console.log('tray.png   32x32  done');
