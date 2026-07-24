// Regression suite for pods/gov/attachments.mjs — the attachment ingestion pure helpers. No network:
// sniff/hash/docx run on in-memory buffers. Attachment content is UNTRUSTED DATA; these helpers only
// classify + extract text, never execute anything.
import AdmZip from 'adm-zip';
import { hashUrl, sniffType, docxToText } from '../pods/gov/attachments.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

// build a minimal valid .docx (a zip with word/document.xml) in memory
function makeDocx(text) {
  const zip = new AdmZip();
  zip.addFile('word/document.xml', Buffer.from(`<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`));
  return zip.toBuffer();
}

export default {
  agent: 'gov-attachments',
  cases: [
    { name: 'hashUrl is stable + filename-safe', run: () => {
      const a = hashUrl('https://sam.gov/x/download'); const b = hashUrl('https://sam.gov/x/download');
      return ok(a === b && /^[a-z0-9]+$/.test(a) && a.length >= 6, a);
    } },
    { name: 'sniffType detects PDF by magic bytes', run: () =>
      ok(sniffType(Buffer.from('%PDF-1.7\n...'), 'x', '') === 'pdf') },
    { name: 'sniffType detects DOCX (zip magic + .docx url)', run: () =>
      ok(sniffType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]), 'file.docx', '') === 'docx') },
    { name: 'sniffType falls back to txt for text/plain', run: () =>
      ok(sniffType(Buffer.from('hello there'), 'note', 'text/plain') === 'txt') },
    { name: 'docxToText extracts the paragraph text', run: () => {
      const t = docxToText(makeDocx('The contractor shall provide daily service.'));
      return ok(/contractor shall provide daily service/i.test(t), t.slice(0, 60));
    } },
    { name: 'extractText reads DOCX text', run: async () => {
      const { extractText } = await import('../pods/gov/attachments.mjs');
      const t = await extractText(makeDocx('shall provide restroom sanitation daily'), 'docx');
      return ok(/restroom sanitation daily/i.test(t), t.slice(0, 60));
    } },
    { name: 'extractText reads PDF text via unpdf', run: async () => {
      const fs = await import('node:fs');
      const { extractText } = await import('../pods/gov/attachments.mjs');
      const buf = fs.readFileSync(new URL('./fixtures/sample.pdf', import.meta.url));
      const t = await extractText(buf, 'pdf');
      return ok(/contractor shall provide daily janitorial/i.test(t), t.slice(0, 80));
    } },
    { name: 'extractText returns "" for unknown type (never throws)', run: async () => {
      const { extractText } = await import('../pods/gov/attachments.mjs');
      return ok((await extractText(Buffer.from('??'), 'unknown')) === '');
    } },
    { name: 'extractText never throws on a malformed buffer arg (returns "")', run: async () => {
      const { extractText } = await import('../pods/gov/attachments.mjs');
      const r = await extractText(12345, 'pdf');   // a number is not a Buffer/string
      return ok(r === '', JSON.stringify(r));
    } },
    { name: 'ingestAttachments downloads via injected fetch, caches text, builds combinedText', run: async () => {
      const os = await import('node:os'); const fs = await import('node:fs'); const path = await import('node:path');
      const { ingestAttachments } = await import('../pods/gov/attachments.mjs');
      // fake fetch returns a tiny text "PDF-less" body typed as txt
      const fetchImpl = async () => ({ ok: true, headers: { get: () => 'text/plain' }, arrayBuffer: async () => Buffer.from('The contractor shall maintain insurance coverage.').buffer });
      const op = { noticeId: 'ATT-TEST-' + hashUrl(String(Math.random())), resourceLinks: ['https://sam.gov/a', 'https://sam.gov/b'] };
      const r = await ingestAttachments(op, 'FAKEKEY', { fetchImpl });
      return ok(r.ok && r.files.length === 2 && /maintain insurance coverage/i.test(r.combinedText), JSON.stringify({ files: r.files.length, chars: r.combinedText.length }));
    } },
    { name: 'ingestAttachments with no key returns empty (notice-only fallback)', run: async () => {
      const { ingestAttachments } = await import('../pods/gov/attachments.mjs');
      const r = await ingestAttachments({ noticeId: 'X', resourceLinks: ['https://sam.gov/a'] }, '');
      return ok(r.ok === false && r.combinedText === '' && r.files.length === 0, JSON.stringify(r.files));
    } },
    { name: 'ingestAttachments skips an attachment whose declared content-length exceeds the cap (no buffering)', run: async () => {
      const { ingestAttachments } = await import('../pods/gov/attachments.mjs');
      let bodyRead = false;
      const fetchImpl = async () => ({ ok: true, headers: { get: (h) => (h.toLowerCase() === 'content-length' ? String(999 * 1024 * 1024) : 'application/pdf') }, arrayBuffer: async () => { bodyRead = true; return Buffer.from('x').buffer; } });
      const r = await ingestAttachments({ noticeId: 'ATT-BIG-' + hashUrl(String(Math.random())), resourceLinks: ['https://sam.gov/big'] }, 'FAKEKEY', { fetchImpl });
      const f = r.files[0];
      return ok(f && f.ok === false && f.error === 'too large' && bodyRead === false && r.combinedText === '', JSON.stringify({ f, bodyRead }));
    } },
  ],
};
