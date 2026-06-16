import React, { useState } from 'react';
import { useStore } from './useStore.js';
import { TopBar, NeedsYou, Feed, CommandBar } from './Panels.jsx';
import { World } from './World.jsx';

export default function App() {
  const { hq, cp, roster, online, refresh } = useStore();
  const [railOpen, setRailOpen] = useState(true);

  return (
    <div className="jw">
      <TopBar hq={hq} cp={cp} online={online} onToggleRail={() => setRailOpen((o) => !o)} />
      <div className="jw-body">
        <main className="jw-main">
          <World hq={hq} roster={roster} />
          <CommandBar />
        </main>
        <aside className={'jw-rail' + (railOpen ? '' : ' closed')}>
          <NeedsYou approvals={hq?.approvals || []} onDecide={refresh} />
          <Feed feed={hq?.feed || []} />
        </aside>
      </div>
    </div>
  );
}
