// Gov-pod layer over the shared pod client (pods/lib.mjs): adds the entity profile + a gov-defaulted
// mirror, so the worker and connector both speak as the Gov pod.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, env, emit, hqApproval, claude, mirror as genericMirror } from '../lib.mjs';

export { ROOT, env, emit, hqApproval, claude };
export const DRAFTS = path.join(ROOT, 'gov-drafts');
export const mirror = (agent, state, text) => genericMirror(agent, state, text, 'gov');

export function profile() {
  try { return fs.readFileSync(path.join(ROOT, 'prompts', 'gov', 'entity-profile.md'), 'utf8'); }
  catch { return 'Rodgate, LLC — SDB/Minority/Hispanic-owned small business. NAICS 561210/561720/561990 (janitorial, facilities). PA/NJ/FL. Prime that subcontracts labor; respects 50% limit-on-subcontracting. Vinicio signs & submits everything.'; }
}
