// Regression suite for the SAM EXCLUSIONS check (pods/gov/exclusions.mjs) — the Stage-3 debarment gate.
// If parseExclusions regresses, Hector could either (a) MISS an active exclusion and team with a debarred
// sub (disqualification + False Claims risk), or (b) block a clean sub on a terminated/expired record. So
// the deterministic core is pinned here on FIXTURE JSON — no network. The one live-path case forces the
// no-key branch (apiKey:'') so it stays offline and deterministic even though this repo has a real key.

import { parseExclusions, checkSubExclusion, normName, nameMatches } from '../pods/gov/exclusions.mjs';

const ok = (pass, detail = '') => ({ pass, detail });
const future = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
const past = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);

// v4-ish "flat record" fixtures under an excludedParties array; parseExclusions is defensive across shapes.
const activeByUei = { excludedParties: [{ exclusionName: 'BADCO SERVICES LLC', classificationType: 'Firm', exclusionType: 'Ineligible (Proceedings Pending)', ueiSAM: 'ABC123DEF456', activateDate: '2023-01-01', terminationDate: 'Indefinite', recordStatus: 'Active' }] };
const activeByName = { excludationsData: [{ exclusionName: 'ACME CLEAN LLC', classificationType: 'Firm', exclusionType: 'Prohibition/Restriction', activateDate: '2022-06-01', terminationDate: '', recordStatus: 'Active' }] };
const terminated = { excludedParties: [{ exclusionName: 'ACME CLEAN LLC', classificationType: 'Firm', exclusionType: 'Prohibition/Restriction', activateDate: '2018-01-01', terminationDate: past, recordStatus: 'Inactive' }] };
const futureTermination = { excludedParties: [{ exclusionName: 'ACME CLEAN LLC', exclusionType: 'Prohibition/Restriction', terminationDate: future, recordStatus: 'Active' }] };
const empty = { totalRecords: 0, excludedParties: [] };
const otherFirm = { excludedParties: [{ exclusionName: 'TOTALLY DIFFERENT CORP', exclusionType: 'Prohibition/Restriction', terminationDate: 'Indefinite', recordStatus: 'Active' }] };

// Resolve the no-key path once at module load (top-level await; run.mjs awaits the import). apiKey:''
// forces the offline branch — no network — so this is deterministic even though the repo has a real key.
const noKeyResult = await checkSubExclusion({ name: 'Acme Clean LLC' }, { apiKey: '' });

export default {
  agent: 'gov-exclusions',
  cases: [
    { name: 'detects an ACTIVE exclusion by exact UEI',
      run: () => { const r = parseExclusions(activeByUei, { name: 'Different Name Entirely', ueiSAM: 'ABC123DEF456' }); return ok(r.excluded && r.matches.length === 1 && r.matches[0].ueiSAM === 'ABC123DEF456', r.reason); } },

    { name: 'detects by normalized name (case/space/punct-insensitive)',
      run: () => { const r = parseExclusions(activeByName, { name: 'Acme,  Clean   llc.' }); return ok(r.excluded && r.matches.length === 1, r.reason); } },

    { name: 'a strong contains-match on the legal name counts as a hit',
      run: () => { const r = parseExclusions(activeByName, { name: 'Acme Clean' }); return ok(r.excluded, r.reason); } },

    { name: 'IGNORES a terminated/expired (inactive, past-dated) exclusion',
      run: () => { const r = parseExclusions(terminated, { name: 'Acme Clean LLC' }); return ok(!r.excluded && r.matches.length === 0, r.reason); } },

    { name: 'a FUTURE termination date is still active → excluded',
      run: () => { const r = parseExclusions(futureTermination, { name: 'Acme Clean LLC' }); return ok(r.excluded, r.reason); } },

    { name: 'empty results → not excluded',
      run: () => { const r = parseExclusions(empty, { name: 'Acme Clean LLC' }); return ok(!r.excluded && r.matches.length === 0 && !!r.checkedAt, r.reason); } },

    { name: 'a non-matching name → not excluded',
      run: () => { const r = parseExclusions(otherFirm, { name: 'Acme Clean LLC' }); return ok(!r.excluded, r.reason); } },

    { name: 'sub WITH a UEI does not false-match a same-name-only record',
      run: () => { const r = parseExclusions(activeByName, { name: 'Acme Clean LLC', ueiSAM: 'ZZZ999NOMATCH' }); return ok(!r.excluded, r.reason); } },

    { name: 'checkSubExclusion with no key → unverified, not a silent clear (offline)',
      run: () => ok(noKeyResult.unverified === true && noKeyResult.excluded === false && /not verified/i.test(noKeyResult.reason) && !!noKeyResult.checkedAt, noKeyResult.reason) },

    { name: 'normName / nameMatches behave (unit)',
      run: () => ok(normName('Acme, Clean LLC') === 'acme clean llc' && nameMatches('Acme Clean', 'ACME CLEAN LLC') === true && nameMatches('Zzz', 'Acme') === false, '') },
  ],
};
