// Regression suite for the email-finder's PURE core (pods/gov/enrich.mjs): which addresses we pull out of a
// page and which one we pick. If this regresses, Hector could email a noreply/asset address — or miss the
// real contact — so the outreach loop silently breaks. No network here; just the deterministic extractors.

import { extractEmails, pickBestEmail, domainOf } from '../pods/gov/enrich.mjs';

const has = (arr, e) => arr.includes(e);

export default {
  agent: 'enrich',
  cases: [
    { name: 'pulls a mailto: link out of HTML',
      run: () => { const e = extractEmails('<a href="mailto:info@acme-clean.com">Email us</a>'); return { pass: has(e, 'info@acme-clean.com'), detail: e.join(',') }; } },
    { name: 'pulls a bare address from page text',
      run: () => { const e = extractEmails('Reach our office at office@janipro.com for a quote.'); return { pass: has(e, 'office@janipro.com'), detail: e.join(',') }; } },
    { name: 'drops noreply / asset-filename junk',
      run: () => { const e = extractEmails('mailto:no-reply@x.com plus logo@2x.png and sprite.png?a=hero@2x.jpg'); return { pass: e.length === 0, detail: e.join(',') }; } },
    { name: 'drops form placeholder addresses',
      run: () => { const e = extractEmails('placeholder "email@example.com" and youremail@domain.com'); return { pass: e.length === 0, detail: e.join(',') }; } },
    { name: 'prefers an on-domain address over an off-domain one',
      run: () => { const best = pickBestEmail(['someone@gmail.com', 'info@acmeclean.com'], 'acmeclean.com'); return { pass: best === 'info@acmeclean.com', detail: best }; } },
    { name: 'prefers a role inbox by rank (info > support)',
      run: () => { const best = pickBestEmail(['support@acmeclean.com', 'info@acmeclean.com'], 'acmeclean.com'); return { pass: best === 'info@acmeclean.com', detail: best }; } },
    { name: 'falls back to any valid address when none are on-domain',
      run: () => { const best = pickBestEmail(['owner@gmail.com'], 'acmeclean.com'); return { pass: best === 'owner@gmail.com', detail: best }; } },
    { name: 'returns empty when there is nothing usable',
      run: () => { const best = pickBestEmail(['no-reply@acme.com', 'logo@2x.png'], 'acme.com'); return { pass: best === '', detail: JSON.stringify(best) }; } },
    { name: 'domainOf strips scheme + www',
      run: () => { const d = domainOf('https://www.AcmeClean.com/contact'); return { pass: d === 'acmeclean.com', detail: d }; } },
    { name: 'domainOf handles a bare host with no scheme',
      run: () => { const d = domainOf('janipro.com'); return { pass: d === 'janipro.com', detail: d }; } },
  ],
};
