/* finances.js — the unified Finances desk (U4).
 *
 * WHY: the audit found money scattered across FIVE disconnected surfaces — income in bizDetail (finance
 * only), deals in /dealroom, credit in /lendability, tax behind ONE Home link that disappears when the
 * count hits zero, and AI spend in the Command wall. Worse: /api/pl and /api/expense existed server-side
 * with ZERO client callers — the P&L had never had a screen at all.
 *
 * HONESTY RULES (the whole point of this desk):
 *  - Stripe reports mode:"test" → we SAY it's test mode. A $0 that looks like a real $0 is a lie.
 *  - No projected/estimated revenue is invented. Collected is collected.
 *  - A credit claim with no source is surfaced as unverified, never rendered as fact.
 *  - The CAIVRS caveat rides along: the EIDL is CURRENT, so SBA is not asserted closed.
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function usd(n, dp) {
    var v = Number(n) || 0;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: dp == null ? 2 : dp, maximumFractionDigits: dp == null ? 2 : dp });
  }
  function usd0(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

  var CK = {
    'entity-ein': 'EIN confirmed', 'duns': 'D-U-N-S number', 'reporting-tradelines': 'Reporting trade lines',
    'business-credit-score': 'Business-credit score', 'business-bank-account': 'Business bank account',
    'debt-schedule': 'Debt schedule disclosed', 'gov-past-performance': 'Gov past performance / CPARS'
  };
  function ckLabel(k) { return CK[k] || String(k || '').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

  function ring(pct) {
    var r = 40, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    return '<svg class="fin-ring" viewBox="0 0 100 100" aria-label="' + pct + '% ready">' +
      '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="rgba(var(--teal-rgb),.14)" stroke-width="9"/>' +
      '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="var(--teal)" stroke-width="9" stroke-linecap="round" ' +
      'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 50 50)"/>' +
      '<text class="p" x="50" y="49" text-anchor="middle">' + pct + '%</text>' +
      '<text class="l" x="50" y="64" text-anchor="middle">READY</text></svg>';
  }

  function render(pl, tax, credit, debt) {
    var h = '';
    var GOAL = 10000; // the operator's monthly income goal (matches the businesses hub)

    // ── header line
    var mode = pl && pl.mode === 'test' ? ' · Stripe is in TEST mode' : '';
    $('finSub').textContent = 'Collected ' + usd0(pl ? pl.collected : 0) + ' of ' + usd0(GOAL) + ' this month' + mode;

    // ── MONEY IN
    var collected = pl ? pl.collected : 0, pctGoal = Math.min(100, Math.round((collected / GOAL) * 100));
    h += '<section class="fin-card s7"><div class="fin-h"><span class="t">Money in</span>' +
      (pl && pl.mode === 'test' ? '<span class="fin-chip warn">test mode</span>' : '<span class="m">' + esc((pl && pl.mode) || '') + '</span>') + '</div>' +
      '<div class="fin-tiles">' +
        '<div class="fin-tile"><div class="v accent">' + usd0(collected) + '</div><div class="k">Collected (mo)</div></div>' +
        '<div class="fin-tile"><div class="v">' + usd0(pl ? pl.weekCollected : 0) + '</div><div class="k">This week</div></div>' +
        '<div class="fin-tile"><div class="v">' + usd0(pl ? pl.available : 0) + '</div><div class="k">Available</div></div>' +
        '<div class="fin-tile"><div class="v">' + usd0(pl ? pl.pending : 0) + '</div><div class="k">Pending</div></div>' +
      '</div>' +
      '<div class="fin-bar"><i style="width:' + pctGoal + '%"></i></div>' +
      '<div class="fin-goal"><span>' + pctGoal + '% of the ' + usd0(GOAL) + ' goal</span><span>' + usd0(Math.max(0, GOAL - collected)) + ' to go</span></div>' +
      (collected === 0 ? '<div class="fin-empty" style="padding-top:12px">Nothing collected yet this month. Income lands here when a Stripe payment clears' +
        (pl && pl.mode === 'test' ? ' — but Stripe is in <b>test mode</b>, so real payments would not show. Switch to live keys when you invoice for real.' : '.') + '</div>' : '') +
    '</section>';

    // ── P&L (this endpoint existed with no screen until now)
    var ai = pl ? pl.aiTotal : 0, net = pl ? pl.net : 0;
    h += '<section class="fin-card s5"><div class="fin-h"><span class="t">Profit &amp; loss</span><span class="m">this month</span></div>' +
      '<table class="fin-pl">' +
        '<tr><td class="lbl">Revenue collected</td><td>' + usd(collected) + '</td></tr>' +
        '<tr><td class="lbl">AI spend</td><td>−' + usd(ai) + '</td></tr>' +
        '<tr><td class="lbl">AI spend today</td><td class="lbl">' + usd(pl ? pl.aiToday : 0) + '</td></tr>' +
        '<tr class="tot"><td>Net</td><td style="color:' + (net >= 0 ? 'var(--ok)' : 'var(--err)') + '">' + usd(net) + '</td></tr>' +
      '</table>' +
      '<div class="fin-empty" style="padding:10px 0 0">Only what Jarvis can actually see: Stripe income and real AI cost. Sub payments, fuel, and supplies aren\'t tracked here yet — log them and they\'ll land in this table.</div>' +
    '</section>';

    // ── LENDABILITY
    if (credit) {
      var L = credit.lendability || { items: [], have: 0, total: 0 };
      h += '<section class="fin-card s7"><div class="fin-h"><span class="t">Lendability</span><a href="/lendability">full desk →</a></div>' +
        '<div class="fin-lend">' + ring(credit.readinessPct || 0) +
          '<div class="i"><div class="b">' + (L.have || 0) + ' of ' + (L.total || 0) + ' packet items ready</div>' +
          '<div class="s">The living file you hand a lender or factoring company. EIN-based — it moves independently of your personal credit.</div></div>' +
        '</div>' +
        '<ul class="fin-check">' + (L.items || []).map(function (it) {
          return '<li><span class="fin-ck ' + (it.have ? 'on' : 'off') + '">' + (it.have ? '✓' : '') + '</span>' +
            '<span class="cl ' + (it.have ? '' : 'off') + '">' + esc(ckLabel(it.key)) + '</span></li>';
        }).join('') + '</ul>' +
        ((credit.needsVerification || []).length ? '<div class="fin-empty" style="padding-top:10px"><b>' + credit.needsVerification.length +
          '</b> claim(s) have no source yet — shown as unverified, never counted as fact.</div>' : '') +
      '</section>';

      h += '<section class="fin-card s5"><div class="fin-h"><span class="t">Financing paths</span></div>' +
        '<div class="fin-note"><div class="h">What\'s open to you</div>' + esc(credit.financingNote || '') + '</div></section>';
    }

    // ── TAX — a PERMANENT entry point (it used to hide behind one Home link that vanished at zero)
    if (tax) {
      var nr = tax.needsReview || 0, dl = tax.upcomingDeadlines || [];
      h += '<section class="fin-card s6"><div class="fin-h"><span class="t">Tax</span>' +
        (nr ? '<a href="/#tax-review">' + nr + ' to review →</a>' : '<span class="m">nothing to review</span>') + '</div>' +
        '<div class="fin-empty" style="padding:0 0 10px">' + esc(tax.headline || '') + '</div>' +
        '<div class="fin-tiles" style="grid-template-columns:repeat(2,1fr)">' +
          '<div class="fin-tile"><div class="v">' + (tax.setAsidePct || 0) + '%</div><div class="k">Set aside per $</div></div>' +
          '<div class="fin-tile"><div class="v">' + (tax.docsIndexed || 0).toLocaleString('en-US') + '</div><div class="k">Docs indexed</div></div>' +
        '</div>' +
        (dl.length ? '<div class="fin-rows" style="margin-top:10px">' + dl.slice(0, 3).map(function (d) {
          return '<div class="fin-row"><div class="l"><div class="nm">' + esc(d.label || d.form || 'Deadline') + '</div>' +
            '<div class="dt">' + esc(d.due || d.date || '') + '</div></div>' +
            '<div class="r"><span class="fin-chip ' + (d.daysLeft != null && d.daysLeft <= 3 ? 'bad' : 'warn') + '">' +
            (d.daysLeft != null ? d.daysLeft + 'd' : 'upcoming') + '</span></div></div>';
        }).join('') + '</div>'
          : '<div class="fin-empty" style="padding-top:10px">No tax deadline inside the reminder window. The radar checks daily and pings Telegram at 3 days out.</div>') +
      '</section>';
    }

    // ── DEBT
    if (debt && debt.ok && debt.debts.length) {
      var t = debt.totals;
      h += '<section class="fin-card s6"><div class="fin-h"><span class="t">Debt schedule</span><span class="m">as of ' + esc(debt.asOf || '') + '</span></div>' +
        '<div class="fin-tiles" style="grid-template-columns:repeat(3,1fr)">' +
          '<div class="fin-tile"><div class="v">' + usd0(t.balance) + '</div><div class="k">Total owed</div></div>' +
          '<div class="fin-tile"><div class="v">' + usd0(t.monthly) + '</div><div class="k">Monthly</div></div>' +
          '<div class="fin-tile"><div class="v">' + usd0(t.chargedOff) + '</div><div class="k">Charged off</div></div>' +
        '</div>' +
        '<div class="fin-rows" style="margin-top:10px">' + debt.debts.map(function (d) {
          var cls = d.status === 'paying' ? 'ok' : d.status === 'charged-off' ? 'warn' : '';
          return '<div class="fin-row"><div class="l"><div class="nm">' + esc(d.creditor) + '</div>' +
            '<div class="dt">' + (d.monthlyPayment ? usd0(d.monthlyPayment) + '/mo' : 'no payment plan') +
            (d.aprPct ? ' · ' + d.aprPct + '% APR' : '') + '</div></div>' +
            '<div class="r"><div class="fin-amt">' + usd0(d.balance) + '</div>' +
            '<span class="fin-chip ' + cls + '">' + esc(d.status) + '</span></div></div>';
        }).join('') + '</div>' +
      '</section>';
    }

    $('finRoot').innerHTML = h;
  }

  function j(u) { return fetch(u).then(function (r) { return r.json(); }).catch(function () { return null; }); }
  Promise.all([j('/api/pl'), j('/api/tax/status'), j('/api/finance/credit'), j('/api/finance/debts')])
    .then(function (r) { render(r[0], r[1], r[2], r[3]); })
    .catch(function () { $('finRoot').innerHTML = '<div class="fin-card s12"><div class="fin-empty">Could not load your money.</div></div>'; });
})();
