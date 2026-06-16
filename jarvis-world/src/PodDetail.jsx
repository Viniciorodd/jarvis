import React, { useEffect, useState, useCallback } from 'react';
import { getPodEvents, decideApproval, sendCommand } from './api.js';

// room.id (HQ short id) -> control-plane pod id (doctrine id used in the event log)
const CP_POD = { cos: 'chief-of-staff', fiv: 'fiverr', gov: 'gov', recon: 'saas', vault: 'vault', trade: 'research-risk', lab: 'content', exec: 'exec', re: 're', legal: 'legal', personal: 'personal', etsy: 'etsy' };

// turn a raw event into a human line for the activity / work-items feed
function eventLine(e) {
  const a = e.action || '';
  if (a === 'rest') return null; // hide idle "rest" pings from the detail view
  const map = {
    'router.classify': '🧭 routed', 'dispatch': '📨 assigned', 'generate': '🎨 producing',
    'order.start': '🎨 new order', 'order.produced': '✅ produced', 'order.failed': '⚠️ failed',
    'scan': '🔭 scanned', 'draft': '📝 drafted', 'sub.outreach.draft': '🤝 sub outreach drafted',
    'progress.report.draft': '📊 progress report', 'ticket.reply.draft': '✉️ reply drafted',
    'milestone.overdue': '⏰ overdue', 'spend.check': '💲 spend check', 'vault.denied': '🔒 access denied',
  };
  return { tag: map[a] || a, text: e.rationale || (e.payload && (e.payload.file || e.payload.summary)) || '', ts: e.ts, err: e.status === 'error' };
}

export default function PodDetail({ room, people, approvals, roster, onClose, onChanged }) {
  const cpPod = CP_POD[room.id] || room.id;
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(null);
  const [text, setText] = useState('');
  const [target, setTarget] = useState('');
  const [toast, setToast] = useState(null);

  const loadEvents = useCallback(() => { getPodEvents(cpPod).then(setEvents).catch(() => {}); }, [cpPod]);
  useEffect(() => { loadEvents(); const t = setInterval(loadEvents, 4000); return () => clearInterval(t); }, [loadEvents]);

  const act = async (id, action) => { setBusy(id); try { await decideApproval(id, action); } catch {} setBusy(null); onChanged && onChanged(); };
  const send = async (e) => {
    e.preventDefault();
    const body = (target ? target + ', ' : '') + text.trim();
    if (!body.trim()) return;
    setText('');
    try { const r = await sendCommand(body); setToast(r?.routing?.reply || 'Sent.'); } catch { setToast('control-plane offline'); }
    setTimeout(() => { setToast(null); loadEvents(); onChanged && onChanged(); }, 1500);
  };
  const requestChanges = (a) => {
    const note = window.prompt(`What changes for "${a.title}"?`);
    if (note) sendCommand(`Revise — ${a.title}: ${note}`).then(() => { setToast('Change request sent.'); setTimeout(() => setToast(null), 2500); }).catch(() => {});
  };

  const work = events.map(eventLine).filter(Boolean).slice(-12).reverse();

  return (
    <div className="sheet-mask" onClick={onClose}>
      <aside className="sheet" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <span className="sheet-icon">{room.icon}</span>
          <div className="sheet-title"><div className="sheet-name">{room.name}</div><div className="sheet-flav">{room.flavor}</div></div>
          <button className="sheet-x" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <section className="sheet-sec">
          <h4>👥 Team <span className="ct">{people.length}</span></h4>
          {people.length === 0 && <p className="muted">No one on shift right now.</p>}
          {people.map(({ name, op }) => {
            const person = roster[name];
            return (
              <button key={name} className={`team-row ${op.state}`} onClick={() => setTarget(person ? person.nickname : name)} title="Tap to send them an instruction">
                <span className={`tdot ${op.state}`} />
                <span className="trole"><b>{person ? person.nickname : name}</b>{person && <em> · {person.title}</em>}</span>
                <span className="ttask">{op.text || op.state}</span>
              </button>
            );
          })}
        </section>

        {approvals.length > 0 && (
          <section className="sheet-sec">
            <h4>⚑ Needs you <span className="ct alert">{approvals.length}</span></h4>
            {approvals.map((a) => (
              <div className="appr-card" key={a.id}>
                <div className="appr-t">{a.title}</div>
                {a.detail && <div className="appr-d">{a.detail}</div>}
                <div className="appr-btns">
                  <button className="b go" disabled={busy === a.id} onClick={() => act(a.id, 'approve')}>{a.verb || 'Approve'}{a.amount ? ` · $${a.amount}` : ''}</button>
                  <button className="b warn" onClick={() => requestChanges(a)}>Request changes</button>
                  <button className="b ghost" disabled={busy === a.id} onClick={() => act(a.id, 'pass')}>Pass</button>
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="sheet-sec">
          <h4>📋 What's happening</h4>
          {work.length === 0 && <p className="muted">Quiet — no recent activity in this department.</p>}
          <ul className="worklist">
            {work.map((w, i) => (
              <li key={i} className={w.err ? 'err' : ''}><span className="wtag">{w.tag}</span>{w.text && <span className="wtext">{w.text}</span>}</li>
            ))}
          </ul>
        </section>

        <form className="sheet-cmd" onSubmit={send}>
          {target && <span className="to-chip" onClick={() => setTarget('')}>to {target} ✕</span>}
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={target ? `Tell ${target} what to do…` : `Give ${room.name} an instruction…`} />
          <button type="submit">➤</button>
          {toast && <div className="cmd-toast">{toast}</div>}
        </form>
      </aside>
    </div>
  );
}
