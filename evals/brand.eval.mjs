// Regression suite for the personal-brand guards (pods/brand/).
//
// Two things are being pinned here.
//
// The COMPLIANCE guard, because the $0-income filings are live and a published claim is a
// discoverable document. Every case below is a sentence that must never reach a queue.
//
// The FEATURES harness, and specifically the one place it deliberately disagrees with the source
// material it was modelled on: scoring on buyer composition rather than reach.

import { complianceCheck, complianceCheckRedos, complianceLine } from '../pods/brand/compliance.mjs';
import { extract, voiceDrift, withJudgement, withOutcome, score, summarise, HOOK_TYPES } from '../pods/brand/features.mjs';
import { checkPost, assertRoute, weeklyCost, jitter, PLATFORMS, START_WITH } from '../pods/brand/platforms.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const blocked = (t) => complianceCheck(t).ok === false;

export default {
  agent: 'brand',
  cases: [
    // ── income and asset claims ────────────────────────────────────────
    { name: 'BLOCKS a first-person income claim', run: () =>
      ok(blocked('Last month I made $14,000 from rentals.'), complianceLine(complianceCheck('Last month I made $14,000 from rentals.'))) },

    { name: 'BLOCKS a door count', run: () =>
      ok(blocked('I own 14 doors across two markets.')) },

    { name: 'BLOCKS "my portfolio" framing', run: () =>
      ok(blocked('My portfolio throws off enough to cover the mortgage.')) },

    { name: 'BLOCKS the transformation figure, the banned hook form', run: () =>
      ok(blocked('How I went from $0 to $40,000 a month in 18 months.')) },

    { name: 'BLOCKS a revenue milestone', run: () =>
      ok(blocked('We hit $100k this year and here is what I learned.')) },

    // ── the critical negative: deal arithmetic must still pass ─────────
    { name: 'ALLOWS deal arithmetic, which is most of what he writes', run: () => {
      const t = 'The listing said $2,650 in taxes. Reassessed on transfer it came to $4,100. That is $120 a month.';
      const r = complianceCheck(t);
      return ok(r.ok === true, complianceLine(r));
    } },

    { name: 'ALLOWS a teaching post with numbers and no self-reference', run: () => {
      const t = 'Run it at 80% occupancy.\nRun it with a repair you did not plan for.\nIf it still works, now you have something.';
      return ok(complianceCheck(t).ok === true);
    } },

    { name: 'ALLOWS the honest zero, which is the whole build-in-public position', run: () => {
      const t = 'Three hours a day on REDOS.\nNo customers. Nothing to show off yet.';
      const r = complianceCheck(t);
      return ok(r.ok === true, complianceLine(r));
    } },

    // ── traction and audience ──────────────────────────────────────────
    { name: 'BLOCKS publishing a follower count', run: () =>
      ok(blocked('Just crossed 10,000 followers.')) },

    { name: 'BLOCKS an impression count', run: () =>
      ok(blocked('That post did 25,000 impressions.')) },

    { name: 'BLOCKS a customer count', run: () =>
      ok(blocked('Now used by 500 investors.')) },

    // ── privacy ────────────────────────────────────────────────────────
    { name: 'BLOCKS a real street address', run: () =>
      ok(blocked('Walked 4417 Maple Grove Avenue this morning.')) },

    { name: 'ALLOWS the fictional Springfield IL set', run: () => {
      const r = complianceCheck('Example: 742 Evergreen Terrace, Springfield, IL 62704.');
      return ok(r.ok === true, complianceLine(r));
    } },

    { name: 'BLOCKS an identifiable tenant reference', run: () =>
      ok(blocked('My tenant called me at 11pm again.')) },

    // ── warnings, which inform rather than stop ────────────────────────
    { name: 'WARNS on guru vocabulary without blocking', run: () => {
      const r = complianceCheck('Time to 10x the hustle and build an empire.');
      return ok(r.ok === true && r.warnings.length > 0, complianceLine(r));
    } },

    { name: 'REDOS variant escalates emoji to a block; the personal one does not', run: () => {
      const t = 'Six calculators, free, no account \u{1F600}';
      return ok(complianceCheck(t).ok === true && complianceCheckRedos(t).ok === false);
    } },

    { name: 'FAIL CLOSED: empty input returns a result, never a throw', run: () => {
      const r = complianceCheck();
      return ok(r && typeof r.ok === 'boolean');
    } },

    // ── features: the measured voice, computed not eyeballed ───────────
    { name: 'FEATURES: an em dash is counted, because it is the loudest AI tell in his corpus', run: () => {
      const f = extract('The listing is marketing — the county record is the deal.');
      return ok(f.em_dashes === 1 && voiceDrift(f).some((d) => /em dash/.test(d)));
    } },

    { name: 'FEATURES: a lowercase opener is flagged, since 99% of his posts capitalise', run: () => {
      const f = extract("the taxes on the listing are the seller's taxes");
      return ok(f.starts_capital === false && voiceDrift(f).some((d) => /capital/.test(d)));
    } },

    { name: 'FEATURES: a post inside the measured voice shows zero drift', run: () => {
      const f = extract('Section 8 rent does not arrive on the first.\n\nIt arrives on the second.\n\nYour mortgage drafts on the first.');
      return ok(voiceDrift(f).length === 0, JSON.stringify(voiceDrift(f)));
    } },

    { name: 'FEATURES: single-line and stacked posts classify differently', run: () => {
      return ok(extract('Boring excellence beats flash.').format === 'single-line'
        && extract('A.\n\nB.\n\nC.').format === 'short-stack');
    } },

    // ── taxonomy discipline ────────────────────────────────────────────
    { name: 'TAXONOMY: an off-taxonomy label is rejected, not stored', run: () => {
      const r = withJudgement(extract('X.'), { hook_type: 'vibes' });
      return ok(r.ok === false && /taxonomy/.test(r.errors[0]));
    } },

    { name: 'TAXONOMY: the transformation hook type is banned outright', run: () => {
      const r = withJudgement(extract('X.'), { hook_type: 'transformation' });
      return ok(r.ok === false && /banned/.test(r.errors.join(' ')), JSON.stringify(r.errors));
    } },

    { name: 'TAXONOMY: a valid label passes through', run: () => {
      const r = withJudgement(extract('Section 8 pays on the second.'), { hook_type: 'pain', pillar: 'deal' });
      return ok(r.ok === true && r.row.hook_type === 'pain');
    } },

    // ── the disagreement with the source: buyers over reach ────────────
    { name: 'SCORE: refuses to score when audience composition is unknown', run: () => {
      const row = withOutcome(withJudgement(extract('X.'), {}).row, { impressions: 90000 });
      return ok(score(row) === null, 'a 90k-impression post with no composition scores null, on purpose');
    } },

    { name: 'SCORE: a low-reach post with buyers beats a high-reach post without', run: () => {
      const base = withJudgement(extract('X.'), {}).row;
      const small = withOutcome(base, { impressions: 800, audience: { buyer: 9, peer: 1 } });
      const viral = withOutcome(base, { impressions: 90000, audience: { buyer: 1, peer: 60, competitor: 39 } });
      return ok(score(small) > score(viral), `${score(small)} vs ${score(viral)}`);
    } },

    { name: 'SCORE: reach breaks ties only', run: () => {
      const base = withJudgement(extract('X.'), {}).row;
      const a = withOutcome(base, { impressions: 5000, audience: { buyer: 4, peer: 4 } });
      const b = withOutcome(base, { impressions: 500, audience: { buyer: 4, peer: 4 } });
      return ok(score(a) > score(b) && Math.abs(score(a) - score(b)) < 1);
    } },

    { name: 'SUMMARISE: ranks by buyers per post and reports what it could not score', run: () => {
      const mk = (ht, buyer, imp) => withOutcome(withJudgement(extract('X.'), { hook_type: ht }).row,
        { impressions: imp, audience: { buyer, peer: 10 - buyer } });
      const rows = [mk('pain', 8, 1000), mk('pain', 6, 1200), mk('contrarian', 1, 40000),
        withOutcome(withJudgement(extract('X.'), { hook_type: 'anatomy' }).row, { impressions: 900 })];
      const s = summarise(rows, 'hook_type');
      return ok(s.ranked[0].key === 'pain' && s.unscored === 1, JSON.stringify(s));
    } },


    // ── publishing safety: the rules that keep accounts alive ──────────
    { name: 'ROUTE: a browser route to LinkedIn is refused outright, not warned about', run: () => {
      try { assertRoute('linkedin', 'browser'); return ok(false, 'it allowed a browser route'); }
      catch (e) { return ok(/official API/.test(e.message), e.message.slice(0, 90)); }
    } },

    { name: 'ROUTE: the official API route passes', run: () => ok(assertRoute('linkedin', 'api') === true) },

    { name: 'ROUTE: an unknown platform throws rather than defaulting', run: () => {
      try { assertRoute('myspace'); return ok(false); } catch (e) { return ok(/unknown platform/.test(e.message)); }
    } },

    { name: 'X: a link is stripped from the body and moved to a reply, because it is a 13x billing decision', run: () => {
      const r = checkPost('x', 'Ran the numbers on a duplex. https://redoshq.com/quick');
      return ok(r.ok && !/https?:/.test(r.transformed) && r.replyLink === 'https://redoshq.com/quick', JSON.stringify(r));
    } },

    { name: 'LinkedIn: a link is kept but flagged for the reach cost', run: () => {
      const r = checkPost('linkedin', 'Six calculators, free. https://redoshq.com/quick');
      return ok(r.ok && /https?:/.test(r.transformed) && r.notes.some((n) => /reach/.test(n)), JSON.stringify(r.notes));
    } },

    { name: 'CADENCE: over the safe daily count blocks, well under the hard cap', run: () => {
      const r = checkPost('threads', 'A short post.', { sentToday: 2 });
      return ok(r.ok === false && /safe cadence/.test(r.reasons[0]), JSON.stringify(r.reasons));
    } },

    { name: 'CADENCE: LinkedIn also honours a weekly ceiling', run: () => {
      const r = checkPost('linkedin', 'A post.', { sentThisWeek: 4 });
      return ok(r.ok === false && /this week/.test(r.reasons.join(' ')));
    } },

    { name: 'LENGTH: a post over the platform limit is blocked', run: () => {
      const r = checkPost('bluesky', 'x'.repeat(301));
      return ok(r.ok === false && /over the 300/.test(r.reasons.join(' ')));
    } },

    { name: 'DEFERRED: Instagram is refused until the core platforms are stable', run: () => {
      return ok(checkPost('instagram', 'A post.').ok === false);
    } },

    { name: 'COST: X is priced, everything else in the core set is free', run: () => {
      const c = weeklyCost({ linkedin: 4, threads: 10, bluesky: 10, mastodon: 10, x: 14 });
      return ok(c.total === 0.21 && PLATFORMS.linkedin.free && PLATFORMS.x.free === false, JSON.stringify(c));
    } },

    { name: 'START_WITH is the free, no-approval pair', run: () => {
      return ok(START_WITH.every((k) => PLATFORMS[k].free && PLATFORMS[k].approvalRequired === false));
    } },

    { name: 'JITTER: platforms are staggered and the plan replays identically', run: () => {
      const a = jitter(9, 0), b = jitter(9, 1), again = jitter(9, 1);
      const mins = (t) => t.hour * 60 + t.minute;
      return ok(mins(a) !== mins(b) && mins(b) === mins(again), `${JSON.stringify(a)} ${JSON.stringify(b)}`);
    } },

    { name: 'no platform in the matrix is marked browser-automation safe', run: () => {
      return ok(Object.values(PLATFORMS).every((p) => p.browserAutomationSafe === false));
    } },

    { name: 'the taxonomy is fixed, so months stay comparable', run: () =>
      ok(HOOK_TYPES.length === 7 && HOOK_TYPES.includes('flat-fact')) },
  ],
};
