// Regression suite for the credential broker's ACL (control-plane/vault.mjs).
// This is doctrine #3 in code — if it regresses, an agent could read a secret it must never touch
// (e.g. the thumbnail agent reaching a finance/bank key). The most security-relevant eval in the repo.

import { isAllowed } from '../control-plane/vault.mjs';

export default {
  agent: 'vault',
  cases: [
    { name: 'Fiverr creative (STUDIO-01) may read the image key', run: () => ({ pass: isAllowed('STUDIO-01', 'FAL_KEY') === true, detail: '' }) },
    { name: 'Bid analyst may NOT read the image key (least privilege)', run: () => ({ pass: isAllowed('GOV-ANALYST', 'FAL_KEY') === false, detail: '' }) },
    { name: 'CFO (LEDGER-01) may read the Stripe key', run: () => ({ pass: isAllowed('LEDGER-01', 'STRIPE_API_KEY') === true, detail: '' }) },
    { name: 'Bid analyst may NOT read the Stripe key (only the CFO touches money)', run: () => ({ pass: isAllowed('GOV-ANALYST', 'STRIPE_API_KEY') === false && isAllowed('STUDIO-01', 'STRIPE_API_KEY') === false, detail: '' }) },
    { name: 'Gov scout may read the SAM key', run: () => ({ pass: isAllowed('SAM-SCOUT', 'SAM_API_KEY') === true, detail: '' }) },
    { name: 'Bid analyst may NOT read the SAM key', run: () => ({ pass: isAllowed('GOV-ANALYST', 'SAM_API_KEY') === false, detail: '' }) },
    { name: 'every reasoning agent may read the Anthropic key', run: () => ({ pass: isAllowed('GOV-ANALYST', 'ANTHROPIC_API_KEY') && isAllowed('RECON-DEV', 'ANTHROPIC_API_KEY'), detail: '' }) },
    { name: 'the scheduler gets NO secrets', run: () => ({ pass: isAllowed('scheduler', 'ANTHROPIC_API_KEY') === false, detail: '' }) },
    { name: 'an unknown agent is denied everything', run: () => ({ pass: isAllowed('GHOST-99', 'ANTHROPIC_API_KEY') === false, detail: '' }) },
    { name: 'wildcard entries match by prefix', run: () => { const acl = { X: ['CLOUDFLARE_*'] }; return { pass: isAllowed('X', 'CLOUDFLARE_API_TOKEN', acl) === true && isAllowed('X', 'OPENAI_API_KEY', acl) === false, detail: '' }; } },
  ],
};
