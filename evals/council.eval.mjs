// Evals for the LLM council's PURE orchestration logic (pods/council.mjs). The opinions/synthesis are
// LLM calls, but seat selection + anonymization + the chairman prompt are deterministic code — these
// lock that so the council degrades correctly when brains are unavailable and judges on merit (blind).

import { pickCouncil, anonymize, chairmanPrompt, SEATS } from '../pods/council.mjs';

export default {
  agent: 'council',
  cases: [
    { name: 'full panel when all brains are available',
      run: () => { const s = pickCouncil({ local: true, openrouter: true, claude: true }); return { pass: s.length === SEATS.length, detail: s.map((x) => x.name).join(', ') }; } },

    { name: 'drops seats whose provider is unavailable (no tokens / no key)',
      run: () => { const s = pickCouncil({ local: true, openrouter: false, claude: false }); return { pass: s.length === 1 && s[0].provider === 'local', detail: s.map((x) => x.name).join(', ') }; } },

    { name: 'still seats the free local brain when cloud is down (never empty if local is up)',
      run: () => { const s = pickCouncil({ local: true, openrouter: false, claude: false }); return { pass: s.some((x) => x.provider === 'local'), detail: s.length + ' seat(s)' }; } },

    { name: 'anonymize labels opinions A, B, C (blind review)',
      run: () => { const a = anonymize([{ answer: 'x' }, { answer: 'y' }, { answer: 'z' }]); return { pass: a[0].label === 'A' && a[1].label === 'B' && a[2].label === 'C' && a[2].text === 'z', detail: a.map((o) => o.label).join('') }; } },

    { name: 'chairman prompt embeds the question + every member, asks for a recommendation + confidence',
      run: () => {
        const p = chairmanPrompt('Bid solo or team?', [{ answer: 'go solo' }, { answer: 'team up' }]);
        return { pass: p.includes('Bid solo or team?') && p.includes('go solo') && p.includes('team up') && /Recommendation/i.test(p) && /Confidence/i.test(p), detail: p.length + ' chars' };
      } },

    { name: 'chairman prompt anonymizes members (no brand names leak in)',
      run: () => { const p = chairmanPrompt('Q', [{ answer: 'a' }, { answer: 'b' }]); return { pass: p.includes('Member A') && p.includes('Member B') && !/Claude|OpenRouter|Local/.test(p), detail: 'blind' }; } },
  ],
};
