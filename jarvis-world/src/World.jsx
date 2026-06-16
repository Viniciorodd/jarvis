import React from 'react';

// HQ room ids are short; operators use the full pod id. Map operators onto the right building.
const ROOM_ALIASES = {
  exec: ['exec'], cos: ['cos', 'chief-of-staff'], fiv: ['fiv', 'fiverr'], gov: ['gov'],
  recon: ['recon', 'saas', 'recontweaks'], vault: ['vault'], re: ['re'], legal: ['legal'],
  personal: ['personal'], trade: ['trade', 'research-risk'], lab: ['lab', 'content'],
  etsy: ['etsy'], music: ['music'], kids: ['kids'], supp: ['supp'], myst: ['myst'],
};
const aliasFor = (id) => ROOM_ALIASES[id] || [id];

function initials(name) {
  const p = String(name).replace(/[^A-Za-z0-9]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return (p.slice(0, 2).map((w) => w[0]).join('') || 'AI').toUpperCase();
}

// shared so App (detail panel) and World (badges) agree on who/what is in a building
export function peopleInRoom(hq, room) {
  const ops = hq.operators || {};
  const al = aliasFor(room.id);
  return Object.entries(ops).filter(([, op]) => al.includes(op.pod)).map(([name, op]) => ({ name, op })).sort((a, b) => (b.op.t || 0) - (a.op.t || 0));
}
export function approvalsInRoom(hq, room) {
  return (hq.approvals || []).filter((a) => a.pod === room.name);
}

function Building({ room, people, approvals, roster, earned, onSelect }) {
  const locked = (room.unlockAt || 0) > (earned || 0);
  const working = people.filter((p) => p.op.state === 'work').length;
  const needs = approvals.length + people.filter((p) => p.op.state === 'need' || p.op.state === 'error').length;
  return (
    <button className={`bldg${locked ? ' locked' : ''}${working ? ' active' : ''}${needs ? ' needs' : ''}`}
      onClick={() => !locked && onSelect(room)} disabled={locked}>
      {needs > 0 && <span className="bldg-alert">{needs}</span>}
      <div className="bldg-roof"><span className="bldg-icon">{room.icon}</span><span className="bldg-name">{room.name}</span></div>
      <div className="bldg-body">
        {locked ? (
          <div className="bldg-lock">🔒 unlocks at ${Number(room.unlockAt).toLocaleString()}</div>
        ) : people.length ? (
          <div className="bldg-crew">
            {people.slice(0, 6).map(({ name, op }) => {
              const p = roster[name];
              return <span key={name} className={`mini ${op.state}`} title={(p ? p.nickname : name) + ' — ' + (op.text || op.state)}>{initials(p ? p.nickname : name)}</span>;
            })}
            {people.length > 6 && <span className="mini more">+{people.length - 6}</span>}
          </div>
        ) : (
          <div className="bldg-empty">— idle —</div>
        )}
        {!locked && <div className="bldg-foot">{working ? `${working} working` : 'idle'}{approvals.length ? ` · ${approvals.length} need you` : ''} ›</div>}
      </div>
    </button>
  );
}

export function World({ hq, roster = {}, onSelect }) {
  if (!hq) return <div className="world-loading"><span className="orb-mini" /> connecting to the floor…</div>;
  return (
    <div className="world">
      {(hq.rooms || []).map((room) => (
        <Building key={room.id} room={room} people={peopleInRoom(hq, room)} approvals={approvalsInRoom(hq, room)} roster={roster} earned={hq.earned} onSelect={onSelect} />
      ))}
    </div>
  );
}
