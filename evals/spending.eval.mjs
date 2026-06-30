// Evals for the agency-spending feed's PURE shaping (pods/gov/spending.mjs). The fetch is live network,
// but the FY window, bubble scaling, and ranking are deterministic — lock them.

import { lastCompleteFY, bubbleR, topStates } from '../pods/gov/spending.mjs';

export default {
  agent: 'gov-spending',
  cases: [
    { name: 'lastCompleteFY: a June date → the FY that ended last Sep 30',
      run: () => { const fy = lastCompleteFY(new Date('2026-06-29')); return { pass: fy.start === '2024-10-01' && fy.end === '2025-09-30' && fy.label === 'FY2025', detail: `${fy.start}..${fy.end} ${fy.label}` }; } },

    { name: 'lastCompleteFY: an October date → the FY that just ended that Sep 30',
      run: () => { const fy = lastCompleteFY(new Date('2026-11-05')); return { pass: fy.start === '2025-10-01' && fy.end === '2026-09-30' && fy.label === 'FY2026', detail: `${fy.start}..${fy.end} ${fy.label}` }; } },

    { name: 'bubbleR is 0 for no spend, maxR at the max (area-proportional)',
      run: () => { const z = bubbleR(0, 100); const top = bubbleR(100, 100, 4, 26); const mid = bubbleR(25, 100, 4, 26); return { pass: z === 0 && top === 26 && mid === 15, detail: `0→${z}, 25→${mid}, 100→${top}` }; } },

    { name: 'bubbleR is monotonic (more $ → bigger bubble)',
      run: () => ({ pass: bubbleR(50, 100) < bubbleR(90, 100), detail: `${bubbleR(50, 100)} < ${bubbleR(90, 100)}` }) },

    { name: 'topStates sorts desc, drops zeros, slices N',
      run: () => { const t = topStates([{ state: 'A', amount: 10 }, { state: 'B', amount: 0 }, { state: 'C', amount: 50 }, { state: 'D', amount: 30 }], 2); return { pass: t.length === 2 && t[0].state === 'C' && t[1].state === 'D', detail: t.map((s) => s.state).join('>') }; } },
  ],
};
