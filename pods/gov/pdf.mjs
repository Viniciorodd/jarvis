// pdf.mjs — dependency-free "PDF" generation for gov docs. The government wants a clean, letterheaded
// PDF, not a text blob. Rather than pull a heavy HTML→PDF library (against the dep-free rule), we render
// a PRINT-PERFECT HTML page: RODGATE letterhead, proper margins/page-breaks, and a "Download PDF" button
// that calls the browser's built-in print-to-PDF. One click → a real, professional PDF.
//
// Two documents:
//   • proposalDoc(md, meta) — a staged proposal/outreach draft (markdown) → letterheaded print page.
//   • capabilityDoc()       — RODGATE's 1-page capability statement (the doc every sources-sought needs).
//
// mdToHtml is a small, PURE markdown renderer (eval-pinned) — headings, bold/italic/code, lists, tables,
// rules, paragraphs. Enough for our proposals; it escapes HTML first so draft text can never inject markup.

import { COMPANY } from './company.mjs';

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// PURE: minimal, safe markdown → HTML. Eval-pinned. Escapes first, then applies inline + block rules.
export function mdToHtml(md) {
  const src = String(md || '').replace(/\r\n/g, '\n').replace(/^<!--[\s\S]*?-->\n?/, ''); // strip a leading HTML comment (our draft metadata line)
  const inline = (t) => escapeHtml(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const lines = src.split('\n');
  const out = [];
  let i = 0, para = [], listType = null, listItems = [];
  const flushPara = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
  const flushList = () => { if (listType) { out.push(`<${listType}>` + listItems.map((li) => '<li>' + inline(li) + '</li>').join('') + `</${listType}>`); listType = null; listItems = []; } };
  const flush = () => { flushPara(); flushList(); };
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flush(); i++; continue; }
    // table: a header row "| a | b |" followed by a "| --- | --- |" separator
    if (/^\|.*\|$/.test(t) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      flush();
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(t);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { rows.push(cells(lines[i].trim())); i++; }
      out.push('<table><thead><tr>' + head.map((h) => '<th>' + inline(h) + '</th>').join('') + '</tr></thead><tbody>'
        + rows.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); const lvl = Math.min(6, h[1].length); out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); out.push('<hr>'); i++; continue; }
    const ul = t.match(/^[-*]\s+(.*)$/);
    const ol = t.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      const want = ul ? 'ul' : 'ol';
      flushPara();
      if (listType && listType !== want) flushList();
      listType = want; listItems.push((ul || ol)[1]); i++; continue;
    }
    flushList();
    para.push(t); i++;
  }
  flush();
  return out.join('\n');
}

// The shared print shell: RODGATE letterhead, print CSS (Letter, 0.75in margins, page-break control),
// a floating "Download PDF" button (window.print) that's hidden when actually printing.
function printPage({ title, docLabel, bodyHtml, meta = '' }) {
  const c = COMPANY;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  :root{ --ink:#111418; --dim:#5b6472; --line:#d7dbe0; --accent:#1f3a5f; }
  *{ box-sizing:border-box; }
  html,body{ margin:0; background:#e9ecef; color:var(--ink); font:14px/1.55 "Segoe UI",-apple-system,Helvetica,Arial,sans-serif; }
  .sheet{ background:#fff; width:8.5in; min-height:11in; margin:22px auto; padding:0.75in; box-shadow:0 4px 24px rgba(0,0,0,.14); }
  .lh{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid var(--accent); padding-bottom:12px; margin-bottom:8px; }
  .lh .co{ font-size:20px; font-weight:800; letter-spacing:.01em; color:var(--accent); }
  .lh .co small{ display:block; font-size:11px; font-weight:600; color:var(--dim); letter-spacing:.02em; }
  .lh .reg{ text-align:right; font-size:10.5px; color:var(--dim); line-height:1.5; }
  .doclabel{ font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--dim); margin:14px 0 2px; }
  .doctitle{ font-size:19px; font-weight:700; margin:0 0 4px; }
  .docmeta{ font-size:11.5px; color:var(--dim); margin-bottom:14px; }
  h1{ font-size:18px; } h2{ font-size:15px; border-bottom:1px solid var(--line); padding-bottom:3px; margin-top:20px; }
  h3{ font-size:13.5px; color:var(--accent); margin-top:16px; }
  p{ margin:8px 0; } ul,ol{ margin:8px 0; padding-left:22px; } li{ margin:3px 0; }
  code{ background:#f2f4f7; padding:1px 5px; border-radius:4px; font-size:12.5px; }
  table{ width:100%; border-collapse:collapse; margin:12px 0; font-size:12.5px; }
  th,td{ border:1px solid var(--line); padding:6px 9px; text-align:left; vertical-align:top; }
  th{ background:#f2f4f7; }
  hr{ border:none; border-top:1px solid var(--line); margin:16px 0; }
  .ft{ margin-top:26px; border-top:1px solid var(--line); padding-top:8px; font-size:10.5px; color:var(--dim); display:flex; justify-content:space-between; }
  .dl{ position:fixed; top:16px; right:16px; background:var(--accent); color:#fff; border:none; border-radius:8px;
       padding:11px 18px; font:600 14px "Segoe UI",sans-serif; cursor:pointer; box-shadow:0 3px 12px rgba(0,0,0,.2); }
  .dl:hover{ background:#16283f; }
  .hint{ position:fixed; top:58px; right:16px; font-size:11px; color:#5b6472; max-width:190px; text-align:right; }
  @media print{
    html,body{ background:#fff; } .sheet{ box-shadow:none; margin:0; width:auto; min-height:0; padding:0; }
    .dl,.hint{ display:none !important; }
    h2,h3{ page-break-after:avoid; } table,li,p{ page-break-inside:avoid; }
    @page{ size:Letter; margin:0.75in; }
  }
</style></head><body>
  <button class="dl" onclick="window.print()">⬇ Download PDF</button>
  <div class="hint">Choose “Save as PDF” as the printer.</div>
  <div class="sheet">
    <div class="lh">
      <div class="co">RODGATE<small>${escapeHtml(c.legalName)} (DBA ${escapeHtml(c.dba)})</small></div>
      <div class="reg">UEI ${escapeHtml(c.uei)} · CAGE ${escapeHtml(c.cage)}<br>${escapeHtml(c.contact.email)} · ${escapeHtml(c.contact.phone)}</div>
    </div>
    ${docLabel ? `<div class="doclabel">${escapeHtml(docLabel)}</div>` : ''}
    ${title ? `<div class="doctitle">${escapeHtml(title)}</div>` : ''}
    ${meta ? `<div class="docmeta">${escapeHtml(meta)}</div>` : ''}
    ${bodyHtml}
    <div class="ft"><span>${escapeHtml(c.legalName)} · ${escapeHtml(c.contact.address)}</span><span>Small Disadvantaged, Minority-Owned Small Business</span></div>
  </div>
</body></html>`;
}

// A staged proposal / outreach draft (markdown) → letterheaded print page.
export function proposalDoc(md, meta = {}) {
  const title = meta.title || 'Proposal';
  const label = meta.kind === 'outreach' ? 'Teaming / Outreach' : meta.kind === 'sources-sought' ? 'Sources-Sought Response' : 'Proposal';
  const bits = [];
  if (meta.noticeId) bits.push('Notice ' + meta.noticeId);
  if (meta.deadline) bits.push('Due ' + meta.deadline);
  bits.push('Prepared ' + (meta.date || ''));
  return printPage({ title, docLabel: label, meta: bits.filter(Boolean).join(' · '), bodyHtml: mdToHtml(md) });
}

// RODGATE's 1-page capability statement — the doc every sources-sought / prime intro needs attached.
export function capabilityDoc() {
  const c = COMPANY;
  const kv = (k, v) => `<tr><th style="width:34%">${escapeHtml(k)}</th><td>${v}</td></tr>`;
  const li = (arr) => '<ul>' + arr.map((x) => '<li>' + escapeHtml(x) + '</li>').join('') + '</ul>';
  const body = `
    <h2>Core Competencies</h2>${li(c.competencies)}
    <h2>Differentiators</h2>${li(c.differentiators)}
    <h2>Company Data</h2>
    <table><tbody>
      ${kv('Legal name', escapeHtml(c.legalName) + ' (DBA ' + escapeHtml(c.dba) + ')')}
      ${kv('UEI / CAGE', escapeHtml(c.uei) + ' / ' + escapeHtml(c.cage))}
      ${kv('NAICS', c.naics.map((n) => escapeHtml(n.code) + ' ' + escapeHtml(n.title)).join(' · '))}
      ${kv('PSC / FSC', c.psc.map(escapeHtml).join(', '))}
      ${kv('Socio-economic', c.socioEconomic.map(escapeHtml).join(' · '))}
      ${kv('SAM.gov', escapeHtml(c.sam))}
      ${kv('State pipeline', escapeHtml(c.statePipeline))}
      ${kv('Service area', c.serviceArea.map(escapeHtml).join(' · '))}
      ${kv('Bonding', escapeHtml(c.bonding))}
      ${kv('Business type', escapeHtml(c.businessType))}
    </tbody></table>
    <h2>Point of Contact</h2>
    <p><strong>${escapeHtml(c.contact.name)}</strong>, ${escapeHtml(c.contact.role)}<br>
    ${escapeHtml(c.contact.address)}<br>
    ${escapeHtml(c.contact.email)} · ${escapeHtml(c.contact.phone)}</p>`;
  return printPage({ title: 'Capability Statement', docLabel: 'Capability Statement', bodyHtml: body });
}
