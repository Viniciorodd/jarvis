import React from 'react';

// HQ room ids are short; the control-plane / CoS pods use full ids. Map operators onto rooms.
const ROOM_ALIASES = {
  exec: ['exec'], cos: ['cos', 'chief-of-staff'], fiv: ['fiv', 'fiverr'], gov: ['gov'],
  recon: ['recon', 'saas', 'recontweaks'], vault: ['vault'], re: ['re'], legal: ['legal'],
  personal: ['personal'], trade: ['trade', 'research-risk'], lab: ['lab', 'content'],
  etsy: ['etsy'], music: ['music'], kids: ['kids'], supp: ['supp'], myst: ['myst'],
};
const aliasFor = (roomId) => ROOM_ALIASES[roomId] || [roomId];

function stateMeta(s) {
  return ({
    work: { cls: 'work', tag: 'working' },
    idle: { cls: 'idle', tag: 'idle' },
    need: { cls: 'need', tag: 'needs you' },
    error: { cls: 'error', tag: 'error' },
  })[s] || { cls: 'idle', tag: s || 'idle' };
}

function initials(name) {
  const parts = String(name).replace(/[^A-Za-z0-9]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((w) => w[0]).join('') || 'AI').toUpperCase();
}

// One NPC = one agent on shift. It bobs while working, shows a live speech bubble of its current task,
// goes coral + pings when it needs you, and shakes red on error. This is "seeing the AI perform work."
// Displays the human nickname (from the roster) with the codename as the subtitle.
function Agent({ name, op, person }) {
  const m = stateMeta(op.state);
  const fresh = op.t && (Date.now() - op.t < 12000); // recently active → extra glow
  const display = person ? person.nickname : name;
  const sub = person ? person.title : '';
  return (
    <div className={`npc ${m.cls}${fresh ? ' fresh' : ''}`} title={`${display}${sub ? ' · ' + sub : ''} (${name}) — ${m.tag}`}>
      <div className="npc-av">
        <span className="npc-face">{initials(display)}</span>
        {op.state === 'work' && <span className="npc-busy"><i /><i /><i /></span>}
        {(op.state === 'need' || op.state === 'error') && <span className="npc-ping" />}
      </div>
      <div className="npc-meta">
        <div className="npc-name">{display}{sub && <span className="npc-role"> · {sub}</span>}</div>
        <div className="npc-code">{name}</div>
        {op.text ? <div className={`npc-say ${m.cls}`}>{op.text}</div> : <div className="npc-tag">{m.tag}</div>}
      </div>
    </div>
  );
}

function Room({ room, agents, earned, roster }) {
  const locked = (room.unlockAt || 0) > (earned || 0);
  const active = agents.some((a) => a.op.state === 'work');
  const needs = agents.some((a) => a.op.state === 'need' || a.op.state === 'error');
  return (
    <section className={`room${locked ? ' locked' : ''}${active ? ' active' : ''}${needs ? ' needs' : ''}`}>
      <header className="room-head">
        <span className="room-icon">{room.icon}</span>
        <span className="room-name">{room.name}</span>
        {!locked && agents.length > 0 && <span className="room-count">{agents.length}</span>}
      </header>
      <div className="room-flavor">{room.flavor}</div>
      <div className="room-floor">
        {locked ? (
          <div className="room-lock">🔒 unlocks at ${Number(room.unlockAt).toLocaleString()}</div>
        ) : agents.length ? (
          agents.map((a) => <Agent key={a.name} name={a.name} op={a.op} person={roster[a.name]} />)
        ) : (
          <div className="room-empty">— no agent on shift —</div>
        )}
      </div>
    </section>
  );
}

export function World({ hq, roster = {} }) {
  if (!hq) return <div className="world-loading"><span className="orb-mini" /> connecting to the floor…</div>;
  const ops = hq.operators || {};
  const byRoom = (room) => {
    const al = aliasFor(room.id);
    return Object.entries(ops)
      .filter(([, op]) => al.includes(op.pod))
      .map(([name, op]) => ({ name, op }))
      .sort((a, b) => (b.op.t || 0) - (a.op.t || 0));
  };
  return (
    <div className="world">
      {(hq.rooms || []).map((room) => (
        <Room key={room.id} room={room} agents={byRoom(room)} earned={hq.earned} roster={roster} />
      ))}
    </div>
  );
}
