// All calls go to same-origin paths (/hq, /cp) that the dev server (vite proxy) and prod (nginx)
// forward to the HQ and control-plane services — so the PWA never hits CORS, on any device.
const HQ = import.meta.env.VITE_HQ_BASE || '/hq';
const CP = import.meta.env.VITE_CP_BASE || '/cp';

async function jget(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r.json();
}

export const getHqState = () => jget(`${HQ}/api/state`);
export const getCpState = () => jget(`${CP}/state`);

export async function decideApproval(id, action) {
  const r = await fetch(`${HQ}/api/approval/${id}/${action}`, { method: 'POST' });
  if (!r.ok) throw new Error('approval ' + r.status);
  return r.json();
}

export async function sendCommand(text) {
  const r = await fetch(`${CP}/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, source: 'jarvis-world' }),
  });
  if (!r.ok) throw new Error('command ' + r.status);
  return r.json();
}
