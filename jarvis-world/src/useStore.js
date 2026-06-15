import { useEffect, useState, useCallback } from 'react';
import { getHqState, getCpState } from './api.js';

// Polls the two backends on a heartbeat. HQ (the floor: operators/rooms/feed/approvals/xp) is the
// primary source; the control-plane (KPIs) is best-effort and never blocks the view.
export function useStore() {
  const [hq, setHq] = useState(null);
  const [cp, setCp] = useState(null);
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
    const a = setInterval(tick, 3000);
    const b = setInterval(tickCp, 7000);
    const onVis = () => { if (!document.hidden) { tick(); tickCp(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(a); clearInterval(b); document.removeEventListener('visibilitychange', onVis); };
  }, [tick, tickCp]);

  return { hq, cp, online, refresh: tick };
}
