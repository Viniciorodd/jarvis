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
// Teal-forward tile so the icon stays visible on dark taskbars (the old all-black
// version disappeared). A bright teal rounded square holds a dark orb "window"
// with glowing teal rings + core — high contrast, on-brand, readable at 32px.
function renderJarvis(size) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const s = size / 512;
  const navy = [4, 7, 15];                           // #04070f — dark orb disc + emblem bg
  const tealHi = [78, 240, 224];                     // bright teal (tile top / glow)
  const tealLo = [26, 157, 146];                     // deeper teal (tile bottom)
  const ring = [120, 245, 232];                      // ring/core teal on the dark disc
  const rrx = Math.max(2, 104 * s);
  const hw = size / 2;

  function inRR(x, y) {
    const dx = Math.abs(x - hw), dy = Math.abs(y - hw);
    if (dx > hw || dy > hw) return false;
    if (dx <= hw - rrx || dy <= hw - rrx) return true;
    return (dx - (hw - rrx)) ** 2 + (dy - (hw - rrx)) ** 2 <= rrx * rrx;
  }

  const rDisc = 188 * s;                              // dark orb "window" radius
  const r1 = 150 * s, r1hw = Math.max(1.5, 6 * s);    // outer ring
  const r2 = 104 * s, r2hw = Math.max(2, 8 * s);      // inner ring
  const rc = 52 * s;                                  // core dot

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const px = x + 0.5, py = y + 0.5;
      if (!inRR(px, py)) { buf[i + 3] = 0; continue; } // transparent outside tile
      const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);

      // teal tile background — vertical gradient top(bright) → bottom(deep)
      const t = py / size;
      let R = Math.round(tealHi[0] * (1 - t) + tealLo[0] * t);
      let G = Math.round(tealHi[1] * (1 - t) + tealLo[1] * t);
      let B = Math.round(tealHi[2] * (1 - t) + tealLo[2] * t);

      if (d <= rDisc) {
        // dark orb window
        R = navy[0]; G = navy[1]; B = navy[2];
        if (d <= rc) {
          R = ring[0]; G = ring[1]; B = ring[2];                 // bright core
        } else if (d >= r2 - r2hw && d <= r2 + r2hw) {
          const a = 0.95;
          R = Math.round(ring[0] * a + navy[0] * (1 - a));
          G = Math.round(ring[1] * a + navy[1] * (1 - a));
          B = Math.round(ring[2] * a + navy[2] * (1 - a));
        } else if (d >= r1 - r1hw && d <= r1 + r1hw) {
          const a = 0.55;
          R = Math.round(ring[0] * a + navy[0] * (1 - a));
          G = Math.round(ring[1] * a + navy[1] * (1 - a));
          B = Math.round(ring[2] * a + navy[2] * (1 - a));
        }
      }
      buf[i] = R; buf[i + 1] = G; buf[i + 2] = B; buf[i + 3] = 255;
    }
  }
  return buf;
}

// ── ICO builder (Windows .exe icon — wraps PNGs in an .ico container) ──────────
// Multi-size so the taskbar (32/48), title bar (16/24) and large views (256) all
// render crisply. Vista+ supports PNG-compressed entries directly.
function makeIco(sizes) {
  const pngs = sizes.map((sz) => makePng(sz, sz, renderJarvis(sz)));
  const count = sizes.length;
  const dir = Buffer.alloc(6 + 16 * count);
  dir.writeUInt16LE(0, 0);          // reserved
  dir.writeUInt16LE(1, 2);          // type: icon
  dir.writeUInt16LE(count, 4);      // image count
  let offset = 6 + 16 * count;
  sizes.forEach((sz, i) => {
    const e = 6 + 16 * i;
    dir[e] = sz >= 256 ? 0 : sz;    // width (0 == 256)
    dir[e + 1] = sz >= 256 ? 0 : sz; // height
    dir[e + 2] = 0;                  // palette
    dir[e + 3] = 0;                  // reserved
    dir.writeUInt16LE(1, e + 4);     // color planes
    dir.writeUInt16LE(32, e + 6);    // bits per pixel
    dir.writeUInt32LE(pngs[i].length, e + 8); // bytes
    dir.writeUInt32LE(offset, e + 12);        // offset
    offset += pngs[i].length;
  });
  return Buffer.concat([dir, ...pngs]);
}

writeFileSync(join(__dirname, 'icon.png'), makePng(256, 256, renderJarvis(256)));
console.log('icon.png  256x256  done');
writeFileSync(join(__dirname, 'tray.png'), makePng(32, 32, renderJarvis(32)));
console.log('tray.png   32x32  done');
writeFileSync(join(__dirname, 'icon.ico'), makeIco([16, 24, 32, 48, 64, 128, 256]));
console.log('icon.ico  multi-size  done');
