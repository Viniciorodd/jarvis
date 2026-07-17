/* govcon-subs.js — the SUBS section of the unified GovCon OS (U1d).
 *
 * WHY: the subcontractor UI was trapped in the legacy ops.js overlay (100KB, behind an "old Ops ↗" button
 * inside another overlay). It holds THREE things that exist nowhere else, and until they live here, ops.js
 * can't be deleted (U2):
 *   (a) the CRM sub drawer with the Google rating + review excerpts + Hector's fit verdict,
 *   (b) the sub-reach PREVIEW → send flow (the draft is shown BEFORE anything sends),
 *   (c) THE APPROVAL-EFFECT GATE MODAL — states what approving will ACTUALLY do.
 *
 * THE HONESTY FIX (the whole reason this file needed a server change): ops.js's old modal HEDGED — "it only
 * sends IF auto-send is on" — because GOV_AUTO_SEND was exposed nowhere. It is now (GET /api/gov/send-mode),
 * so this modal reads the real state and tells the truth: ON → approving really emails; OFF → it dry-runs and
 * nothing leaves the building. The gate is unchanged; only the WARNING is now honest.
 *
 * EXCLUSION STATE IS ALWAYS VISIBLE, never buried — including the "unverified, confirm at SAM.gov" case.
 * Register on window.GovConSections.subs. Own drawer element (do NOT reuse #gosOpp — govcon-opp owns it).
 */
(function () {
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function daysSince(iso) { if (!iso) return null; var t = Date.parse(iso); if (isNaN(t)) return null; return Math.floor((Date.now() - t) / 86400000); }

  var EL = null, SUBS = [], LADDERS = [], FILTER = '', AUTO_SEND = null;

  // one-time styles (existing vars only)
  function injectCss() {
    if (document.getElementById('gsubsCss')) return;
    var s = document.createElement('style'); s.id = 'gsubsCss';
    s.textContent = [
      '.gsub-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);z-index:70;display:flex;align-items:center;justify-content:center;padding:18px}',
      '.gsub-modal{background:var(--panel);border:1px solid var(--line);border-radius:16px;max-width:520px;width:100%;max-height:86vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.5)}',
      '.gsub-mhead{padding:16px 18px 10px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}',
      '.gsub-mbody{padding:16px 18px}.gsub-mfoot{padding:12px 18px 16px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}',
      '.gsub-effect{border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.55;margin-bottom:12px}',
      '.gsub-effect.send{background:rgba(var(--teal-rgb),.1);border:1px solid rgba(var(--teal-rgb),.35);color:var(--cream)}',
      '.gsub-effect.dry{background:rgba(240,180,92,.1);border:1px solid rgba(240,180,92,.32);color:var(--cream)}',
      '.gsub-ta{width:100%;box-sizing:border-box;min-height:150px;background:var(--ink2);border:1px solid var(--line);border-radius:10px;color:var(--cream);font:inherit;font-size:13px;padding:11px;resize:vertical}',
      '.gsub-excl{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:99px;display:inline-flex;align-items:center;gap:4px}',
      '.gsub-excl.clear{background:rgba(var(--teal-rgb),.14);color:var(--teal)}',
      '.gsub-excl.exc{background:rgba(255,143,128,.12);color:var(--err);border:1px solid rgba(255,143,128,.3)}',
      '.gsub-excl.unv{background:rgba(240,180,92,.1);color:var(--warn);border:1px solid rgba(240,180,92,.3)}'
    ].join('');
    document.head.appendChild(s);
  }

  function exclChip(sub) {
    var st = sub.exclusionStatus, at = sub.exclusionCheckedAt;
    if (st === 'excluded') return '<span class="gsub-excl exc"><i class="ti ti-ban"></i> Excluded — cannot subcontract</span>';
    if (st === 'clear') { var d = daysSince(at); return '<span class="gsub-excl clear"><i class="ti ti-shield-check"></i> SAM: clear' + (d != null ? ' (' + (d === 0 ? 'today' : d + 'd ago') : '') + ')</span>'; }
    return '<span class="gsub-excl unv"><i class="ti ti-alert-triangle"></i> Exclusion unverified — confirm at SAM.gov</span>';
  }
  function statusChip(sub) {
    var s = String(sub.status || 'prospect').toLowerCase();
    var lbl = s === 'contacted' ? 'Contacted' : s === 'responded' ? 'Responded' : s === 'declined' ? 'Declined' : 'Prospect';
    return '<span class="gos-chip">' + lbl + '</span>';
  }

  function render() {
    var q = FILTER.toLowerCase();
    var subs = SUBS.filter(function (s) { return !q || (s.name + ' ' + (s.trade || '') + ' ' + (s.location || '')).toLowerCase().indexOf(q) >= 0; });
    var waiting = LADDERS.filter(function (l) { return !l.closed; }).length;

    var h = '<div class="gos-secbar"><div><div class="gos-h2">Subcontractors</div>' +
      '<div class="gos-sub">' + SUBS.length + ' on the bench · ' + waiting + ' bid' + (waiting === 1 ? '' : 's') + ' waiting on a reply</div></div></div>';

    // The ladder panel — what's escalating
    if (LADDERS.length) {
      h += '<div class="gos-panel" style="margin-bottom:14px"><div class="gos-caps" style="color:var(--dim);margin-bottom:8px">Backup ladder</div>';
      h += LADDERS.filter(function (l) { return !l.closed; }).map(function (l) {
        var tiers = (l.tiers || []).map(function (t) {
          var d = daysSince(t.contactedAt);
          var st = t.status === 'responded' ? 'responded ✓' : t.status === 'excluded' ? '⛔ excluded' : t.contactedAt ? ('contacted' + (d != null ? ' ' + d + 'd ago' : '')) : 'pending';
          return '<b>' + esc(t.role || 'sub') + ':</b> ' + esc(t.name || '—') + ' — ' + st;
        }).join(' · ');
        return '<div class="gos-why" style="margin-bottom:5px">' + esc(l.trade || '') + ' — ' + tiers + '</div>';
      }).join('') || '<div class="gos-why">No open ladders.</div>';
      h += '<div class="gos-sub" style="margin-top:8px"><i class="ti ti-info-circle"></i> A backup only ever DRAFTS an email for your approval — it never sends on its own.</div></div>';
    }

    // The bench
    if (!subs.length) { h += '<div class="gos-empty">' + (FILTER ? 'No subs match that.' : 'No subcontractors on the bench yet. Hector adds them as opportunities need a trade.') + '</div>'; }
    else {
      h += '<div class="gos-grid">' + subs.map(function (s) {
        return '<div class="gos-panel" data-sub="' + esc(s.id) + '">' +
          '<div style="display:flex;justify-content:space-between;gap:8px"><div class="gos-h2">' + esc(s.name || '(unnamed)') + '</div></div>' +
          '<div class="gos-sub">' + esc(s.trade || 'facilities') + (s.location ? ' · ' + esc(s.location) : '') + '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:9px 0">' + statusChip(s) + exclChip(s) + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
            '<button class="gos-linkbtn pri" data-act="reach" data-id="' + esc(s.id) + '">Reach out</button>' +
            '<button class="gos-linkbtn" data-act="detail" data-id="' + esc(s.id) + '">Open detail</button>' +
          '</div></div>';
      }).join('') + '</div>';
    }
    EL.innerHTML = h;
  }

  // ── drawer (own element) ────────────────────────────────────────────────────────────────────────
  function drawer() {
    var d = document.getElementById('gsubDrawer');
    if (d) return d;
    var mask = document.createElement('div'); mask.id = 'gsubMask'; mask.className = 'gos-drawer-mask'; mask.hidden = true;
    d = document.createElement('aside'); d.id = 'gsubDrawer'; d.className = 'gos-drawer'; d.hidden = true;
    document.body.appendChild(mask); document.body.appendChild(d);
    mask.addEventListener('click', closeDrawer);
    d.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeDrawer(); });
    return d;
  }
  function closeDrawer() { var d = document.getElementById('gsubDrawer'), m = document.getElementById('gsubMask'); if (d) d.hidden = true; if (m) m.hidden = true; }
  function openDrawer(html) { var d = drawer(); d.innerHTML = html; d.hidden = false; document.getElementById('gsubMask').hidden = false; }

  function detail(id) {
    var s = SUBS.find(function (x) { return x.id === id; }) || { id: id };
    openDrawer('<div class="gos-dhead"><div style="display:flex;justify-content:space-between;align-items:start"><div><div class="gos-h2">' + esc(s.name || '') + '</div><div class="gos-sub">' + esc(s.trade || '') + (s.location ? ' · ' + esc(s.location) : '') + '</div></div><button class="gos-x" data-close><i class="ti ti-x"></i></button></div><div style="margin-top:8px">' + exclChip(s) + '</div></div>' +
      '<div class="gos-dbody" id="gsubDetail"><div class="gos-loading">Pulling Google reviews + Hector\'s read…</div></div>');
    fetch('/api/sub-info?id=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (d) {
      var el = document.getElementById('gsubDetail'); if (!el) return;
      var sub = d.sub || s, p = d.places, fit = d.fit, h = '';
      h += '<div class="gos-panel"><div class="gos-caps" style="color:var(--dim);margin-bottom:6px">Contact</div><div class="gos-why">' +
        [sub.contact_email, sub.phone, sub.website].filter(Boolean).map(esc).join('<br>') + (!(sub.contact_email || sub.phone || sub.website) ? 'No contact on file — Hector will try to find an email on reach-out.' : '') + '</div></div>';
      if (p && p.rating) {
        h += '<div class="gos-panel"><div class="gos-caps" style="color:var(--dim);margin-bottom:6px">Google · ' + p.rating + '★ (' + (p.total || 0) + ')</div>' +
          (p.reviews || []).map(function (rv) { return '<div class="gos-why" style="margin-bottom:8px">“' + esc((rv.text || '').slice(0, 220)) + '” — ' + esc(rv.author || 'anon') + (rv.rating ? ' (' + rv.rating + '★)' : '') + '</div>'; }).join('') + '</div>';
      } else { h += '<div class="gos-panel"><div class="gos-why">No Google rating found for this vendor.</div></div>'; }
      if (fit && fit.why) h += '<div class="gos-panel"><div class="gos-caps" style="color:var(--teal);margin-bottom:6px">Hector\'s fit verdict</div><div class="gos-why" style="color:var(--cream)">' + esc(fit.why) + '</div></div>';
      h += '<button class="gos-linkbtn pri" data-act="reach" data-id="' + esc(id) + '" style="margin-top:4px">Reach out to ' + esc(sub.name || 'them') + '</button>';
      el.innerHTML = h;
    }).catch(function () { var el = document.getElementById('gsubDetail'); if (el) el.innerHTML = '<div class="gos-empty">Could not load this sub\'s details.</div>'; });
  }

  // ── reach-out: PREVIEW the draft, then the honest gate modal ──────────────────────────────────────
  function reach(id) {
    var s = SUBS.find(function (x) { return x.id === id; }) || { id: id };
    openDrawer('<div class="gos-dhead"><div style="display:flex;justify-content:space-between"><div class="gos-h2">Reach out — ' + esc(s.name || '') + '</div><button class="gos-x" data-close><i class="ti ti-x"></i></button></div></div>' +
      '<div class="gos-dbody" id="gsubReach"><div class="gos-loading">Hector is drafting the teaming email…</div></div>');
    fetch('/api/sub-reach-preview?id=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (d) {
      var el = document.getElementById('gsubReach'); if (!el) return;
      if (d && d.error) { el.innerHTML = '<div class="gos-empty">Couldn\'t draft it: ' + esc(d.error) + '</div>'; return; }
      // be defensive about the shape — pick the first email-ish field
      var subj = d.subject || (d.email && d.email.subject) || '';
      var body = d.body || (d.email && d.email.body) || d.draft || d.text || d.preview || '';
      var to = d.to || (d.sub && d.sub.contact_email) || s.contact_email || '';
      el.innerHTML =
        '<div class="gos-panel"><div class="gos-caps" style="color:var(--dim);margin-bottom:6px">To</div><div class="gos-why">' + (to ? esc(to) : 'No email yet — Hector will enrich one before it can send.') + '</div></div>' +
        (subj ? '<div class="gos-panel"><div class="gos-caps" style="color:var(--dim);margin-bottom:6px">Subject</div><input class="gos-inp" id="gsubSubj" style="width:100%" value="' + esc(subj) + '"></div>' : '') +
        '<div class="gos-caps" style="color:var(--dim);margin:4px 0 6px">The draft — edit before you send</div>' +
        '<textarea class="gsub-ta" id="gsubBody">' + esc(body) + '</textarea>' +
        '<div class="gos-sub" style="margin-top:8px"><i class="ti ti-lock"></i> Nothing sends until you approve it.</div>' +
        '<button class="gos-linkbtn pri" data-act="approve" data-id="' + esc(id) + '" style="margin-top:12px">Approve &amp; send…</button>';
    }).catch(function () { var el = document.getElementById('gsubReach'); if (el) el.innerHTML = '<div class="gos-empty">Could not reach the drafting service.</div>'; });
  }

  // THE APPROVAL-EFFECT GATE MODAL — tells the TRUTH about what approving does (reads /api/gov/send-mode).
  function approveModal(id) {
    var s = SUBS.find(function (x) { return x.id === id; }) || { id: id };
    var to = (document.getElementById('gsubReach') && (s.contact_email || '')) || s.contact_email || '';
    var mask = document.createElement('div'); mask.className = 'gsub-modal-mask';
    function effectHtml() {
      if (AUTO_SEND === true) return '<div class="gsub-effect send"><b>Auto-send is ON.</b> Approving will <b>really email</b> this outreach' + (to ? ' to <b>' + esc(to) + '</b>' : '') + ' from the Rodgate mailbox, right now.</div>';
      if (AUTO_SEND === false) return '<div class="gsub-effect dry"><b>Auto-send is OFF.</b> Approving records the decision and <b>dry-runs</b> — nothing actually leaves the building. Set <code>GOV_AUTO_SEND=1</code> when you want approvals to send for real.</div>';
      return '<div class="gsub-effect dry">Checking whether auto-send is on…</div>';
    }
    mask.innerHTML = '<div class="gsub-modal"><div class="gsub-mhead"><b>Approve this outreach?</b><button class="gos-x" data-x><i class="ti ti-x"></i></button></div>' +
      '<div class="gsub-mbody" id="gsubEffect">' + effectHtml() + '<div class="gos-sub">The gate stays the control — this only tells you the true effect before you tap.</div></div>' +
      '<div class="gsub-mfoot"><button class="gos-linkbtn" data-x>Cancel</button><button class="gos-linkbtn pri" data-go>' + (AUTO_SEND === false ? 'Approve (dry-run)' : 'Approve &amp; send') + '</button></div></div>';
    document.body.appendChild(mask);
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.closest('[data-x]')) { document.body.removeChild(mask); return; }
      if (e.target.closest('[data-go]')) {
        fetch('/api/sub-reach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
          .then(function (r) { return r.json(); }).then(function () { document.body.removeChild(mask); closeDrawer(); load(); })
          .catch(function () { document.body.removeChild(mask); alert('Could not send that — try again.'); });
      }
    });
    if (AUTO_SEND === null) fetch('/api/gov/send-mode').then(function (r) { return r.json(); }).then(function (d) {
      AUTO_SEND = !!d.autoSend; var e = document.getElementById('gsubEffect'); if (e) e.querySelector('.gsub-effect').outerHTML = effectHtml();
      var go = mask.querySelector('[data-go]'); if (go) go.innerHTML = AUTO_SEND ? 'Approve &amp; send' : 'Approve (dry-run)';
    }).catch(function () { AUTO_SEND = false; });
  }

  function onClick(e) {
    var b = e.target.closest('[data-act]'); if (!b) { var card = e.target.closest('[data-sub]'); if (card && !e.target.closest('button')) detail(card.getAttribute('data-sub')); return; }
    var id = b.getAttribute('data-id'), a = b.getAttribute('data-act');
    if (a === 'detail') return detail(id);
    if (a === 'reach') return reach(id);
    if (a === 'approve') return approveModal(id);
  }

  function load() {
    Promise.all([
      fetch('/api/operations').then(function (r) { return r.json(); }).catch(function () { return { crm: [] }; }),
      fetch('/api/gov/sub-ladder').then(function (r) { return r.json(); }).catch(function () { return { ladders: [] }; })
    ]).then(function (r) {
      SUBS = (r[0] && r[0].crm || []).filter(function (s) { return s && s.name && !/^SUB-EXAMPLE/i.test(s.id || ''); });
      LADDERS = (r[1] && r[1].ladders) || [];
      render();
    });
  }

  window.GovConSections = window.GovConSections || {};
  window.GovConSections.subs = {
    mount: function (el) { EL = el; injectCss(); el.addEventListener('click', onClick); el.innerHTML = '<div class="gos-loading">Loading the bench…</div>'; load(); },
    refresh: load,
    filter: function (q) { FILTER = q || ''; render(); }
  };
})();
