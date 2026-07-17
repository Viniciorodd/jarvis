/* real-estate.js — the Real Estate desk (U5).
 *
 * WHY THIS EXISTS: the portfolio was reachable ONLY through the legacy ops.js overlay (100KB), behind a
 * small "old Ops ↗" button inside another overlay. That made ops.js undeletable — U2 can't remove the old
 * gov surfaces while ops.js is also the only door to the properties. This is that door, standing on its own.
 *
 * THE DATA IS MESSY AND WE SAY SO rather than papering over it. pods/real-estate/portfolio.json really has:
 *   - three different rent field names (rent | monthly_rent | rent_monthly),
 *   - the SAME property in two lists (2135 Brick Ave is in units AND rentals),
 *   - a seed placeholder row ("Add your first unit address here").
 * We normalize for display, DEDUPE by address, flag the placeholder, and never invent a number.
 *
 * OWNERSHIP REALITY (from the operator profile — matters because it drives his taxes, and a "portfolio
 * total" that ignores it would be a lie): 2135 Brick Ave LLC is 19% him / 81% his mother (a partnership,
 * Form 1065 — only his 19% share hits his 1040). 218 W Ridge is 100% his mother's — he manages it, it is
 * taxed to her, and it is OFF his return entirely. So we show gross rent roll AND label whose it is.
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function usd0(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

  // The three rent spellings in the real file, in priority order.
  function rentOf(x) { return Number(x.rent_monthly || x.monthly_rent || x.rent || 0) || 0; }
  function addrOf(x) { return String(x.address || '').trim(); }

  /* DEDUPE KEY — this took two tries, so the reasoning stays here.
   * Keying on the whole address was wrong in BOTH directions on the real data:
   *  - it MERGED "218 W Ridge St" 1st Floor + 2nd Floor (two distinct units in one building) and silently
   *    dropped a unit and its rent;
   *  - it MISSED the real duplicate, because the same property is stored as "2135 Brick Ave" in units and
   *    "2135 Brick Ave, Scranton PA" in rentals — different strings, so $1,850 was counted twice.
   * So: match on the STREET portion (everything before the first comma — the city/state suffix is what
   * varies), and keep the UNIT in the key so separate units in one building stay separate. */
  var street = function (x) { return addrOf(x).split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
  var normAddr = function (x) { return street(x) + '|' + String(x.unit || '').toLowerCase().trim(); };
  function isPlaceholder(x) { return /add your first|update with real data/i.test(addrOf(x) + ' ' + (x.notes || '')); }

  // Whose is it? Drives the tax truth; label it, never hide it.
  function ownerOf(x) {
    var a = street(x);
    if (/218 w ridge/.test(a)) return { who: "Mother's — you manage it", cls: '' };
    if (/brick ave|2nd street|2nd st/.test(a)) return { who: 'Brick Ave LLC · 19% you', cls: 'ok' };
    return null;
  }

  function row(x, kind) {
    var rent = rentOf(x), o = ownerOf(x), ph = isPlaceholder(x);
    var sub = [];
    if (x.unit) sub.push(esc(x.unit));
    if (x.type === 'section8' || x.program === 'section-8') sub.push('Section 8');
    if (x.status) sub.push(esc(x.status));
    if (x.tenant) sub.push(esc(x.tenant));
    if (x.hap) sub.push('HAP ' + usd0(x.hap));
    return '<div class="fin-row">' +
      '<div class="l"><div class="nm">' + (ph ? '<span style="color:var(--dim)">Placeholder row — not a real property</span>' : esc(addrOf(x) || '(no address)')) + '</div>' +
        '<div class="dt">' + (sub.length ? sub.join(' · ') : (ph ? 'Seed data left over from setup — delete it in portfolio.json' : kind)) + '</div></div>' +
      '<div class="r">' + (rent ? '<div class="fin-amt">' + usd0(rent) + '<span style="font-size:11px;color:var(--dim);font-weight:400">/mo</span></div>' : '<div class="dt" style="color:var(--dim)">no rent set</div>') +
        (o ? '<span class="fin-chip ' + o.cls + '">' + esc(o.who) + '</span>' : '') + '</div>' +
    '</div>';
  }

  function render(d) {
    if (!d) { $('reRoot').innerHTML = '<div class="fin-card s12"><div class="fin-empty">Could not load the portfolio.</div></div>'; return; }
    var units = d.units || [], rentals = d.rentals || [], flips = d.flips || [], builds = d.new_builds || [];

    // Dedupe across units+rentals by address — the same property really is in both lists.
    var seen = {}, all = [], dupes = 0;
    units.concat(rentals).forEach(function (x) {
      if (isPlaceholder(x)) { all.push(x); return; }           // keep, but flagged
      var k = normAddr(x);
      if (!k) { all.push(x); return; }
      if (seen[k]) { dupes++; if (rentOf(x) > rentOf(seen[k])) { seen[k].__rent = rentOf(x); } return; }
      seen[k] = x; all.push(x);
    });
    var real = all.filter(function (x) { return !isPlaceholder(x); });
    var roll = real.reduce(function (n, x) { return n + (x.__rent || rentOf(x)); }, 0);
    var withRent = real.filter(function (x) { return (x.__rent || rentOf(x)) > 0; }).length;

    $('reSub').textContent = real.length + ' propert' + (real.length === 1 ? 'y' : 'ies') + ' · ' + usd0(roll) +
      '/mo gross rent roll' + (d.updated ? ' · updated ' + String(d.updated).slice(0, 10) : '');

    var h = '';
    // Tiles
    h += '<section class="fin-card s12"><div class="fin-tiles">' +
      '<div class="fin-tile"><div class="v accent">' + real.length + '</div><div class="k">Properties</div></div>' +
      '<div class="fin-tile"><div class="v">' + usd0(roll) + '</div><div class="k">Gross rent / mo</div></div>' +
      '<div class="fin-tile"><div class="v">' + flips.length + '</div><div class="k">Flips active</div></div>' +
      '<div class="fin-tile"><div class="v">' + builds.length + '</div><div class="k">New builds</div></div>' +
    '</div></section>';

    // Rent roll
    h += '<section class="fin-card s7"><div class="fin-h"><span class="t">Rent roll</span><span class="m">' +
      withRent + ' of ' + real.length + ' have a rent set</span></div>' +
      '<div class="fin-rows">' + all.map(function (x) { return row(x, 'property'); }).join('') + '</div>' +
      (dupes ? '<div class="fin-empty" style="padding-top:10px">Merged <b>' + dupes + '</b> duplicate' + (dupes === 1 ? '' : 's') +
        ' — the same address is listed in both <code>units</code> and <code>rentals</code> in portfolio.json. Worth cleaning up at the source.</div>' : '') +
    '</section>';

    // Ownership truth — this is why the number above is "gross", not "yours"
    h += '<section class="fin-card s5"><div class="fin-h"><span class="t">Whose is what</span></div>' +
      '<div class="fin-note"><div class="h">Why gross ≠ yours</div>' +
      '<b>2135 Brick Ave LLC</b> (Brick Ave + both Plymouth 2nd St houses) is a partnership — <b>19% you / 81% your mother</b>. ' +
      'Only your 19% share reaches your 1040, via a K-1 from Form 1065.<br><br>' +
      '<b>218 W Ridge</b> is <b>100% your mother\'s</b> — you manage it, but it\'s taxed to her and is off your return entirely.<br><br>' +
      'So the rent roll above is the <b>gross</b> the buildings produce, not your taxable income. Jarvis will not add them into your P&amp;L.</div></section>';

    // Flips / builds — honest empty states
    h += '<section class="fin-card s6"><div class="fin-h"><span class="t">Flips</span></div>' +
      (flips.length ? '<div class="fin-rows">' + flips.map(function (f) { return row(f, 'flip'); }).join('') + '</div>'
        : '<div class="fin-empty">No flips in progress. When one starts, its budget vs spend and next milestone show here.</div>') +
    '</section>';
    h += '<section class="fin-card s6"><div class="fin-h"><span class="t">New builds</span></div>' +
      (builds.length ? '<div class="fin-rows">' + builds.map(function (b) { return row(b, 'build'); }).join('') + '</div>'
        : '<div class="fin-empty">Nothing under construction.</div>') +
    '</section>';

    // Deal analyzer — honest about what it actually is
    h += '<section class="fin-card s12"><div class="fin-h"><span class="t">Deal analyzer</span></div>' +
      '<div class="fin-empty">The analyzer is a separate app (DealForge) that ran at <code>localhost:8096</code>. ' +
      'The old screen embedded it in an iframe with a fallback that could never fire — so if it wasn\'t running you got a blank box and no explanation. ' +
      'It is <b>not wired in here</b> until it\'s a real, running service. ' +
      '<a class="fin-cta" style="margin-top:10px" href="http://localhost:8096" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Try DealForge anyway</a></div>' +
    '</section>';

    $('reRoot').innerHTML = h;
  }

  fetch('/api/real-estate').then(function (r) { return r.json(); }).then(render)
    .catch(function () { render(null); });
})();
