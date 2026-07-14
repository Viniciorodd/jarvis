// Regression suite for the OpenClaw local-HANDS dispatch (pods/openclaw.mjs) + the two new local-layer
// roster seats (pods/org.mjs). NO LIVE DISPATCH — pins only the PURE arg-builder, output-parser, and the
// operator-triggered chat regex (the security-critical piece: an explicit prefix must be required so a
// passing mention of "openclaw" NEVER runs a local command).

import { buildAgentArgs, parseAgentOutput, parseChatTrigger } from '../pods/openclaw.mjs';
import { ROSTER } from '../pods/org.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

export default {
  agent: 'openclaw',
  cases: [
    { name: 'buildAgentArgs → agent "main" + the task + hermes3 model + --json', run: () => {
      const a = buildAgentArgs({ task: 'list the files in Downloads', entrypoint: '/x/openclaw.mjs' });
      const i = a.indexOf('-m');
      return ok(a[0] === '/x/openclaw.mjs' && a[1] === 'agent'
        && a[a.indexOf('--agent') + 1] === 'main'
        && i !== -1 && a[i + 1] === 'list the files in Downloads'
        && a[a.indexOf('--model') + 1] === 'ollama/hermes3:latest'
        && a.includes('--json'), JSON.stringify(a));
    } },
    { name: 'buildAgentArgs: json=false omits --json; custom model/agent honored', run: () => {
      const a = buildAgentArgs({ task: 'hi', agent: 'other', model: 'ollama/gemma4:latest', json: false, entrypoint: '/x' });
      return ok(!a.includes('--json') && a[a.indexOf('--agent') + 1] === 'other'
        && a[a.indexOf('--model') + 1] === 'ollama/gemma4:latest', JSON.stringify(a));
    } },

    { name: 'parseAgentOutput extracts the reply from a JSON payload (.reply / nested .result)', run: () => {
      const a = parseAgentOutput('{"reply":"done — 3 files listed"}');
      const b = parseAgentOutput('some log line\n{"result":{"text":"created report.md"}}\ntrailing');
      return ok(a.ok && a.reply === 'done — 3 files listed'
        && b.ok && /created report\.md/.test(b.reply), JSON.stringify([a, b]));
    } },
    { name: 'parseAgentOutput extracts OpenClaws real payloads[].text shape', run: () => {
      const a = parseAgentOutput('{"payloads":[{"text":"INCORPORATED","mediaUrl":null}],"meta":{"durationMs":65688}}');
      const multi = parseAgentOutput('{"payloads":[{"text":"line one"},{"text":"line two"}]}');
      return ok(a.ok && a.reply === 'INCORPORATED' && multi.ok && /line one/.test(multi.reply) && /line two/.test(multi.reply), JSON.stringify([a, multi]));
    } },
    { name: 'parseAgentOutput falls back to plain text + handles empty', run: () => {
      const a = parseAgentOutput('just a plain line of output');
      const empty = parseAgentOutput('');
      return ok(a.ok && a.reply === 'just a plain line of output'
        && empty.ok === false && /empty/.test(empty.error), JSON.stringify([a, empty]));
    } },
    { name: 'parseAgentOutput surfaces a JSON error field when there is no reply', run: () => {
      const e = parseAgentOutput('{"error":"model not found"}');
      return ok(e.ok === false && /model not found/.test(e.error), JSON.stringify(e));
    } },

    { name: 'chat-trigger MATCHES "openclaw: do X" and "hands - do Y" and captures the task', run: () => {
      const a = parseChatTrigger('openclaw: clean up my Downloads folder');
      const b = parseChatTrigger('hands - summarize report.txt');
      const c = parseChatTrigger('  Hands, run the backup script  ');
      return ok(a.hit && a.task === 'clean up my Downloads folder'
        && b.hit && b.task === 'summarize report.txt'
        && c.hit && c.task === 'run the backup script', JSON.stringify([a, b, c]));
    } },
    { name: 'chat-trigger does NOT fire on a passing mention (security: prefix required)', run: () => {
      const q = parseChatTrigger('what is openclaw?');
      const m = parseChatTrigger('openclaw looks like a cool tool');
      const n = parseChatTrigger('can hands help me with this?');
      const e = parseChatTrigger('openclaw:');
      return ok(!q.hit && !m.hit && !n.hit && !e.hit, JSON.stringify([q, m, n, e]));
    } },

    { name: 'org.mjs exports the two local-layer seats (HERMES brain + OPENCLAW hands)', run: () => {
      const h = ROSTER.find((r) => r.codename === 'HERMES');
      const o = ROSTER.find((r) => r.codename === 'OPENCLAW');
      return ok(h && /Local Brain/i.test(h.title) && h.nickname === 'Hermes'
        && o && /Local Hands/i.test(o.title) && o.nickname === 'OpenClaw'
        && Array.isArray(h.aliases) && Array.isArray(o.aliases), JSON.stringify([h, o]));
    } },
  ],
};
