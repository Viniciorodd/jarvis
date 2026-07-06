// Regression suite for gate idempotency (pods/lib.mjs gateKey). The gov worker re-drafts + re-gates the
// same notice on every rescan; without dedup that stacked 27 open gates for 4 opps. gateKey is the
// identity two gates share; gateApproval reuses an OPEN gate with the same key instead of nagging again.

import { gateKey } from '../pods/lib.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'gate-dedup',
  cases: [
    { name: 'same pod+action+noticeId → identical key', run: () => {
      const a = gateKey({ pod: 'gov', action: 'submit', payload: { noticeId: 'ABC' } });
      const b = gateKey({ pod: 'gov', action: 'SUBMIT', payload: { noticeId: 'ABC', file: 'x.md' } });
      return ok(a === b && a === 'gov:submit:ABC', a + ' vs ' + b);
    } },
    { name: 'different notice / action / pod → different keys', run: () => {
      const base = gateKey({ pod: 'gov', action: 'submit', payload: { noticeId: 'ABC' } });
      return ok(base !== gateKey({ pod: 'gov', action: 'submit', payload: { noticeId: 'XYZ' } })
        && base !== gateKey({ pod: 'gov', action: 'send', payload: { noticeId: 'ABC' } })
        && base !== gateKey({ pod: 'fiverr', action: 'submit', payload: { noticeId: 'ABC' } }));
    } },
    { name: 'falls back to file when there is no noticeId', run: () =>
      ok(gateKey({ pod: 'gov', action: 'send', payload: { file: 'gov-drafts/a.md' } }) === 'gov:send:gov-drafts/a.md') },
    { name: 'no stable identity → empty key (never dedups, always a fresh gate)', run: () =>
      ok(gateKey({ pod: 'gov', action: 'submit', payload: {} }) === '' && gateKey({ pod: 'exec', action: 'spend' }) === '' && gateKey(null) === '') },
    { name: 'dedup match: a rescan of the same notice finds the existing OPEN gate', run: () => {
      const pending = [
        { pod: 'gov', action: 'submit', payload: { noticeId: 'A', file: 'a.md' } },
        { pod: 'gov', action: 'submit', payload: { noticeId: 'B', file: 'b.md' } },
      ];
      const incoming = { pod: 'gov', action: 'submit', payload: { noticeId: 'A', file: 'a.md' } };
      const dup = pending.find((p) => gateKey(p) === gateKey(incoming));
      const noDup = { pod: 'gov', action: 'submit', payload: { noticeId: 'C' } };
      return ok(!!dup && dup.payload.noticeId === 'A' && !pending.find((p) => gateKey(p) === gateKey(noDup)));
    } },
  ],
};
