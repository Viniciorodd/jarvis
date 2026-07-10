// Regression suite for the teaming radar (pods/gov/teaming.mjs) — Rodgate as the sub reaching up to primes.
// Pins the target classifier (threshold, self-exclusion, geography) and the intro-letter facts.

import { classifyTeamingTarget, introLetter, TEAMING_NAICS } from '../pods/gov/teaming.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'gov-teaming',
  cases: [
    { name: 'a large in-lane award near home is a strong target', run: () => {
      const c = classifyTeamingTarget({ recipient: 'BigFacilities Inc', amount: 6_000_000, naics: '561210', state: 'PA' });
      return ok(c.ok && c.score >= 5 && /over the \$750k/.test(c.why) && /service area/.test(c.why), JSON.stringify(c));
    } },
    { name: 'below the $750k sub-plan threshold → rejected', run: () =>
      ok(!classifyTeamingTarget({ recipient: 'Small Co', amount: 200000, naics: '561210', state: 'PA' }).ok) },
    { name: 'never target ourselves', run: () =>
      ok(!classifyTeamingTarget({ recipient: 'Rodgate, LLC', amount: 9_000_000, naics: '561720', state: 'PA' }).ok) },
    { name: 'a far-away award still qualifies but scores lower than a local one', run: () => {
      const near = classifyTeamingTarget({ recipient: 'A', amount: 3_000_000, naics: '561720', state: 'NJ' });
      const far = classifyTeamingTarget({ recipient: 'B', amount: 3_000_000, naics: '561720', state: 'CA' });
      return ok(near.ok && far.ok && near.score > far.score, JSON.stringify({ near: near.score, far: far.score }));
    } },
    { name: 'handles USASpending field names too', run: () => {
      const c = classifyTeamingTarget({ 'Recipient Name': 'Prime LLC', 'Award Amount': 1_500_000, 'naics_code': '561730', 'Place of Performance State Code': 'FL' });
      return ok(c.ok && c.recipient === 'Prime LLC' && c.state === 'FL', JSON.stringify(c));
    } },
    { name: 'intro letter carries our real identity + never claims a cert we lack', run: () => {
      const t = introLetter({ recipient: 'MegaCorp', amount: 4_000_000 }, { agency: 'GSA' });
      return ok(t.includes('Rodgate, LLC') && t.includes('Z1SWBFEK7EM4') && t.includes('MegaCorp') && /\$4\.0M/.test(t) && !/8\(a\)|HUBZone|SDVOSB|WOSB/.test(t), t.slice(0, 120));
    } },
    { name: 'teaming NAICS cover facilities + janitorial + grounds', run: () =>
      ok(TEAMING_NAICS.includes('561210') && TEAMING_NAICS.includes('561720') && TEAMING_NAICS.includes('561730')) },
  ],
};
