// Generates a professional creative-services profile/portfolio PDF for Fiverr.
// Honest by design: skills, tools, process, deliverables — no fabricated clients or reviews.
// Run from the fiverr-assets dir (where pdfkit is installed):
//   cd fiverr-assets && node ../scripts/make-fiverr-profile.mjs
import PDFDocument from 'pdfkit';
import fs from 'node:fs';

// ── EDIT THESE ──────────────────────────────────────────────────────────────
const BRAND = 'Rodgate Creative';
const TAGLINE = 'Design, Content & Image Services';
const NAME = 'Vinicio Rodriguez';
const EMAIL = 'rodgategroup@gmail.com';
const PORTFOLIO_NOTE = 'Live samples available on request and in my Fiverr gig gallery.';
const OUT = 'C:\\Users\\vinic\\Desktop\\jarvis\\fiverr-assets\\Rodgate-Creative-Profile.pdf';
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#1B2450', GOLD = '#B8860B', DIM = '#555B7A', LINE = '#C9CEE2';

const services = [
  ['YouTube Thumbnails',
   'Scroll-stopping, high-CTR thumbnails built for the algorithm and the click.',
   ['2–3 concept directions per order', 'Bold focal subject, readable text, brand-consistent color',
    'A/B variants on request', '1080p PNG + source file', 'Sized for YouTube (1280×720) and Shorts'],
   'Photoshop, generative tooling, type & color systems'],
  ['Book & eBook Covers',
   'Genre-accurate covers that look at home on Amazon and the shelf.',
   ['Front cover (eBook) or full wrap (print: front, spine, back)', 'Genre-matched typography & mood',
    'KDP / IngramSpark-ready specs & bleed', 'Print-ready PDF + JPG/PNG', 'Up to 2 revision rounds'],
   'Photoshop, InDesign, licensed/AI imagery with usage rights'],
  ['SEO Blog Articles',
   'Search-optimized, genuinely readable articles that rank and convert.',
   ['Keyword & search-intent research', 'Structured H2/H3 outline + meta title & description',
    'Original, fact-checked copy in your brand voice', 'Internal-link suggestions',
    'Delivered in Google Doc / Markdown / HTML'],
   'Keyword research tools, SEO best practices, human editing pass'],
  ['Landing Pages & HTML',
   'Clean, fast, mobile-first pages built to convert visitors into action.',
   ['Single responsive landing page (HTML/CSS)', 'Conversion-focused layout & clear CTA',
    'Mobile + desktop tested', 'Lightweight, fast-loading code', 'Easy-to-edit handoff files'],
   'HTML5, CSS, responsive frameworks, basic JS'],
  ['Photo Cleanup & Editing',
   'Professional retouching and product-photo edits with fast turnaround.',
   ['Background removal / replacement', 'Blemish, object & distraction removal',
    'Color, exposure & white-balance correction', 'Product-photo cleanup for e-commerce',
    'High-res export, web or print'],
   'Photoshop, Lightroom, AI-assisted retouching'],
];

const work = [
  'Brief check first — I confirm scope before starting so the first draft lands right.',
  '2–3 options on visual gigs; one strong draft on writing gigs.',
  'Every deliverable reviewed before it reaches you — no raw, unchecked output.',
  'Clear revision rounds included; extras quoted up front, never sprung on you.',
  'You own full rights to the final delivered work.',
];

const doc = new PDFDocument({ size: 'LETTER', margins: { top: 54, bottom: 54, left: 60, right: 60 } });
doc.pipe(fs.createWriteStream(OUT));
const W = doc.page.width - 120;
const rule = (color, t = 0.8, gap = 8) => {
  doc.moveDown(0.3);
  doc.strokeColor(color).lineWidth(t).moveTo(60, doc.y).lineTo(60 + W, doc.y).stroke();
  doc.moveDown(gap / 18);
};

doc.font('Helvetica-Bold').fontSize(26).fillColor(INK).text(BRAND, { align: 'center' });
doc.font('Helvetica').fontSize(12).fillColor(GOLD).text(TAGLINE, { align: 'center' });
doc.fontSize(9.5).fillColor(DIM).text(`${NAME}   ·   ${EMAIL}`, { align: 'center' });
rule(GOLD, 1.4, 12);

doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(
  'I help creators and small businesses ship polished visual and written assets — fast, on-brief, '
  + 'and revision-friendly. Every order includes a short brief check, original work delivered in '
  + 'ready-to-use formats, and clear communication from kickoff to handoff. Below is what I offer '
  + 'and how I work.', { lineGap: 2 });
doc.moveDown(0.6);

const bullet = (txt) => {
  const y = doc.y;
  doc.circle(66, y + 5, 1.6).fill(GOLD);
  doc.fillColor(INK).font('Helvetica').fontSize(9.7).text(txt, 74, y, { width: W - 14, lineGap: 1.5 });
};

for (const [title, sub, bullets, tools] of services) {
  if (doc.y > doc.page.height - 150) doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13.5).fillColor(INK).text(title);
  doc.font('Helvetica-Oblique').fontSize(10).fillColor(DIM).text(sub, { lineGap: 1 });
  doc.moveDown(0.2);
  for (const b of bullets) bullet(b);
  doc.moveDown(0.15);
  doc.font('Helvetica').fontSize(8.8).fillColor(GOLD).text(`Tools & method: ${tools}`);
  rule(LINE, 0.6, 6);
}

if (doc.y > doc.page.height - 200) doc.addPage();
doc.moveDown(0.3);
doc.font('Helvetica-Bold').fontSize(13.5).fillColor(INK).text('How I work');
doc.moveDown(0.2);
for (const w of work) bullet(w);
rule(GOLD, 1.0, 8);
doc.font('Helvetica').fontSize(9).fillColor(DIM).text(`${PORTFOLIO_NOTE}   |   Contact: ${EMAIL}`,
  { align: 'center' });

doc.end();
console.log('Wrote', OUT);
