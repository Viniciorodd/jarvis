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
