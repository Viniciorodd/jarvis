import React, { useState } from 'react';
import { decideApproval, sendCommand } from './api.js';

const money = (n) => '$' + Number(n || 0).toLocaleString();
const level = (xp) => Math.floor(Math.sqrt((xp || 0) / 50)) + 1;

function Stat({ k, v, teal }) {
  return (
    <div className="jw-stat">
      <div className="jw-stat-k">{k}</div>
      <div className={'jw-stat-v' + (teal ? ' teal' : '')}>{v}</div>
    </div>
  );
}

export function TopBar({ hq, cp, online, onToggleRail }) {
  const k = (cp && cp.kpis && cp.kpis.system) || {};
  return (
    <header className="jw-top">
      <div className="jw-brand px">JARVIS<span> WORLD</span></div>
      <span className={`jw-dot ${online ? 'on' : 'off'}`} title={online ? 'live' : 'offline — HQ unreachable'} />
      <div className="jw-stats">
        <Stat k="banked" v={money(hq?.earned)} teal />
        <Stat k="level" v={'LV ' + level(hq?.xp)} />
        <Stat k="xp" v={(hq?.xp || 0).toLocaleString()} />
        {k.autonomy_ratio != null && <Stat k="autonomy" v={Math.round(k.autonomy_ratio * 100) + '%'} />}
        {k.human_edit_rate != null && <Stat k="edit rate" v={Math.round(k.human_edit_rate * 100) + '%'} />}
      </div>
      <button className="jw-railbtn" onClick={onToggleRail} title="Toggle the side rail">☰</button>
    </header>
  );
}

export function NeedsYou({ approvals, onDecide }) {
  const [busy, setBusy] = useState(null);
  const act = async (id, action) => {
    setBusy(id);
    try { await decideApproval(id, action); } catch { /* ignore; refresh shows truth */ }
    setBusy(null);
    if (onDecide) onDecide();
  };
  return (
    <div className="rail-sec">
      <div className="rail-h">⚑ Needs you <span className="rail-n">{approvals.length}</span></div>
      {approvals.length === 0 && <div className="rail-empty">nothing waiting on you</div>}
      {approvals.map((a) => (
        <div className="appr" key={a.id}>
          {a.pod && <div className="appr-pod">{a.pod}</div>}
          <div className="appr-ttl">{a.title}</div>
          {a.detail && <div className="appr-det">{a.detail}</div>}
          <div className="appr-acts">
            <button className="btn go" disabled={busy === a.id} onClick={() => act(a.id, 'approve')}>
              {(a.verb || 'Approve')}{a.amount ? ` · ${money(a.amount)}` : ''}
            </button>
            <button className="btn ghost" disabled={busy === a.id} onClick={() => act(a.id, 'pass')}>Pass</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Feed({ feed }) {
  return (
    <div className="rail-sec">
      <div className="rail-h">⟁ Activity</div>
      <ul className="feed">
        {(!feed || feed.length === 0) && <li className="rail-empty">quiet</li>}
        {(feed || []).map((f, i) => (
          <li key={i} className={f.kind === 'money' ? 'money' : ''}>{f.s || f.text || ''}</li>
        ))}
      </ul>
    </div>
  );
}

// Type an instruction → it routes through the control-plane's Chief-of-Staff router. The reply tells
// you which pod got it and whether it was gated. The agent then shows up working in its room.
export function CommandBar() {
  const [text, setText] = useState('');
  const [toast, setToast] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    try { const r = await sendCommand(t); setToast(r?.routing?.reply || 'Routed.'); }
    catch { setToast('control-plane offline — command not routed'); }
    setTimeout(() => setToast(null), 7000);
  };
  return (
    <form className="cmd" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Tell Jarvis to do something… (routes through the Chief of Staff)" />
      <button type="submit" title="Send to the Chief of Staff">➤</button>
      {toast && <div className="cmd-toast">{toast}</div>}
    </form>
  );
}
