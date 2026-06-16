// Regression suite for the Connector's deterministic core (pods/gov/connector.mjs).
// Pins trade inference + subcontractor matching — the routing that decides who gets an outreach draft.

import { inferTrade, findSubs, rateSubs } from '../pods/gov/connector.mjs';

const rated = [
  { id: 'HI', name: 'Top Crew', trade: 'janitorial', location: 'Wilkes-Barre, PA', capabilities: ['custodial', 'floor care'], past_performance: 90, quote: '$4k/mo' },
  { id: 'LO', name: 'Far Crew', trade: 'janitorial', location: 'Philadelphia, PA', capabilities: ['restroom'], past_performance: 30 },
];

const subs = [
  { id: 'A', name: 'NEPA Cleaning', trade: 'janitorial', location: 'Wilkes-Barre, PA' },
  { id: 'B', name: 'Scranton Janitorial', trade: 'janitorial', location: 'Scranton, PA' },
  { id: 'C', name: 'Keystone Grounds', trade: 'grounds', location: 'Scranton, PA' },
  { id: 'X', name: '[Example] Placeholder', trade: 'janitorial', location: 'Wilkes-Barre, PA' },
];

export default {
  agent: 'connector',
  cases: [
    { name: 'NAICS 561720 → janitorial', run: () => { const t = inferTrade({ naics: '561720' }); return { pass: t === 'janitorial', detail: t }; } },
    { name: 'NAICS 561730 → grounds', run: () => { const t = inferTrade({ naics: '561730' }); return { pass: t === 'grounds', detail: t }; } },
    { name: 'title "HVAC repair" → hvac', run: () => { const t = inferTrade({ title: 'HVAC repair and PM' }); return { pass: t === 'hvac', detail: t }; } },
    { name: 'unknown scope → facilities (safe default)', run: () => { const t = inferTrade({ title: 'misc support' }); return { pass: t === 'facilities', detail: t }; } },
    { name: 'findSubs filters to the right trade', run: () => { const r = findSubs(subs, { trade: 'grounds', location: 'Scranton, PA' }); return { pass: r.length === 1 && r[0].id === 'C', detail: r.map((s) => s.id).join(',') }; } },
    { name: 'findSubs excludes [Example] template entries', run: () => { const r = findSubs(subs, { trade: 'janitorial', location: 'Wilkes-Barre, PA' }); return { pass: !r.some((s) => s.id === 'X'), detail: r.map((s) => s.id).join(',') }; } },
    { name: 'findSubs ranks the same-city sub first', run: () => { const r = findSubs(subs, { trade: 'janitorial', location: 'Wilkes-Barre, PA' }); return { pass: r[0] && r[0].id === 'A', detail: r.map((s) => s.id + ':' + s.score).join(',') }; } },
    { name: 'rateSubs ranks proximity + past-perf + capability highest', run: () => { const r = rateSubs(rated, { trade: 'janitorial', location: 'Wilkes-Barre, PA', sow: 'custodial floor care, federal building' }); return { pass: r[0].id === 'HI' && r[0].score > r[1].score, detail: r.map((s) => s.id + ':' + s.score).join(',') }; } },
    { name: 'rateSubs explains its score (reasons incl. past-perf)', run: () => { const r = rateSubs(rated, { trade: 'janitorial', location: 'Wilkes-Barre, PA', sow: 'custodial' }); return { pass: r[0].reasons.some((x) => x.includes('past-perf')), detail: r[0].reasons.join(', ') }; } },
  ],
};
