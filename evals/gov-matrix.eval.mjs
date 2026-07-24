// Regression suite for the COMPLIANCE MATRIX (pods/gov/matrix.mjs) — the requirements traceability matrix.
// A gov bid that misses a single "shall/must" requirement is non-responsive → disqualified. This pins the
// PURE core: only obligation statements are extracted (non-requirements ignored), dedupe/cap/normalize hold,
// categories bucket correctly, coverage is deterministic keyword-overlap, and — the doctrine line — a GAP
// carries an EMPTY citation (coverage is NEVER fabricated). No network: everything runs on fixture strings.

import { extractRequirements, mapCoverage, buildMatrix, renderMatrixMarkdown, categorize, groundRows, detectForms, mergeRequirements } from '../pods/gov/matrix.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const SOW = [
  'This solicitation is for janitorial services at Building 3.',                        // NOT a requirement
  'The Contractor shall provide daily janitorial services including trash removal and restroom sanitation.',
  'The contractor must maintain commercial general liability insurance of at least $1,000,000.',
  'At a minimum, the contractor shall staff one on-site supervisor per shift.',
  'The Contractor shall provide daily janitorial services including trash removal and restroom sanitation.', // dup
  'General cleaning is nice to have.',                                                  // NOT a requirement
].join('\n');

const DRAFT_2OF3 = [
  'Rodgate provides daily janitorial services covering trash removal and restroom sanitation across the facility.',
  'A dedicated on-site supervisor is assigned to staff every shift and manages the crew.',
  // (deliberately says NOTHING about insurance / liability / coverage — that requirement is a GAP)
].join('\n');

export default {
  agent: 'gov-matrix',
  cases: [
    { name: 'extractRequirements pulls the "shall provide" + "must maintain insurance" reqs', run: () => {
      const r = extractRequirements(SOW);
      const has = (s) => r.some((x) => x.text.includes(s));
      return ok(has('shall provide daily janitorial') && has('must maintain commercial general liability'), `${r.length} reqs`);
    } },
    { name: 'IGNORES the non-requirement sentences (no "shall/must")', run: () => {
      const r = extractRequirements(SOW);
      const bad = r.some((x) => /is for janitorial services at Building 3|nice to have/i.test(x.text));
      return ok(!bad, bad ? 'leaked a non-requirement' : 'clean');
    } },
    { name: 'DEDUPES the duplicated requirement', run: () => {
      const r = extractRequirements(SOW);
      const n = r.filter((x) => /shall provide daily janitorial/i.test(x.text)).length;
      return ok(n === 1, `appeared ${n}×`);
    } },
    { name: 'stable ids R1..Rn + drops junk-length + caps at 60', run: () => {
      const idsOk = extractRequirements(SOW).every((x, i) => x.id === `R${i + 1}`);
      const tiny = extractRequirements('shall x');                 // < 15 chars → dropped
      const flood = extractRequirements(Array.from({ length: 200 }, (_, i) => `Requirement ${i}: the contractor shall provide deliverable number ${i} on schedule.`).join('\n'));
      return ok(idsOk && tiny.length === 0 && flood.length === 60, `tiny=${tiny.length} flood=${flood.length}`);
    } },
    { name: 'category buckets: insurance→insurance/bonding, staffing→staffing/labor', run: () => {
      const ins = categorize('the contractor must maintain commercial general liability insurance');
      const staff = categorize('the contractor shall staff one on-site supervisor per shift');
      const gen = categorize('the contractor shall comply with all applicable requirements');
      return ok(ins === 'insurance/bonding' && staff === 'staffing/labor' && gen === 'general', `${ins} / ${staff} / ${gen}`);
    } },
    { name: 'mapCoverage → addressed when the draft contains the key terms', run: () => {
      const c = mapCoverage('The Contractor shall provide daily janitorial services including trash removal and restroom sanitation.', DRAFT_2OF3);
      return ok(c.status === 'addressed' && c.citation.length > 0, `${c.status} · cite="${c.citation.slice(0, 40)}"`);
    } },
    { name: 'mapCoverage → GAP when the draft contains NONE of the terms — and citation is EMPTY (no fabrication)', run: () => {
      const c = mapCoverage('The contractor must maintain commercial general liability insurance of at least one million dollars.', DRAFT_2OF3);
      return ok(c.status === 'gap' && c.citation === '' && c.matchedTerms.length === 0, `status=${c.status} citation=${JSON.stringify(c.citation)}`);
    } },
    { name: 'buildMatrix summary math + deterministic coveragePct', run: () => {
      const m = buildMatrix({ sowText: SOW, draft: DRAFT_2OF3, meta: { noticeId: 'TEST-1' } });
      // 3 unique reqs: janitorial (addressed), insurance (gap), supervisor (addressed) → 2 addressed, 1 gap
      const s = m.summary;
      const pctOk = s.coveragePct === Math.round(((s.addressed + 0.5 * s.partial) / s.total) * 100);
      return ok(s.total === 3 && s.addressed === 2 && s.gap === 1 && s.partial === 0 && pctOk && s.coveragePct === 67, JSON.stringify(s));
    } },
    { name: 'coveragePct is 100 when there are no requirements (empty SOW)', run: () => {
      const m = buildMatrix({ sowText: 'Just a friendly overview, nothing binding here.', draft: '' });
      return ok(m.summary.total === 0 && m.summary.coveragePct === 100, JSON.stringify(m.summary));
    } },
    { name: 'renderMatrixMarkdown has the table header + a GAPS section when a gap exists', run: () => {
      const m = buildMatrix({ sowText: SOW, draft: DRAFT_2OF3, meta: { noticeId: 'TEST-1', title: 'Janitorial — Bldg 3' } });
      const md = renderMatrixMarkdown(m);
      const hasHeader = md.includes('| # | Requirement | Category | Status | Where addressed (citation) |');
      const hasGaps = /##\s*⛔\s*GAPS/.test(md);
      const gapRowNoCite = /\| R\d+ \| .*insurance.* \| insurance\/bonding \| ⛔ gap \| — \|/.test(md);
      return ok(hasHeader && hasGaps && gapRowNoCite, `header=${hasHeader} gaps=${hasGaps} gapRowNoCite=${gapRowNoCite}`);
    } },
    { name: 'groundRows KEEPS a row whose quote is verbatim in the source', run: () => {
      const src = 'Offerors shall submit a technical volume not to exceed 10 pages.';
      const rows = groundRows([{ section: 'L', text: 'Technical volume max 10 pages', quote: 'shall submit a technical volume not to exceed 10 pages' }], src);
      return ok(rows.length === 1 && rows[0].section === 'L', JSON.stringify(rows));
    } },
    { name: 'groundRows DROPS a hallucinated row (quote not in source)', run: () => {
      const src = 'Offerors shall submit a technical volume not to exceed 10 pages.';
      const rows = groundRows([{ section: 'M', text: 'Past performance weighted 40%', quote: 'past performance is weighted at forty percent of the total score' }], src);
      return ok(rows.length === 0, JSON.stringify(rows));
    } },
    { name: 'groundRows rejects too-short quotes and invalid sections', run: () => {
      const src = 'The contractor shall maintain insurance at all times during performance.';
      const rows = groundRows([
        { section: 'L', text: 'x', quote: 'shall' },                               // < 20 chars
        { section: 'Z', text: 'bad section', quote: 'shall maintain insurance at all times' },
      ], src);
      return ok(rows.length === 0, JSON.stringify(rows));
    } },
    { name: 'detectForms finds SF1449, reps&certs, and an SCLS/SCA wage determination', run: () => {
      const t = 'Complete SF 1449 and submit. Offerors must have an active SAM registration and current representations and certifications. Comply with the attached Service Contract Labor Standards wage determination.';
      const codes = detectForms(t).map((r) => r.formCode);
      return ok(codes.includes('SF1449') && codes.includes('reps-certs') && codes.includes('wage-det'), JSON.stringify(codes));
    } },
    { name: 'detectForms returns none on clean prose (no false forms)', run: () =>
      ok(detectForms('We provide excellent janitorial services with trained staff.').length === 0) },
    { name: 'mergeRequirements dedupes, prefers specific section over general, caps, ids R1..Rn', run: () => {
      const regex = [{ id: 'R1', text: 'The contractor shall provide daily service', category: 'general' }]; // regex → default C
      const ai = [{ section: 'L', text: 'The contractor shall provide daily service', category: 'general' }, // dup of regex, but Section L
                  { section: 'M', text: 'Award is best value tradeoff', category: 'general' }];
      const forms = [{ section: 'form', category: 'required-form', formCode: 'SF1449', text: 'Submit a completed SF1449.' }];
      const rows = mergeRequirements(regex.map((r) => ({ ...r, section: 'C' })), ai, forms);
      const daily = rows.filter((r) => /daily service/i.test(r.text));
      return ok(daily.length === 1 && daily[0].section === 'L' && rows.some((r) => r.section === 'form') && rows.every((r, i) => r.id === `R${i + 1}`), JSON.stringify(rows.map((r) => [r.id, r.section])));
    } },
    { name: 'mergeRequirements caps at 80', run: () => {
      const many = Array.from({ length: 200 }, (_, i) => ({ section: 'C', text: `The contractor shall deliver item number ${i} on schedule`, category: 'general' }));
      return ok(mergeRequirements([], many, []).length === 80);
    } },
  ],
};
