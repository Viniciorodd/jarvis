// Seeds the LIVE HQ with sample operators/approvals so you can see the floor lit
// before any n8n workflow exists. Also serves as a working example of the HQ API.
//   node scripts/seed-demo.mjs [http://localhost:8099]
const HQ = process.argv[2] || process.env.HQ_URL || 'http://localhost:8099';
const TOKEN = process.env.HQ_TOKEN || '';
const headers = { 'content-type': 'application/json', ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) };

const post = async (path, body) => {
  const r = await fetch(`${HQ}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r.json();
};

const events = [
  { agent: 'MAILROOM-01', pod: 'cos', state: 'work', text: 'Triaging 14 new emails' },
  { agent: 'EOD-BOT', pod: 'cos', state: 'idle', text: 'Next report · 6:00 PM' },
  { agent: 'PIXEL-02', pod: 'fiv', state: 'work', text: 'Rendering thumbnail v2 · #1047' },
  { agent: 'QC-DESK', pod: 'fiv', state: 'need', text: '2 deliveries await your review' },
  { agent: 'SAM-SCOUT', pod: 'gov', state: 'work', text: 'Scanned 212 notices → 4 leads' },
  { agent: 'BID-ANALYST', pod: 'gov', state: 'work', text: 'Bid memo · janitorial · $48k' },
];
for (const e of events) await post('/api/event', e);

await post('/api/approval', {
  pod: 'Fiverr Studio', title: 'Deliver thumbnail v2', detail: 'Order #1047 · @BG_Media',
  amount: 35, xp: 25, verb: 'Approve & deliver',
});
await post('/api/approval', {
  pod: 'Gov War Room', title: 'Send RFQ to 3 electrical subs', detail: 'Janitorial $48k · Harrisburg area',
  xp: 40, verb: 'Approve & send',
});
await post('/api/quests', {
  streak: 1,
  quests: [
    { q: 'Ship 5 Fiverr orders', done: 0, of: 5 },
    { q: 'Collect 3 sub quotes', done: 0, of: 3 },
    { q: 'Answer 1 sources-sought', done: 0, of: 1 },
  ],
});

console.log(`Seeded ${HQ} — open it in a browser. Approving the $35 delivery banks real (test) money;`);
console.log('delete hq/data/ to reset to zero before going live.');
