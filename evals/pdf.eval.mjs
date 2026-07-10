// Regression suite for the gov PDF/print renderer (pods/gov/pdf.mjs). Pins the pure markdown→HTML
// converter (the body of every proposal PDF) and that the capability statement carries the real facts.

import { mdToHtml, escapeHtml, capabilityDoc, proposalDoc } from '../pods/gov/pdf.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'gov-pdf',
  cases: [
    { name: 'headings render at the right level', run: () =>
      ok(mdToHtml('# Big').includes('<h1>Big</h1>') && mdToHtml('## Mid').includes('<h2>Mid</h2>') && mdToHtml('### Small').includes('<h3>Small</h3>')) },
    { name: 'bold, italic, inline code', run: () => {
      const h = mdToHtml('This is **bold**, this is *italic*, this is `code`.');
      return ok(h.includes('<strong>bold</strong>') && h.includes('<em>italic</em>') && h.includes('<code>code</code>'), h);
    } },
    { name: 'unordered + ordered lists', run: () => {
      const u = mdToHtml('- one\n- two');
      const o = mdToHtml('1. first\n2. second');
      return ok(u.includes('<ul><li>one</li><li>two</li></ul>') && o.includes('<ol><li>first</li><li>second</li></ol>'), u + ' | ' + o);
    } },
    { name: 'tables with header separator', run: () => {
      const h = mdToHtml('| Item | Qty |\n| --- | --- |\n| Mop | 2 |');
      return ok(h.includes('<table>') && h.includes('<th>Item</th>') && h.includes('<td>Mop</td>') && h.includes('<td>2</td>'), h);
    } },
    { name: 'HTML in draft text is escaped (no injection)', run: () => {
      const h = mdToHtml('Beware <script>alert(1)</script> & "quotes".');
      return ok(!h.includes('<script>') && h.includes('&lt;script&gt;') && h.includes('&amp;'), h);
    } },
    { name: 'leading metadata comment is stripped', run: () =>
      ok(!mdToHtml('<!-- Title · url · deadline -->\n\n# Real').includes('Title · url')) },
    { name: 'escapeHtml basics', run: () =>
      ok(escapeHtml('<a>&"') === '&lt;a&gt;&amp;&quot;') },
    { name: 'capability statement carries the real canonical facts', run: () => {
      const doc = capabilityDoc();
      return ok(doc.includes('Z1SWBFEK7EM4') && doc.includes('18S75') && doc.includes('561720')
        && doc.includes('Capability Statement') && /self-certified/i.test(doc) && !/8\(a\)|HUBZone|SDVOSB|WOSB/.test(doc), 'missing a fact or claims a cert we lack');
    } },
    { name: 'proposalDoc wraps markdown in the letterhead shell', run: () => {
      const doc = proposalDoc('# Technical Approach\n\nWe will clean.', { title: 'Test Proposal', noticeId: 'ABC123' });
      return ok(doc.includes('RODGATE') && doc.includes('<h1>Technical Approach</h1>') && doc.includes('Test Proposal') && doc.includes('window.print()'), 'shell missing');
    } },
  ],
};
