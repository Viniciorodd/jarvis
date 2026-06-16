// Regression suite for the Connector's deterministic core (pods/gov/connector.mjs).
// Pins trade inference + subcontractor matching — the routing that decides who gets an outreach draft.

import { inferTrade, findSubs } from '../pods/gov/connector.mjs';

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
    { name: 'findSubs ranks the same-city sub first', run: () => { const r = findSubs(subs, { trade: 'janitorial', location: 'Wilkes-Barre, PA' }); return { pass: r[0] && r[0].id === 'A', detail: r.map((s) => s.id + ':' + s._score).join(',') }; } },
  ],
};
