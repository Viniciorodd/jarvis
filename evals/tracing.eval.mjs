// Regression suite for the Langfuse tracing mirror (control-plane/tracing.mjs).
// Pins the PURE event→Langfuse mapping (toLangfuseItem) and that tracing is a no-op until configured.

import { toLangfuseItem, tracingEnabled } from '../control-plane/tracing.mjs';

export default {
  agent: 'tracing',
  cases: [
    { name: 'maps a Jarvis event to a valid Langfuse trace-create item',
      run: () => {
        const it = toLangfuseItem({ id: 'e1', ts: '2026-06-30T00:00:00.000Z', kind: 'action', pod: 'gov', action: 'proposal.draft', actor: 'GOV-ANALYST', rationale: 'drafted West Point', status: 'done', cost_usd: 0.02, reversible: true, payload: { noticeId: 'X' } });
        return { pass: it.type === 'trace-create' && it.body.name === 'gov.proposal.draft' && it.body.userId === 'GOV-ANALYST' && it.body.metadata.cost_usd === 0.02 && it.body.timestamp === '2026-06-30T00:00:00.000Z', detail: it.body.name };
      } },
    { name: 'tags an irreversible event as irreversible',
      run: () => { const it = toLangfuseItem({ pod: 'gov', action: 'submit', reversible: false }); return { pass: it.body.tags.includes('irreversible'), detail: it.body.tags.join(',') }; } },
    { name: 'tracing is disabled (no-op) when LANGFUSE_* is unset',
      run: () => {
        const saved = [process.env.LANGFUSE_HOST, process.env.LANGFUSE_PUBLIC_KEY, process.env.LANGFUSE_SECRET_KEY];
        delete process.env.LANGFUSE_HOST; delete process.env.LANGFUSE_PUBLIC_KEY; delete process.env.LANGFUSE_SECRET_KEY;
        const off = tracingEnabled();
        if (saved[0]) process.env.LANGFUSE_HOST = saved[0]; if (saved[1]) process.env.LANGFUSE_PUBLIC_KEY = saved[1]; if (saved[2]) process.env.LANGFUSE_SECRET_KEY = saved[2];
        return { pass: off === false, detail: '' };
      } },
  ],
};
