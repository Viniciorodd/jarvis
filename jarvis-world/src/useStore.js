import { useEffect, useState, useCallback } from 'react';
import { getHqState, getCpState, getRoster } from './api.js';

// Polls the two backends on a heartbeat. HQ (the floor: operators/rooms/feed/approvals/xp) is the
// primary source; the control-plane (KPIs + roster) is best-effort and never blocks the view.
export function useStore() {
  const [hq, setHq] = useState(null);
  const [cp, setCp] = useState(null);
  const [roster, setRoster] = useState({}); // codename -> { nickname, title, ... }
  const [online, setOnline] = useState(false);

  const tick = useCallback(async () => {
    try { setHq(await getHqState()); setOnline(true); }
    catch { setOnline(false); }
  }, []);
  const tickCp = useCallback(async () => {
    try { setCp(await getCpState()); } catch { /* KPIs optional */ }
  }, []);

  useEffect(() => {
    tick(); tickCp();
    getRoster().then((r) => {
      const map = {};
      for (const p of r.roster || []) map[p.codename] = p;
      setRoster(map);
    }).catch(() => { /* roster optional; fall back to codenames */ });
    const a = setInterval(tick, 3000);
    const b = setInterval(tickCp, 7000);
    const onVis = () => { if (!document.hidden) { tick(); tickCp(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(a); clearInterval(b); document.removeEventListener('visibilitychange', onVis); };
  }, [tick, tickCp]);

  return { hq, cp, roster, online, refresh: tick };
}
