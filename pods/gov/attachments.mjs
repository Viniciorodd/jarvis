// attachments.mjs — turn a solicitation's attachment URLs into cached plain text so the compliance matrix
// (matrix.mjs) can read the ACTUAL requirements (Section L/M, PWS, wage determination) that live in the
// attached PDFs/DOCX, not just the SAM notice summary. Downloads are best-effort + capped; every downloaded
// file is UNTRUSTED DATA — we only extract text, never execute anything. The cache (gov-drafts/att/<slug>/)
// is also the substrate Phase 2 (amendment diffing) and Phase 6 (wage determinations) build on. Never throws.
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { ROOT } from './lib.mjs';
import { htmlToText, sowPath } from './sow.mjs';

export const ATT_DIR = path.join(ROOT, 'gov-drafts', 'att');
const slug = (op) => String((op && (op.noticeId || op.title)) || 'op').replace(/[^\w]+/g, '-').slice(0, 50);
export const attDir = (op) => path.join(ATT_DIR, slug(op));

// PURE: short, stable, filename-safe hash of a URL (djb2 → base36).
export function hashUrl(url) {
  let h = 5381;
  const s = String(url || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// PURE: classify a downloaded buffer. Magic bytes win; then url extension / content-type.
export function sniffType(buffer, url = '', contentType = '') {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  if (b.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  const isZip = b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
  const u = String(url || '').toLowerCase(); const ct = String(contentType || '').toLowerCase();
  if (isZip && (/\.docx(\?|$)/.test(u) || /wordprocessingml/.test(ct))) return 'docx';
  if (/pdf/.test(ct) || /\.pdf(\?|$)/.test(u)) return 'pdf';
  if (/\.docx(\?|$)/.test(u) || /wordprocessingml/.test(ct)) return 'docx';
  if (/text\/|\.txt(\?|$)|\.md(\?|$)/.test(ct + ' ' + u)) return 'txt';
  if (/text\/html/.test(ct)) return 'txt';
  return 'unknown';
}

// PURE: DOCX (a zip) → text. Reads word/document.xml, turns paragraph tags into newlines, strips XML.
export function docxToText(buffer) {
  try {
    const zip = new AdmZip(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
    const entry = zip.getEntry('word/document.xml');
    if (!entry) return '';
    const xml = zip.readAsText(entry);
    return xml
      .replace(/<\/w:p>/g, '\n').replace(/<w:tab[^>]*>/g, '\t')
      .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  } catch { return ''; }
}

// Extract plain text from one downloaded buffer. PDF via unpdf's serverless pdf.js build (pure JS — runs on
// win32 + alpine); DOCX via docxToText; txt/html direct. Any parser failure → '' (best-effort, never throws).
export async function extractText(buffer, type) {
  try {
    const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
    if (type === 'pdf') {
      const { extractText: pdfExtract, getDocumentProxy } = await import('unpdf');
      const doc = await getDocumentProxy(new Uint8Array(b));
      const { text } = await pdfExtract(doc, { mergePages: true });
      return String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }
    if (type === 'docx') return docxToText(b);
    if (type === 'txt') { const s = b.toString('utf8'); return /<[a-z][\s\S]*>/i.test(s) ? htmlToText(s) : s.trim(); }
  } catch { /* best-effort */ }
  return '';
}

// Best-effort orchestrator: download a notice's attachments (capped), extract + cache each to
// gov-drafts/att/<slug>/<hash>.txt, write a manifest, and return the combined UNTRUSTED text. Requires a SAM
// key (attachment downloads are authenticated); with no key it degrades to empty so the matrix uses notice
// text alone. `fetchImpl` is injectable for tests. Never throws.
export async function ingestAttachments(op = {}, key = '', { max = Number(process.env.SHRED_MAX_ATT) || 8, maxBytesEach = 25 * 1024 * 1024, timeoutMs = 20000, force = false, fetchImpl = fetch } = {}) {
  const empty = { ok: false, dir: null, files: [], combinedText: '', manifestFile: null };
  try {
    let links = Array.isArray(op.resourceLinks) ? op.resourceLinks.filter(Boolean) : [];
    if (!links.length) links = attachmentsFromSowFile(op);           // re-shred later: read the SOW file's list
    if (!links.length || !key) return empty;
    const dir = attDir(op);
    fs.mkdirSync(dir, { recursive: true });
    const files = [];
    for (const url of links.slice(0, max)) {
      const hash = hashUrl(url);
      const textFile = path.join(dir, `${hash}.txt`);
      if (!force && fs.existsSync(textFile)) {                        // cached — parse once
        const text = safeRead(textFile);
        files.push({ url, hash, type: 'cached', bytes: 0, chars: text.length, ok: true, error: null, textFile: path.relative(ROOT, textFile) });
        continue;
      }
      try {
        const sep = url.includes('?') ? '&' : '?';
        const r = await fetchImpl(`${url}${sep}api_key=${key}`, { signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) { files.push({ url, hash, type: 'unknown', bytes: 0, chars: 0, ok: false, error: `http ${r.status}`, textFile: null }); continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > maxBytesEach) { files.push({ url, hash, type: 'skip', bytes: buf.length, chars: 0, ok: false, error: 'too large', textFile: null }); continue; }
        const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        const type = sniffType(buf, url, ct);
        const text = await extractText(buf, type);
        fs.writeFileSync(textFile, text);
        files.push({ url, hash, type, bytes: buf.length, chars: text.length, ok: true, error: text ? null : 'no extractable text', textFile: path.relative(ROOT, textFile) });
      } catch (e) { files.push({ url, hash, type: 'unknown', bytes: 0, chars: 0, ok: false, error: e.message, textFile: null }); }
    }
    const manifestFile = path.join(dir, 'manifest.json');
    try { fs.writeFileSync(manifestFile, JSON.stringify(files, null, 2)); } catch { /* best-effort */ }
    const combinedText = files
      .filter((f) => f.ok && f.textFile)
      .map((f, i) => `\n\n===== ATTACHMENT ${i + 1} (${f.type}) =====\n${safeRead(path.join(ROOT, f.textFile))}`)
      .join('');
    return { ok: true, dir: path.relative(ROOT, dir), files, combinedText, manifestFile: path.relative(ROOT, manifestFile) };
  } catch { return empty; }
}

function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
// re-shred path: the SOW file lists attachment URLs under "## Attachments"; parse them back out.
function attachmentsFromSowFile(op) {
  try {
    const raw = fs.readFileSync(sowPath(op), 'utf8');
    return [...raw.matchAll(/^\s*\d+\.\s+(https?:\/\/\S+)\s*$/gim)].map((m) => m[1]);
  } catch { return []; }
}
