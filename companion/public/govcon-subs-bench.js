/* govcon-subs-bench.js — the Subcontractor bench, INSIDE the old rich /govcon (operator wanted the Stitch
 * improvements built onto the GovCon they use, not a separate app). Self-contained: mounts on #gcSubs, styled
 * to govcon.css's OWN tokens (--accent/--ink=text/--panel/--panel-2/--line/--muted/--ok/--warn/--danger),
 * NOT the /govcon-os gos-* classes. Salvaged from the retired govcon-subs.js:
 *   • the CRM bench with Google-review vetting + Hector's fit verdict,
 *   • the reach-out PREVIEW (editable draft shown BEFORE anything sends),
 *   • the ALWAYS-VISIBLE SAM exclusion status (clear / excluded / unverified),
 *   • THE APPROVAL-EFFECT MODAL — reads /api/gov/send-mode and tells the truth (really sends vs dry-runs).
 * Reads live data; sends nothing without an explicit approval. */
(function () {
  var EL, SUBS = [], LADDERS = [], AUTO_SEND = null, BENCH_PRICING = [];
  var $ = function (id) { return document.getElementById(id); };
  function usdRate(n) { n = Number(n) || 0; return n < 10 ? '$' + n.toFixed(2) : '$' + Math.round(n).toLocaleString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function daysSince(iso) { if (!iso) return null; var t = Date.parse(iso); if (isNaN(t)) return null; return Math.floor((Date.now() - t) / 86400000); }

  function injectCss() {
    if ($('gcSubsCss')) return;
    var s = document.createElement('style'); s.id = 'gcSubsCss';
    s.textContent = [
      '.gc-subs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}',
      '.gc-sub-card{background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:13px 14px}',
      '.gc-sub-name{font-weight:700;color:var(--ink);font-size:14px;line-height:1.25}',
      '.gc-sub-meta{color:var(--muted);font-size:12px;margin-top:2px}',
      '.gc-sub-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}',
      '.gc-sub-actions{display:flex;gap:6px;flex-wrap:wrap}',
      '.gc-chip{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:99px;display:inline-flex;align-items:center;gap:4px}',
      '.gc-chip.status{background:var(--panel);color:var(--muted);border:1px solid var(--line)}',
      '.gc-chip.clear{background:var(--accent-soft);color:var(--accent)}',
      '.gc-chip.exc{background:color-mix(in srgb,var(--danger) 12%,transparent);color:var(--danger);border:1px solid color-mix(in srgb,var(--danger) 30%,transparent)}',
      '.gc-chip.unv{background:color-mix(in srgb,var(--warn) 12%,transparent);color:var(--warn);border:1px solid color-mix(in srgb,var(--warn) 30%,transparent)}',
      '.gc-subs-ladder{background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:14px}',
      '.gc-subs-ladder .lab{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}',
      '.gc-subs-line{font-size:12.5px;color:var(--ink);margin-bottom:5px}',
      '.gc-sub-mask{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);z-index:80;display:flex;align-items:center;justify-content:center;padding:18px}',
      '.gc-sub-modal{background:var(--panel);border:1px solid var(--line);border-radius:16px;max-width:560px;width:100%;max-height:88vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.55)}',
      '.gc-sub-mhead{padding:15px 18px 11px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '.gc-sub-mbody{padding:15px 18px}.gc-sub-mfoot{padding:12px 18px 16px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}',
      '.gc-sub-mx{appearance:none;border:none;background:transparent;color:var(--muted);font-size:18px;cursor:pointer;line-height:1}',
      '.gc-sub-block{background:var(--panel-2);border:1px solid var(--line);border-radius:11px;padding:11px 12px;margin-bottom:10px;font-size:12.5px;color:var(--ink);line-height:1.55}',
      '.gc-sub-block .k{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}',
      '.gc-sub-ta{width:100%;box-sizing:border-box;min-height:150px;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;color:var(--ink);font:inherit;font-size:13px;padding:11px;resize:vertical}',
      '.gc-sub-inp{width:100%;box-sizing:border-box;background:var(--panel-2);border:1px solid var(--line);border-radius:9px;color:var(--ink);font:inherit;font-size:13px;padding:8px 11px}',
      '.gc-sub-effect{border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.55;margin-bottom:12px}',
      '.gc-sub-effect.send{background:var(--accent-soft);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);color:var(--ink)}',
      '.gc-sub-effect.dry{background:color-mix(in srgb,var(--warn) 12%,transparent);border:1px solid color-mix(in srgb,var(--warn) 32%,transparent);color:var(--ink)}'
    ].join('');
    document.head.appendChild(s);
  }

  function exclChip(sub) {
    var st = sub.exclusionStatus, at = sub.exclusionCheckedAt;
    if (st === 'excluded') return '<span class="gc-chip exc"><i class="ti ti-ban"></i> Excluded — cannot subcontract</span>';
    if (st === 'clear') { var d = daysSince(at); return '<span class="gc-chip clear"><i class="ti ti-shield-check"></i> SAM: clear' + (d != null ? ' (' + (d === 0 ? 'today' : d + 'd ago') + ')' : '') + '</span>'; }
    return '<span class="gc-chip unv"><i class="ti ti-alert-triangle"></i> Exclusion unverified — confirm at SAM.gov</span>';
  }
  function statusChip(sub) {
    var s = String(sub.status || 'prospect').toLowerCase();
    return '<span class="gc-chip status">' + (s === 'contacted' ? 'Contacted' : s === 'responded' ? 'Responded' : s === 'declined' ? 'Declined' : 'Prospect') + '</span>';
  }

  function render() {
    if (!EL) return;
    var waiting = LADDERS.filter(function (l) { return !l.closed; }).length;
    var stat = $('gcSubsStat'); if (stat) stat.textContent = SUBS.length + ' on the bench · ' + waiting + ' waiting on a reply';
    var h = '';
    var open = LADDERS.filter(function (l) { return !l.closed; });
    if (open.length) {
      h += '<div class="gc-subs-ladder"><div class="lab">Backup ladder</div>' +
        open.map(function (l) {
          var tiers = (l.tiers || []).map(function (t) {
            var d = daysSince(t.contactedAt);
            var s = t.status === 'responded' ? 'responded ✓' : t.status === 'excluded' ? '⛔ excluded' : t.contactedAt ? ('contacted' + (d != null ? ' ' + d + 'd ago' : '')) : 'pending';
            return '<b>' + esc(t.role || 'sub') + ':</b> ' + esc(t.name || '—') + ' — ' + s;
          }).join(' · ');
          return '<div class="gc-subs-line">' + esc(l.trade || 'trade') + ' — ' + tiers + '</div>';
        }).join('') +
        '<div class="gc-sub-meta" style="margin-top:6px"><i class="ti ti-info-circle"></i> A backup only ever DRAFTS an email for your approval — it never sends on its own.</div></div>';
    }
    // Pricing intelligence — the proactive-DB payoff: median $/sqft · hourly · minimum across YOUR network,
    // per trade, so any incoming quote is checked against your own comps (not trusted in isolation).
    var priced = (BENCH_PRICING || []).filter(function (b) { return b.metrics && Object.keys(b.metrics).length; });
    h += '<div class="gc-subs-ladder"><div class="lab">Pricing intelligence <span style="text-transform:none;letter-spacing:0;color:var(--muted)">— your network\'s own comps</span></div>';
    if (!priced.length) {
      h += '<div class="gc-sub-meta">No pricing captured yet. Open a sub → <b>Record pricing</b> to start building the benchmark. Once ~2+ subs per trade have a rate, every new quote gets price-checked against your own network.</div>';
    } else {
      h += priced.map(function (b) {
        var m = b.metrics, parts = [];
        if (m.perSqft) parts.push('$/sqft ' + usdRate(m.perSqft.min) + '–' + usdRate(m.perSqft.max) + ' (med ' + usdRate(m.perSqft.median) + ', n=' + m.perSqft.n + ')');
        if (m.hourly) parts.push('hourly ' + usdRate(m.hourly.min) + '–' + usdRate(m.hourly.max) + ' (med ' + usdRate(m.hourly.median) + ')');
        if (m.minimum) parts.push('min ' + usdRate(m.minimum.median));
        return '<div class="gc-subs-line"><b>' + esc(b.trade || 'trade') + ':</b> ' + parts.join(' · ') + '</div>';
      }).join('');
    }
    h += '</div>';
    if (!SUBS.length) { h += '<div class="gc-empty">No subcontractors on the bench yet. Hector adds them as opportunities need a trade — or say “find janitorial subs near Scranton”.</div>'; }
    else {
      h += '<div class="gc-subs-grid">' + SUBS.map(function (s) {
        return '<div class="gc-sub-card">' +
          '<div class="gc-sub-name">' + esc(s.name || '(unnamed)') + '</div>' +
          '<div class="gc-sub-meta">' + esc(s.trade || 'facilities') + (s.location ? ' · ' + esc(s.location) : '') + '</div>' +
          '<div class="gc-sub-chips">' + statusChip(s) + exclChip(s) + '</div>' +
          '<div class="gc-sub-actions">' +
            '<button class="gc-btn primary" data-act="reach" data-id="' + esc(s.id) + '">Reach out</button>' +
            '<button class="gc-btn" data-act="detail" data-id="' + esc(s.id) + '">Detail</button>' +
          '</div></div>';
      }).join('') + '</div>';
    }
    EL.innerHTML = h;
  }

  // ── modal ────────────────────────────────────────────────────────────────────────────────────────
  function modal(inner) {
    var mask = document.createElement('div'); mask.className = 'gc-sub-mask';
    mask.innerHTML = '<div class="gc-sub-modal">' + inner + '</div>';
    document.body.appendChild(mask);
    mask.addEventListener('click', function (e) { if (e.target === mask || e.target.closest('[data-x]')) close(); });
    function close() { if (mask.parentNode) document.body.removeChild(mask); }
    return { el: mask, close: close };
  }

  function detail(id) {
    var s = SUBS.find(function (x) { return x.id === id; }) || { id: id };
    var m = modal('<div class="gc-sub-mhead"><div><div class="gc-sub-name">' + esc(s.name || '') + '</div><div class="gc-sub-meta">' + esc(s.trade || '') + (s.location ? ' · ' + esc(s.location) : '') + '</div></div><button class="gc-sub-mx" data-x><i class="ti ti-x"></i></button></div><div class="gc-sub-mbody" id="gcSubDetail"><div class="gc-empty">Pulling Google reviews + Hector’s read…</div></div>');
    fetch('/api/sub-info?id=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (d) {
      var el = m.el.querySelector('#gcSubDetail'); if (!el) return;
      var sub = d.sub || s, p = d.places, fit = d.fit, h = '<div style="margin-bottom:10px">' + exclChip(sub) + '</div>';
      h += '<div class="gc-sub-block"><div class="k">Contact</div>' + ([sub.contact_email, sub.phone, sub.website].filter(Boolean).map(esc).join('<br>') || 'No contact on file — Hector will try to find an email on reach-out.') + '</div>';
      if (p && p.rating) h += '<div class="gc-sub-block"><div class="k">Google · ' + p.rating + '★ (' + (p.total || 0) + ')</div>' + ((p.reviews || []).map(function (rv) { return '“' + esc((rv.text || '').slice(0, 220)) + '” — ' + esc(rv.author || 'anon') + (rv.rating ? ' (' + rv.rating + '★)' : ''); }).join('<br><br>') || 'No review text.') + '</div>';
      else h += '<div class="gc-sub-block">No Google rating found for this vendor.</div>';
      if (fit && fit.why) h += '<div class="gc-sub-block"><div class="k" style="color:var(--accent)">Hector’s fit verdict</div>' + esc(fit.why) + '</div>';
      // Pricing capture — build the proactive pricing DB. Show what's on file + a form to add/update it.
      var pr = sub.pricing || {};
      var onfile = ['perSqft', 'hourly', 'monthly', 'minimum'].filter(function (k) { return pr[k]; }).map(function (k) { return (k === 'perSqft' ? '$/sqft ' : k === 'hourly' ? 'hourly ' : k === 'monthly' ? 'monthly ' : 'min ') + usdRate(pr[k]); });
      h += '<div class="gc-sub-block"><div class="k">Pricing on file' + (pr.capturedAt ? ' · ' + String(pr.capturedAt).slice(0, 10) : '') + '</div>' +
        (onfile.length ? onfile.join(' · ') : 'None yet — add a rate below to feed the network benchmark.') +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">' +
          '<input class="gc-sub-inp" id="gcPxSqft" placeholder="$/sqft" style="width:88px" value="' + (pr.perSqft || '') + '">' +
          '<input class="gc-sub-inp" id="gcPxHr" placeholder="$/hr" style="width:80px" value="' + (pr.hourly || '') + '">' +
          '<input class="gc-sub-inp" id="gcPxMin" placeholder="minimum" style="width:96px" value="' + (pr.minimum || '') + '">' +
          '<button class="gc-btn" data-px="' + esc(id) + '">Save pricing</button>' +
        '</div><div class="gc-sub-meta" id="gcPxOut" style="margin-top:7px"></div></div>';
      h += '<button class="gc-btn primary" data-act="reach" data-id="' + esc(id) + '">Reach out to ' + esc(sub.name || 'them') + '</button>';
      if (sub.website) h += '<button class="gc-btn" data-act="formfill" data-id="' + esc(id) + '" style="margin-left:8px" title="Hector fills their contact form + screenshots it for your review (never submits)">🌐 Fill their contact form</button>';
      el.innerHTML = h;
      el.querySelector('[data-act="reach"]').onclick = function () { m.close(); reach(id); };
      var ffBtn = el.querySelector('[data-act="formfill"]');
      if (ffBtn) ffBtn.onclick = function () {
        el.innerHTML = '<div class="gc-empty">🌐 Hector is opening ' + esc(sub.website) + ' and filling their contact form…<br><span style="opacity:.7">~30–60s · nothing is submitted</span></div>';
        fetch('/api/gov/sub-form-fill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
          .then(function (r) { return r.json(); }).then(function (d) {
            if (!d.ok) { el.innerHTML = '<div class="gc-empty">Couldn’t do it: ' + esc(d.error || 'unknown') + '</div>'; return; }
            var h2 = '<div class="gc-sub-block"><div class="k">Contact form — ' + (d.filledCount ? d.filledCount + ' field(s) filled ✓' : 'no fields filled') + '</div>'
              + '<div class="gc-sub-meta">' + esc(d.note || '') + '</div>'
              + '<div class="gc-sub-meta" style="margin-top:5px"><a href="' + esc(d.url || sub.website) + '" target="_blank" rel="noopener">Open the form ▸</a> — review the screenshot below, then submit it on their site yourself.</div></div>';
            if (d.screenshotUrl) h2 += '<img src="' + esc(d.screenshotUrl) + '" alt="staged contact form" style="width:100%;border:1px solid var(--line);border-radius:10px;margin-top:8px">';
            el.innerHTML = h2;
          }).catch(function () { el.innerHTML = '<div class="gc-empty">The browser run failed.</div>'; });
      };
      var pxBtn = el.querySelector('[data-px]');
      if (pxBtn) pxBtn.onclick = function () {
        var body = { id: id, perSqft: el.querySelector('#gcPxSqft').value, hourly: el.querySelector('#gcPxHr').value, minimum: el.querySelector('#gcPxMin').value };
        var out = el.querySelector('#gcPxOut'); out.textContent = 'Saving…';
        fetch('/api/gov/sub-pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then(function (r) { return r.json(); }).then(function (d) {
            if (!d.ok) { out.textContent = d.error || 'Could not save.'; return; }
            var b = d.benchmark && d.benchmark.metrics && d.benchmark.metrics.perSqft;
            out.innerHTML = '✓ Saved.' + (b && b.n >= 2 ? ' Network $/sqft median now ' + usdRate(b.median) + ' (n=' + b.n + ').' : '');
            load(); // refresh the bench pricing panel
          }).catch(function () { out.textContent = 'Could not save.'; });
      };
    }).catch(function () { var el = m.el.querySelector('#gcSubDetail'); if (el) el.innerHTML = '<div class="gc-empty">Could not load this sub’s details.</div>'; });
  }

  function reach(id) {
    var s = SUBS.find(function (x) { return x.id === id; }) || { id: id };
    var m = modal('<div class="gc-sub-mhead"><div class="gc-sub-name">Reach out — ' + esc(s.name || '') + '</div><button class="gc-sub-mx" data-x><i class="ti ti-x"></i></button></div><div class="gc-sub-mbody" id="gcSubReach"><div class="gc-empty">Hector is drafting the teaming email…</div></div>');
    fetch('/api/sub-reach-preview?id=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (d) {
      var el = m.el.querySelector('#gcSubReach'); if (!el) return;
      if (d && d.error) { el.innerHTML = '<div class="gc-empty">Couldn’t draft it: ' + esc(d.error) + '</div>'; return; }
      var subj = d.subject || (d.email && d.email.subject) || '';
      var body = d.body || (d.email && d.email.body) || d.draft || d.text || d.preview || '';
      var to = d.to || (d.sub && d.sub.contact_email) || s.contact_email || '';
      el.innerHTML =
        '<div class="gc-sub-block"><div class="k">To</div>' + (to ? esc(to) : 'No email yet — Hector will enrich one before it can send.') + '</div>' +
        (subj ? '<div class="gc-sub-block"><div class="k">Subject</div><input class="gc-sub-inp" id="gcSubSubj" value="' + esc(subj) + '"></div>' : '') +
        '<div class="k" style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:2px 0 6px">The draft — edit before you send</div>' +
        '<textarea class="gc-sub-ta" id="gcSubBody">' + esc(body) + '</textarea>' +
        '<div class="gc-sub-meta" style="margin-top:8px"><i class="ti ti-lock"></i> Nothing sends until you approve it.</div>' +
        '<button class="gc-btn primary" data-act="approve" data-id="' + esc(id) + '" style="margin-top:12px">Approve &amp; send…</button>';
      el.querySelector('[data-act="approve"]').onclick = function () { m.close(); approveModal(id); };
    }).catch(function () { var el = m.el.querySelector('#gcSubReach'); if (el) el.innerHTML = '<div class="gc-empty">Could not reach the drafting service.</div>'; });
  }

  // THE APPROVAL-EFFECT MODAL — reads /api/gov/send-mode and tells the truth about what approving does.
  function approveModal(id) {
    var s = SUBS.find(function (x) { return x.id === id; }) || { id: id }, to = s.contact_email || '';
    function effect() {
      if (AUTO_SEND === true) return '<div class="gc-sub-effect send"><b>Auto-send is ON.</b> Approving will <b>really email</b> this outreach' + (to ? ' to <b>' + esc(to) + '</b>' : '') + ' from the Rodgate mailbox, right now.</div>';
      if (AUTO_SEND === false) return '<div class="gc-sub-effect dry"><b>Auto-send is OFF.</b> Approving records the decision and <b>dry-runs</b> — nothing actually leaves the building. Set <code>GOV_AUTO_SEND=1</code> when you want approvals to send for real.</div>';
      return '<div class="gc-sub-effect dry">Checking whether auto-send is on…</div>';
    }
    var m = modal('<div class="gc-sub-mhead"><b style="color:var(--ink)">Approve this outreach?</b><button class="gc-sub-mx" data-x><i class="ti ti-x"></i></button></div>' +
      '<div class="gc-sub-mbody"><div id="gcSubEffect">' + effect() + '</div><div class="gc-sub-meta">The gate stays the control — this only tells you the true effect before you tap.</div></div>' +
      '<div class="gc-sub-mfoot"><button class="gc-btn" data-x>Cancel</button><button class="gc-btn primary" data-go>' + (AUTO_SEND === false ? 'Approve (dry-run)' : 'Approve &amp; send') + '</button></div>');
    m.el.querySelector('[data-go]').onclick = function () {
      fetch('/api/sub-reach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
        .then(function (r) { return r.json(); }).then(function () { m.close(); load(); })
        .catch(function () { m.close(); alert('Could not send that — try again.'); });
    };
    if (AUTO_SEND === null) fetch('/api/gov/send-mode').then(function (r) { return r.json(); }).then(function (d) {
      AUTO_SEND = !!d.autoSend;
      var e = m.el.querySelector('#gcSubEffect'); if (e) e.innerHTML = effect();
      var go = m.el.querySelector('[data-go]'); if (go) go.innerHTML = AUTO_SEND ? 'Approve &amp; send' : 'Approve (dry-run)';
    }).catch(function () { AUTO_SEND = false; });
  }

  function load() {
    Promise.all([
      fetch('/api/operations').then(function (r) { return r.json(); }).catch(function () { return { crm: [] }; }),
      fetch('/api/gov/sub-ladder').then(function (r) { return r.json(); }).catch(function () { return { ladders: [] }; }),
      fetch('/api/gov/sub-pricing').then(function (r) { return r.json(); }).catch(function () { return { benchmarks: [] }; })
    ]).then(function (r) {
      SUBS = ((r[0] && r[0].crm) || []).filter(function (s) { return s && s.name && !/^SUB-EXAMPLE/i.test(s.id || ''); });
      LADDERS = (r[1] && r[1].ladders) || [];
      BENCH_PRICING = (r[2] && r[2].benchmarks) || [];
      render();
    });
  }

  function mount() {
    EL = $('gcSubs'); if (!EL) return;
    injectCss();
    EL.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var id = b.getAttribute('data-id'), a = b.getAttribute('data-act');
      if (a === 'detail') detail(id); else if (a === 'reach') reach(id);
    });
    load();
    setInterval(load, 60000);
  }
  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
