// Regression suite for the Phase-2a host watchdog (scripts/jarvis-watchdog.mjs). The scary failure mode is
// a bad parse that kills the WRONG process (e.g. treating a non-node PID or a non-listening line as the
// wedged listener). So the PURE decision/parse core is pinned here: which PID owns :8095, whether the
// tunnel still maps the port, when to restart, and the node.exe safety gate. No processes, no network.

import { parseListenerPids, serveHasPort, decideAction, isNodePid } from '../scripts/jarvis-watchdog.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const netstat = [
  '',
  'Active Connections',
  '',
  '  Proto  Local Address          Foreign Address        State           PID',
  '  TCP    0.0.0.0:8095           0.0.0.0:0              LISTENING       12345',
  '  TCP    127.0.0.1:8095         0.0.0.0:0              LISTENING       12345',
  '  TCP    [::]:8095              [::]:0                 LISTENING       12345',
  '  TCP    127.0.0.1:8787         0.0.0.0:0              LISTENING       999',   // control-plane, different port
  '  TCP    127.0.0.1:52210        127.0.0.1:8095        ESTABLISHED     6060',   // a CLIENT of :8095, not the listener
  '  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       4',
].join('\r\n');

const serveUp = 'https://shisui.tailf46d22.ts.net (tailnet only)\n|-- / proxy http://127.0.0.1:8095';
const serveDown = 'No serve config';
const serveOther = 'https://shisui.tailf46d22.ts.net (tailnet only)\n|-- / proxy http://127.0.0.1:3000';

const tasklistNode = '"node.exe","12345","Console","1","210,000 K"';
const tasklistOther = '"chrome.exe","12345","Console","1","210,000 K"';

export default {
  agent: 'host-watchdog',
  cases: [
    { name: 'parseListenerPids finds only the :8095 LISTENER pid (not clients, not other ports)',
      run: () => { const p = parseListenerPids(netstat, 8095); return ok(p.length === 1 && p[0] === '12345', JSON.stringify(p)); } },
    { name: 'parseListenerPids ignores an ESTABLISHED client of :8095',
      run: () => { const p = parseListenerPids(netstat, 8095); return ok(!p.includes('6060'), JSON.stringify(p)); } },
    { name: 'parseListenerPids never returns PID 0 / empty when nothing listens',
      run: () => { const p = parseListenerPids('  TCP  0.0.0.0:9999  0.0.0.0:0  LISTENING  0', 8095); return ok(p.length === 0, JSON.stringify(p)); } },
    { name: 'serveHasPort true when the tunnel maps the port',
      run: () => ok(serveHasPort(serveUp, 8095) === true) },
    { name: 'serveHasPort false when serve config is empty',
      run: () => ok(serveHasPort(serveDown, 8095) === false) },
    { name: 'serveHasPort false when the tunnel maps a DIFFERENT port',
      run: () => ok(serveHasPort(serveOther, 8095) === false) },
    { name: 'decideAction: restart only at/over the fail threshold',
      run: () => ok(decideAction(0, 3) === 'ok' && decideAction(1, 3) === 'watch' && decideAction(3, 3) === 'restart' && decideAction(5, 3) === 'restart') },
    { name: 'isNodePid safety gate: true for node.exe, false for another image on the same PID',
      run: () => ok(isNodePid(tasklistNode, '12345') === true && isNodePid(tasklistOther, '12345') === false) },
  ],
};
