import { useState, useEffect, useRef } from "react";
import {
  Mail, Palette, Landmark, Shirt, Clapperboard, Music, Baby,
  LineChart, Crown, Lock, Check, X, Zap, Flame
} from "lucide-react";

// ───────────────────────────────────────────────────────────────
// JARVIS HQ — demo build (simulated data)
// Live version: n8n status webhooks → events table on your NAS →
// this view, served in Docker, reached over Tailscale as a PWA.
// ───────────────────────────────────────────────────────────────

const RANKS = [
  { at: 0, name: "Garage" },
  { at: 1000, name: "Workshop" },
  { at: 5000, name: "Office" },
  { at: 10000, name: "Studio" },
  { at: 50000, name: "Penthouse" },
  { at: 100000, name: "Tower" },
  { at: 1000000, name: "Empire" },
];

const START_ROOMS = [
  {
    id: "cos", name: "Chief of Staff", icon: Mail, unlockAt: 0, open: true,
    ops: [
      { n: "MAILROOM-01", state: "work", lines: ["Triaging 14 new emails", "3 reply drafts queued for you", "2 urgent threads flagged"] },
      { n: "EOD-BOT", state: "idle", lines: ["Next report · 6:00 PM", "Compiling pod logs at 5:45"] },
    ],
  },
  {
    id: "fiv", name: "Fiverr Studio", icon: Palette, unlockAt: 0, open: true,
    ops: [
      { n: "PIXEL-02", state: "work", lines: ["Rendering thumbnail v2 · #1047", "Exporting blog graphics · #1051", "Generating options A / B / C"] },
      { n: "QC-DESK", state: "need", lines: ["2 deliveries await your review"] },
    ],
  },
  {
    id: "gov", name: "Gov War Room", icon: Landmark, unlockAt: 0, open: true,
    ops: [
      { n: "SAM-SCOUT", state: "work", lines: ["Scanned 212 notices → 4 leads", "Polling SAM.gov · NAICS 561720", "Sources-sought · grounds maint."] },
      { n: "BID-ANALYST", state: "work", lines: ["Bid memo · janitorial · $48k", "Scoring competition signals", "Pulling sub history · USAspending"] },
    ],
  },
  { id: "etsy", name: "Etsy & POD Workshop", icon: Shirt, unlockAt: 1000, open: false, flavor: "Trend scout · original designs" },
  { id: "lab", name: "Content Lab", icon: Clapperboard, unlockAt: 5000, open: false, flavor: "Blog · affiliate · short-form" },
  { id: "music", name: "Music Studio", icon: Music, unlockAt: 10000, open: false, flavor: "Beats · lofi · licensing" },
  { id: "kids", name: "Kids Animation Bay", icon: Baby, unlockAt: 10000, open: false, flavor: "One show · human-reviewed" },
  { id: "trade", name: "Trading Watchtower", icon: LineChart, unlockAt: 50000, open: false, flavor: "Monitor-only. Always." },
  { id: "myst", name: "???", icon: Crown, unlockAt: 1000000, open: false, flavor: "Empire rank" },
];

const START_APPROVALS = [
  { id: 1, pod: "Fiverr Studio", title: "Deliver thumbnail v2", detail: "Order #1047 · @BG_Media", amount: 35, xp: 25, verb: "Approve & deliver" },
  { id: 2, pod: "Fiverr Studio", title: "Deliver 3 blog graphics", detail: "Order #1051 · @k.marketing", amount: 48, xp: 30, verb: "Approve & deliver" },
  { id: 3, pod: "Gov War Room", title: "Send RFQ to 3 electrical subs", detail: "Janitorial $48k · Harrisburg area", amount: 0, xp: 40, verb: "Approve & send" },
];

const QUESTS = [
  { q: "Ship 5 Fiverr orders", done: 3, of: 5 },
  { q: "Collect 3 sub quotes", done: 1, of: 3 },
  { q: "Answer 1 sources-sought", done: 0, of: 1 },
];

const FEED_POOL = [
  "SAM-SCOUT · 4 new set-asides matched (561720)",
  "MAILROOM-01 · reply drafted → landlord thread",
  "PIXEL-02 · thumbnail option C rendered",
  "BID-ANALYST · sub shortlist: 6 electrical firms (PA)",
  "WHISPER · voice memo filed → Notion / Lessons",
  "QC-DESK · revision request parsed · #1042",
  "SAM-SCOUT · sources-sought: grounds maint., Carlisle",
  "EOD-BOT · 41 tasks logged today",
];

const fmt = (n) => "$" + n.toLocaleString("en-US");
const now = () => new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

export default function JarvisHQ() {
  const [earned, setEarned] = useState(952);
  const [shownEarned, setShownEarned] = useState(952);
  const [xp, setXp] = useState(265);
  const [rooms, setRooms] = useState(START_ROOMS);
  const [approvals, setApprovals] = useState(START_APPROVALS);
  const [feed, setFeed] = useState([
    { t: now(), s: "HQ online · 3 pods active · 6 operators on the floor" },
  ]);
  const [toasts, setToasts] = useState([]);
  const [rankUp, setRankUp] = useState(null);
  const [tick, setTick] = useState(0);
  const poolIdx = useRef(0);

  const rank = [...RANKS].reverse().find((r) => earned >= r.at);
  const next = RANKS.find((r) => r.at > earned);
  const level = Math.floor(xp / 100) + 1;
  const xpPct = xp % 100;

  // animate the bankroll counter toward its target
  useEffect(() => {
    if (shownEarned === earned) return;
    const step = Math.max(1, Math.ceil(Math.abs(earned - shownEarned) / 14));
    const id = setInterval(() => {
      setShownEarned((v) => {
        const nv = v < earned ? Math.min(earned, v + step) : Math.max(earned, v - step);
        if (nv === earned) clearInterval(id);
        return nv;
      });
    }, 40);
    return () => clearInterval(id);
  }, [earned]);

  // ambient simulation: feed lines + operator activity rotation
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      poolIdx.current = (poolIdx.current + 1) % FEED_POOL.length;
      setFeed((f) => [{ t: now(), s: FEED_POOL[poolIdx.current] }, ...f].slice(0, 9));
    }, 4800);
    return () => clearInterval(id);
  }, []);

  const pushToast = (txt) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, txt }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 1900);
  };

  const logEvent = (s) => setFeed((f) => [{ t: now(), s }, ...f].slice(0, 9));

  const approve = (a) => {
    setApprovals((list) => list.filter((x) => x.id !== a.id));
    setXp((v) => v + a.xp);
    pushToast(`${a.amount ? "+" + fmt(a.amount) + " · " : ""}+${a.xp} XP`);
    logEvent(`✓ ${a.title} — ${a.amount ? fmt(a.amount) + " banked" : "executed"}`);

    if (a.amount) {
      const newTotal = earned + a.amount;
      setEarned(newTotal);
      const crossed = RANKS.find((r) => earned < r.at && newTotal >= r.at);
      if (crossed) {
        setRooms((rs) =>
          rs.map((r) =>
            r.unlockAt === crossed.at && !r.open
              ? { ...r, open: true, ops: [{ n: "TREND-SCOUT", state: "work", lines: ["Booting… scanning niches", "First trend report in ~2h"] }] }
              : r
          )
        );
        setTimeout(() => setRankUp(crossed), 700);
      }
    }
    // clear the QC desk once Fiverr deliveries are handled
    setApprovals((list) => {
      const fiverrLeft = list.some((x) => x.pod === "Fiverr Studio");
      if (!fiverrLeft) {
        setRooms((rs) =>
          rs.map((r) =>
            r.id === "fiv"
              ? { ...r, ops: r.ops.map((o) => (o.n === "QC-DESK" ? { ...o, state: "idle", lines: ["Queue clear · standing by"] } : o)) }
              : r
          )
        );
      }
      return list;
    });
  };

  const pass = (a) => {
    setApprovals((list) => list.filter((x) => x.id !== a.id));
    logEvent(`— Passed: ${a.title}`);
  };

  return (
    <div className="hq min-h-screen w-full">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=Space+Grotesk:wght@400;500;700&display=swap');
        .hq{
          --ink:#0B1024; --panel:#151D3D; --panel2:#1B2450; --line:#2B3768;
          --gold:#F5B83D; --mint:#5BE3B7; --alert:#FF8A5C; --cream:#F2EFE4; --dim:#8A93BE;
          background:
            radial-gradient(1100px 500px at 80% -10%, #1A2450 0%, transparent 60%),
            var(--ink);
          color:var(--cream);
          font-family:'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
        }
        .px{ font-family:'Silkscreen', monospace; letter-spacing:.02em; }
        .mono{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .panel{ background:var(--panel); border:1px solid var(--line); }
        .panel2{ background:var(--panel2); border:1px solid var(--line); }
        .gold{ color:var(--gold); } .mint{ color:var(--mint); }
        .dim{ color:var(--dim); } .alertc{ color:var(--alert); }
        .goldbg{ background:var(--gold); color:#221a05; }
        .ghost{ border:1px solid var(--line); color:var(--dim); }
        .ghost:hover{ color:var(--cream); border-color:var(--dim); }
        .barbg{ background:#0E1530; border:1px solid var(--line); }
        .goldfill{ background:linear-gradient(90deg,#C98F1E,var(--gold)); }
        .led{ width:8px; height:8px; border-radius:99px; flex:none; }
        .led-work{ background:var(--mint); animation:ledPulse 1.6s ease-in-out infinite; }
        .led-idle{ background:#3A4577; }
        .led-need{ background:var(--alert); }
        .ring-need{ position:absolute; inset:-4px; border-radius:99px; border:2px solid var(--alert); opacity:.7; animation:needPing 1.4s ease-out infinite; }
        .dotty span{ display:inline-block; width:3px; height:3px; margin-left:3px; border-radius:99px; background:var(--mint); animation:ledPulse 1.2s ease-in-out infinite; }
        .dotty span:nth-child(2){ animation-delay:.2s } .dotty span:nth-child(3){ animation-delay:.4s }
        .toast{ animation:floatUp 1.9s ease-out forwards; }
        .overlayIn{ animation:riseIn .35s ease-out; }
        .star{ position:absolute; color:var(--gold); animation:twinkle 1.6s ease-in-out infinite; }
        .noscroll::-webkit-scrollbar{ display:none } .noscroll{ scrollbar-width:none }
        .roomlocked{ border-style:dashed; opacity:.55; }
        @keyframes ledPulse{ 0%,100%{opacity:.35} 50%{opacity:1} }
        @keyframes needPing{ 0%{transform:scale(.6);opacity:.8} 100%{transform:scale(1.5);opacity:0} }
        @keyframes floatUp{ 0%{transform:translateY(8px);opacity:0} 15%{opacity:1} 80%{opacity:1} 100%{transform:translateY(-26px);opacity:0} }
        @keyframes riseIn{ from{transform:translateY(14px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes twinkle{ 0%,100%{opacity:.15; transform:scale(.8)} 50%{opacity:1; transform:scale(1.15)} }
        @media (prefers-reduced-motion: reduce){
          .hq *{ animation:none !important; transition:none !important; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto px-4 pt-5 pb-10">

        {/* ── HUD ───────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="px text-base sm:text-lg gold leading-none">JARVIS HQ</div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="px text-xs panel2 rounded px-2 py-1">{rank.name.toUpperCase()}</span>
              <span className="dim text-xs flex items-center gap-1"><Flame size={12} className="alertc" /> EOD streak · 4</span>
            </div>
          </div>
          <div className="text-right">
            <div className="mono text-2xl sm:text-3xl font-bold gold leading-none">{fmt(shownEarned)}</div>
            <div className="dim text-xs mt-1">lifetime banked</div>
          </div>
        </div>

        {/* XP + next rank */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="panel rounded-xl p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="dim flex items-center gap-1"><Zap size={12} className="mint" /> Operator level</span>
              <span className="mono mint">LV {level}</span>
            </div>
            <div className="barbg rounded-full h-2 mt-2 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: xpPct + "%", background: "var(--mint)" }} />
            </div>
          </div>
          <div className="panel rounded-xl p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="dim">Next rank · {next ? next.name : "—"}</span>
              <span className="mono gold">{next ? fmt(next.at - earned) + " to go" : "MAX"}</span>
            </div>
            <div className="barbg rounded-full h-2 mt-2 overflow-hidden">
              <div className="goldfill h-full rounded-full" style={{ width: next ? Math.min(100, (earned / next.at) * 100) + "%" : "100%" }} />
            </div>
          </div>
        </div>

        {/* ── Milestone road ─────────────────────────────── */}
        <div className="mt-4 panel rounded-xl px-3 py-3 overflow-x-auto noscroll">
          <div className="flex items-center min-w-max">
            {RANKS.map((r, i) => (
              <div key={r.at} className="flex items-center">
                {i > 0 && <div className="w-7 sm:w-10 h-px" style={{ background: earned >= r.at ? "var(--gold)" : "var(--line)" }} />}
                <div className="flex flex-col items-center px-1">
                  <div
                    className="w-3.5 h-3.5 rounded-full border"
                    style={{
                      background: earned >= r.at ? "var(--gold)" : "transparent",
                      borderColor: next && next.at === r.at ? "var(--gold)" : "var(--line)",
                    }}
                  />
                  <div className={"mt-1 text-[10px] mono " + (earned >= r.at ? "gold" : "dim")}>{fmt(r.at)}</div>
                  <div className={"text-[10px] " + (earned >= r.at ? "" : "dim")}>{r.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Needs you ──────────────────────────────────── */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h2 className="px text-xs alertc">NEEDS YOU ({approvals.length})</h2>
            <span className="dim text-xs">same gates as your Telegram bot</span>
          </div>
          <div className="mt-2 space-y-2">
            {approvals.length === 0 && (
              <div className="panel rounded-xl p-4 text-sm dim">Queue clear. The floor keeps working — check back after the next scout cycle.</div>
            )}
            {approvals.map((a) => (
              <div key={a.id} className="panel rounded-xl p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] mono dim">{a.pod}</div>
                    <div className="font-medium text-sm sm:text-base mt-0.5">{a.title}</div>
                    <div className="dim text-xs mt-0.5 truncate">{a.detail}</div>
                  </div>
                  {a.amount > 0 && <div className="mono gold font-bold whitespace-nowrap">+{fmt(a.amount)}</div>}
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => approve(a)} className="goldbg rounded-lg px-3 py-1.5 text-sm font-bold flex items-center gap-1.5">
                    <Check size={15} /> {a.verb}
                  </button>
                  <button onClick={() => pass(a)} className="ghost rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5">
                    <X size={14} /> Pass
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── The floor ──────────────────────────────────── */}
        <div className="mt-6">
          <h2 className="px text-xs mint">THE FLOOR</h2>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rooms.map((room) => {
              const Icon = room.icon;
              if (!room.open) {
                return (
                  <div key={room.id} className="panel roomlocked rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                      <Lock size={14} className="dim" />
                      <span className="text-sm font-medium dim">{room.name}</span>
                    </div>
                    <div className="dim text-xs mt-2">{room.flavor}</div>
                    <div className="mono text-[11px] gold mt-3">Unlocks at {fmt(room.unlockAt)}</div>
                  </div>
                );
              }
              return (
                <div key={room.id} className="panel2 rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <Icon size={15} className="gold" />
                    <span className="text-sm font-semibold">{room.name}</span>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {room.ops.map((op) => (
                      <div key={op.n} className="flex items-start gap-2.5">
                        <span className="relative mt-1.5">
                          {op.state === "need" && <span className="ring-need" />}
                          <span className={"led led-" + op.state} />
                        </span>
                        <div className="min-w-0">
                          <div className="mono text-[11px] dim">{op.n}</div>
                          <div className={"text-xs leading-snug " + (op.state === "need" ? "alertc" : "")}>
                            {op.lines[tick % op.lines.length]}
                            {op.state === "work" && <span className="dotty"><span /><span /><span /></span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Quests + Ops feed ──────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div className="panel rounded-xl p-4 sm:col-span-2">
            <h2 className="px text-xs gold">WEEKLY QUESTS</h2>
            <div className="mt-3 space-y-3">
              {QUESTS.map((q) => (
                <div key={q.q}>
                  <div className="flex justify-between text-xs">
                    <span>{q.q}</span>
                    <span className="mono dim">{q.done}/{q.of}</span>
                  </div>
                  <div className="barbg rounded-full h-1.5 mt-1.5 overflow-hidden">
                    <div className="goldfill h-full rounded-full" style={{ width: (q.done / q.of) * 100 + "%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel rounded-xl p-4 sm:col-span-3">
            <h2 className="px text-xs dim">OPS FEED</h2>
            <div className="mt-2 space-y-1.5">
              {feed.map((e, i) => (
                <div key={i} className="mono text-[11px] leading-snug flex gap-2">
                  <span className="dim flex-none">{e.t}</span>
                  <span className={e.s.startsWith("✓") ? "mint" : ""}>{e.s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dim text-[11px] mt-6 text-center">
          Demo mode · simulated data · live version wires to n8n status webhooks → events table on your NAS (plan §12)
        </div>
      </div>

      {/* toasts */}
      <div className="fixed bottom-6 left-0 right-0 flex flex-col items-center gap-1 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="toast goldbg px rounded-lg px-3 py-1.5 text-xs font-bold shadow-lg">{t.txt}</div>
        ))}
      </div>

      {/* rank-up overlay */}
      {rankUp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(7,10,26,.88)" }}>
          <div className="overlayIn panel2 rounded-2xl p-8 max-w-sm w-full text-center relative overflow-hidden">
            {[...Array(9)].map((_, i) => (
              <span key={i} className="star text-lg" style={{ left: 8 + i * 11 + "%", top: (i % 3) * 26 + 8 + "%", animationDelay: i * 0.18 + "s" }}>✦</span>
            ))}
            <div className="px text-xs dim">RANK UP</div>
            <div className="px text-2xl gold mt-2">{rankUp.name.toUpperCase()}</div>
            <div className="text-sm mt-3">
              {fmt(rankUp.at)} banked. {rankUp.at === 1000 ? "The Etsy & POD Workshop is now open — TREND-SCOUT is booting up." : "A new wing of HQ is open."}
            </div>
            <div className="dim text-xs mt-2">Loot table says this one's worth a dinner out. Go claim it.</div>
            <button onClick={() => setRankUp(null)} className="goldbg rounded-lg px-4 py-2 text-sm font-bold mt-5">
              Open the new wing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
