import React, { useState } from 'react';
import { useStore } from './useStore.js';
import { TopBar, NeedsYou, Feed, CommandBar } from './Panels.jsx';
import { World, peopleInRoom, approvalsInRoom } from './World.jsx';
import PodDetail from './PodDetail.jsx';

export default function App() {
  const { hq, cp, roster, online, refresh } = useStore();
  const [railOpen, setRailOpen] = useState(false);
  const [selected, setSelected] = useState(null); // the building you tapped into

  // keep the open panel's data fresh as the store polls
  const room = selected && hq ? (hq.rooms || []).find((r) => r.id === selected.id) || selected : selected;
  const people = room && hq ? peopleInRoom(hq, room) : [];
  const approvals = room && hq ? approvalsInRoom(hq, room) : [];

  return (
    <div className="jw">
      <TopBar hq={hq} cp={cp} online={online} onToggleRail={() => setRailOpen((o) => !o)} />
      <div className="jw-body">
        <main className="jw-main">
          <World hq={hq} roster={roster} onSelect={setSelected} />
          <CommandBar />
        </main>
        <aside className={'jw-rail' + (railOpen ? '' : ' closed')}>
          <NeedsYou approvals={hq?.approvals || []} onDecide={refresh} />
          <Feed feed={hq?.feed || []} />
        </aside>
      </div>
      {room && (
        <PodDetail room={room} people={people} approvals={approvals} roster={roster}
          onClose={() => setSelected(null)} onChanged={refresh} />
      )}
    </div>
  );
}
