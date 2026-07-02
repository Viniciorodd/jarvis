// sow.mjs — pull the ACTUAL scope of work. In SAM.gov's v2 search API the `description` field is a
// URL (a link to the noticedesc endpoint), NOT prose — so until now the analysts were scoring and
// drafting off a headline + a link string. This module fetches the real description text (HTML →
// plain text), captures the attachment list (resourceLinks), saves one SOW file per deal, and hands
// the text back so scoring/drafting work from the real requirement. Pure helpers eval-pinned.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

export const SOW_DIR = path.join(ROOT, 'gov-drafts', 'sow');

// ── PURE: is this "description" actually a URL (the SAM v2 shape)? ─────────────────────────────────
export function isDescriptionUrl(s) { return /^https?:\/\//i.test(String(s || '').trim()); }

// ── PURE: crude but dependency-free HTML → readable text ───────────────────────────────────────────
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

const slug = (op) => String(op.noticeId || op.title || 'op').replace(/[^\w]+/g, '-').slice(0, 50);
export const sowPath = (op) => path.join(SOW_DIR, `${slug(op)}.md`);

// Fetch the full description for one opportunity. Returns { text, source } — text is '' on failure so
// callers degrade gracefully to whatever short description they had.
export async function fetchDescription(op, key) {
  const url = op.descriptionUrl || (isDescriptionUrl(op.description) ? op.description : '');
  if (!url || !key) return { text: '', source: 'none' };
  try {
    const sep = url.includes('?') ? '&' : '?';
    const r = await fetch(`${url}${sep}api_key=${key}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { text: '', source: `sam ${r.status}` };
    const raw = await r.text();
    let body = raw;
    try { const j = JSON.parse(raw); body = j.description || j.body || raw; } catch { /* raw HTML/text */ }
    return { text: htmlToText(body).slice(0, 20000), source: 'sam' };
  } catch (e) { return { text: '', source: 'error: ' + e.message }; }
}

// Pull + persist the SOW for one deal: full description text + the attachment links, one .md per notice.
// Returns { ok, file, text, attachments } — never throws.
export async function pullScopeOfWork(op, key) {
  const { text, source } = await fetchDescription(op, key);
  const attachments = Array.isArray(op.resourceLinks) ? op.resourceLinks.filter(Boolean) : [];
  if (!text && !attachments.length) return { ok: false, file: null, text: '', attachments, source };
  fs.mkdirSync(SOW_DIR, { recursive: true });
  const file = sowPath(op);
  const md = [
    `# Scope of Work — ${op.title || op.noticeId}`,
    `<!-- notice ${op.noticeId} · pulled ${new Date().toISOString()} · source ${source} -->`,
    '',
    attachments.length ? `## Attachments (${attachments.length})\n${attachments.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n` : '',
    text ? `## Description\n\n${text}` : '_No description text available — see attachments._',
    '',
  ].join('\n');
  fs.writeFileSync(file, md);
  return { ok: true, file: path.relative(ROOT, file), text, attachments, source };
}
