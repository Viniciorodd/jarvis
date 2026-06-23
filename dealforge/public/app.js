// DealForge SPA — vanilla ES modules, no build step. Imports the SAME engine the evals
// proved, served from /engine. Server is the source of truth (cloud sync); a thin client
// cache keeps the UI snappy.

import { computeFlip } from "/engine/flip-brrrr.js";
import { computeRental } from "/engine/rental.js";
import { computeWholesale } from "/engine/wholesale.js";
import { rehabEstimate } from "/engine/rehab.js";
import { CRM_STAGES } from "/engine/defaults.js";

// ───────────────────────── API client ─────────────────────────
const TOKEN_KEY = "dealforge.token";
let token = localStorage.getItem(TOKEN_KEY) || null;

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

const API = {
  register: (b) => api("/auth/register", { method: "POST", body: b }),
  login: (b) => api("/auth/login", { method: "POST", body: b }),
  me: () => api("/auth/me"),
  brand: () => fetch("/api/brand").then((r) => r.json()),
  list: (col, q = "") => api(`/${col}${q}`),
  create: (col, b) => api(`/${col}`, { method: "POST", body: b }),
  update: (col, id, b) => api(`/${col}/${id}`, { method: "PUT", body: b }),
  remove: (col, id) => api(`/${col}/${id}`, { method: "DELETE" }),
  upload: (dataUrl, filename) => api("/uploads", { method: "POST", body: { dataUrl, filename } })
};

// ───────────────────────── State ─────────────────────────
const state = {
  brand: null,
  user: null,
  deals: [],
  lenders: [],
  expenses: [],
  route: "deals"
};

// ───────────────────────── Helpers ─────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const app = () => document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n || 0)).toLocaleString();
const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => `${((n || 0) * 100).toFixed(1)}%`;
const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
const cls = (n) => (n >= 0 ? "pos" : "neg");

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const TYPE_LABELS = { flip: "Fix & Flip / BRRRR", rental: "Rental / Hold", wholesale: "Wholesale" };

// ───────────────────────── Boot ─────────────────────────
async function boot() {
  state.brand = await API.brand().catch(() => ({ productName: "DealForge", logoText: "DF", accent: "#5b8cff" }));
  document.documentElement.style.setProperty("--accent", state.brand.accent || "#5b8cff");
  // Theme: ?theme= (used when embedded in JARVIS) wins over saved pref; light vs dark.
  const urlTheme = new URLSearchParams(location.search).get("theme");
  const savedTheme = (urlTheme === "light" || urlTheme === "dark")
    ? urlTheme
    : localStorage.getItem("dealforge.theme");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  if (new URLSearchParams(location.search).get("embed") === "1") {
    document.documentElement.setAttribute("data-embed", "1");
  }
  document.title = state.brand.productName || "DealForge";

  if (token) {
    try {
      const { user } = await API.me();
      state.user = user;
      await loadAll();
    } catch {
      token = null; localStorage.removeItem(TOKEN_KEY);
    }
  }
  window.addEventListener("hashchange", render);
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

async function loadAll() {
  const [d, l, e] = await Promise.all([
    API.list("deals"), API.list("lenders"), API.list("expenses")
  ]);
  state.deals = d.items; state.lenders = l.items; state.expenses = e.items;
}

function logout() {
  token = null; localStorage.removeItem(TOKEN_KEY); state.user = null;
  location.hash = ""; render();
}

// ───────────────────────── Render root ─────────────────────────
function render() {
  if (!state.user) return renderAuth();
  const hash = location.hash.replace(/^#\/?/, "");
  const [route, ...rest] = hash.split("/");
  state.route = route || "deals";
  const NAV = [
    ["deals", "🏠", "Deals"],
    ["lenders", "🏦", "Lenders"],
    ["pipeline", "📊", "Pipeline"],
    ["expenses", "🧾", "Expenses"],
    ["archive", "📦", "Archive"],
    ["settings", "⚙️", "Settings"]
  ];
  const b = state.brand;
  const initials = (state.user.name || state.user.email || "?").slice(0, 2).toUpperCase();

  app().className = "app";
  app().innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="logo">${esc(b.logoText || "DF")}</div>
          <div><div class="bname">${esc(b.productName || "DealForge")}</div>
          <div class="btag">${esc(b.tagline || "")}</div></div>
        </div>
        ${NAV.map(([r, i, l]) => `<button class="nav-item ${state.route === r ? "active" : ""}" data-go="${r}"><span class="ico">${i}</span>${l}</button>`).join("")}
        <div class="spacer"></div>
        <div class="user-chip">
          <div class="av">${esc(initials)}</div>
          <div class="um"><b>${esc(state.user.name || "Account")}</b><span>${esc(state.user.email)}</span></div>
        </div>
        <button class="nav-item" data-action="logout"><span class="ico">↩</span>Sign out</button>
      </aside>
      <main class="main" id="view"></main>
    </div>
    <div class="mobile-tabbar">
      ${NAV.slice(0, 5).map(([r, i, l]) => `<button class="${state.route === r ? "active" : ""}" data-go="${r}"><span class="ico">${i}</span>${l}</button>`).join("")}
    </div>`;

  app().querySelectorAll("[data-go]").forEach((el) => el.onclick = () => { location.hash = `#/${el.dataset.go}`; });
  app().querySelectorAll('[data-action="logout"]').forEach((el) => el.onclick = logout);

  const view = $("#view");
  if (route === "deal") return renderDealEditor(view, rest[0]);
  if (route === "lenders") return renderLenders(view);
  if (route === "pipeline") return renderPipeline(view);
  if (route === "expenses") return renderExpenses(view);
  if (route === "archive") return renderDeals(view, true);
  if (route === "settings") return renderSettings(view);
  return renderDeals(view, false);
}

// ───────────────────────── Auth view ─────────────────────────
let authMode = "login";
function renderAuth() {
  const b = state.brand || {};
  app().className = "app";
  app().innerHTML = `
    <div class="auth-wrap"><div class="auth-card">
      <div class="brand"><div class="logo">${esc(b.logoText || "DF")}</div>
        <div><div class="bname">${esc(b.productName || "DealForge")}</div>
        <div class="btag">${esc(b.tagline || "Underwrite. Track. Close.")}</div></div></div>
      <div class="panel">
        <div id="autherr"></div>
        ${authMode === "register" ? `<div class="field"><label>Name</label><input id="a-name" placeholder="Your name" autocomplete="name"></div>` : ""}
        <div class="field"><label>Email</label><input id="a-email" type="email" placeholder="you@example.com" autocomplete="email"></div>
        <div class="field"><label>Password</label><input id="a-pass" type="password" placeholder="••••••••" autocomplete="${authMode === "register" ? "new-password" : "current-password"}"></div>
        <button class="btn primary" id="a-submit" style="width:100%; justify-content:center; margin-top:6px;">
          ${authMode === "register" ? "Create account" : "Sign in"}</button>
        <div class="auth-switch">
          ${authMode === "register" ? "Already have an account? <a id=a-toggle>Sign in</a>" : "New here? <a id=a-toggle>Create an account</a>"}
        </div>
      </div>
    </div></div>`;

  $("#a-toggle").onclick = () => { authMode = authMode === "login" ? "register" : "login"; renderAuth(); };
  const submit = async () => {
    const email = $("#a-email").value.trim();
    const password = $("#a-pass").value;
    const name = $("#a-name")?.value.trim();
    try {
      const r = authMode === "register"
        ? await API.register({ email, password, name })
        : await API.login({ email, password });
      token = r.token; localStorage.setItem(TOKEN_KEY, token);
      state.user = r.user;
      await loadAll();
      location.hash = "#/deals"; render();
    } catch (err) {
      $("#autherr").innerHTML = `<div class="err">${esc(err.message)}</div>`;
    }
  };
  $("#a-submit").onclick = submit;
  $("#a-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
}

// ───────────────────────── Deals list ─────────────────────────
function renderDeals(view, archived) {
  const list = state.deals.filter((d) => !!d.archived === archived);
  view.innerHTML = `
    <div class="page-head">
      <div><h1>${archived ? "Archive" : "Deals"}</h1>
        <div class="sub">${list.length} ${archived ? "archived" : "active"} ${list.length === 1 ? "deal" : "deals"}</div></div>
      ${archived ? "" : `<button class="btn primary" id="new-deal">＋ New Deal</button>`}
    </div>
    ${list.length ? `<div class="grid deals-grid">${list.map(dealCard).join("")}</div>` : emptyState(archived ? "📦" : "🏠", archived ? "Nothing archived yet" : "No deals yet", archived ? "Archived deals will appear here." : "Analyze your first property to get started.")}
  `;
  $("#new-deal") && ($("#new-deal").onclick = () => newDealFlow());
  view.querySelectorAll("[data-deal]").forEach((el) => el.onclick = () => { location.hash = `#/deal/${el.dataset.deal}`; });
}

function dealCard(d) {
  const snap = d.snapshot || {};
  let metric = "—", label = "Metric";
  if (d.type === "flip") { metric = money(snap.netProfit); label = "Net Profit"; }
  else if (d.type === "rental") { metric = money2(snap.cashFlowMonthly || 0) + "/mo"; label = "Cash Flow"; }
  else if (d.type === "wholesale") { metric = money(snap.maxAllowableOffer); label = "Max Offer"; }
  const img = (d.images && d.images[0]) || null;
  const metricCls = (d.type === "flip" && snap.netProfit < 0) || (d.type === "rental" && (snap.cashFlowMonthly || 0) < 0) ? "neg" : "";
  return `
    <div class="card deal-card" data-deal="${d.id}">
      <div class="thumb">
        ${img ? `<img src="${esc(img)}" alt="">` : `<div class="noimg">🏚️</div>`}
        <span class="badge ${d.type} badge-abs">${esc((TYPE_LABELS[d.type] || d.type).split(" ")[0])}</span>
      </div>
      <div class="body">
        <div class="addr">${esc(d.address || "Untitled deal")}</div>
        <div class="meta">
          <div><div class="metric-label">${label}</div><div class="metric ${metricCls}">${metric}</div></div>
          ${d.status ? `<span class="badge">${esc(d.status)}</span>` : ""}
        </div>
      </div>
    </div>`;
}

function emptyState(icon, title, sub) {
  return `<div class="empty"><div class="big">${icon}</div><h2 style="margin:0 0 6px">${esc(title)}</h2><p>${esc(sub)}</p></div>`;
}

async function newDealFlow() {
  openModal({
    title: "New Deal",
    body: `<div class="field"><label>Strategy</label>
      <div class="seg" id="nd-type" style="display:flex; width:100%">
        <button class="on" data-t="flip" style="flex:1">Fix &amp; Flip / BRRRR</button>
        <button data-t="rental" style="flex:1">Rental</button>
        <button data-t="wholesale" style="flex:1">Wholesale</button>
      </div></div>
      <div class="field"><label>Property address</label><input id="nd-addr" placeholder="123 Main St, Scranton, PA"></div>`,
    okText: "Create",
    onOk: async (close) => {
      const type = $("#nd-type .on")?.dataset.t || "flip";
      const address = $("#nd-addr").value.trim();
      const { item } = await API.create("deals", {
        type, address, status: "New Lead", archived: false, images: [], inputs: defaultsFor(type), snapshot: {}
      });
      state.deals.push(item);
      close();
      location.hash = `#/deal/${item.id}`;
    }
  });
  document.querySelectorAll("#nd-type button").forEach((b) => b.onclick = () => {
    document.querySelectorAll("#nd-type button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
  });
}

function defaultsFor(type) {
  if (type === "flip") return { purchasePrice: "", rehabCost: "", arv: "", taxes: "", insurancePremium: "", utilitiesMonthly: "", flipMonths: 5, beds: "", baths: "", sqft: "", yearBuilt: "" };
  if (type === "rental") return { purchasePrice: "", units: [{ name: "Unit 1", monthlyRent: "" }], insuranceMonthly: "", taxesMonthly: "", utilitiesOwnerMonthly: "", trashMonthly: "", waterSewerMonthly: "", rehabCost: "", arv: "" };
  return { arv: "", rehabCost: "", assignmentFeePct: 0.15, sqft: "" };
}

// ───────────────────────── Deal editor ─────────────────────────
function renderDealEditor(view, id) {
  const deal = state.deals.find((d) => d.id === id);
  if (!deal) { view.innerHTML = emptyState("❓", "Deal not found", "It may have been deleted."); return; }
  deal.inputs = deal.inputs || defaultsFor(deal.type);

  view.innerHTML = `
    <div class="page-head">
      <div>
        <a class="sub" data-back style="cursor:pointer">← Deals</a>
        <h1 style="margin-top:6px">${esc(deal.address || "Untitled deal")}</h1>
        <div class="sub">${esc(TYPE_LABELS[deal.type] || deal.type)}</div>
      </div>
      <div class="toolbar">
        <select id="d-status" class="btn" style="width:auto">
          ${CRM_STAGES.map((s) => `<option ${deal.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
        <button class="btn" id="d-archive">${deal.archived ? "Unarchive" : "Archive"}</button>
        <button class="btn danger" id="d-del">Delete</button>
        <button class="btn primary" id="d-save">Save</button>
      </div>
    </div>
    <div class="editor">
      <div id="edit-form"></div>
      <div class="results" id="results"></div>
    </div>`;

  $("[data-back]").onclick = () => { location.hash = "#/deals"; };
  $("#d-status").onchange = (e) => { deal.status = e.target.value; };
  $("#d-archive").onclick = async () => {
    deal.archived = !deal.archived;
    await API.update("deals", deal.id, { archived: deal.archived });
    toast(deal.archived ? "Archived" : "Restored");
    location.hash = deal.archived ? "#/archive" : "#/deals";
  };
  $("#d-del").onclick = async () => {
    if (!confirm("Delete this deal permanently?")) return;
    await API.remove("deals", deal.id);
    state.deals = state.deals.filter((x) => x.id !== deal.id);
    location.hash = "#/deals";
  };
  $("#d-save").onclick = async () => {
    recompute(deal);
    const { item } = await API.update("deals", deal.id, {
      address: deal.address, status: deal.status, lenderId: deal.lenderId,
      inputs: deal.inputs, snapshot: deal.snapshot, images: deal.images, notes: deal.notes,
      type: deal.type
    });
    Object.assign(deal, item);
    toast("Saved ✓");
  };

  renderEditForm(deal);
}

function field(label, id, val, opts = {}) {
  const money = opts.money;
  const input = `<input id="${id}" value="${esc(val ?? "")}" placeholder="${esc(opts.ph || "")}" ${opts.type ? `type="${opts.type}"` : ""} inputmode="${opts.inputmode || (money ? "decimal" : "text")}">`;
  return `<div class="field"><label>${esc(label)}</label>${money ? `<div class="input-money">${input}</div>` : input}${opts.hint ? `<div class="hint">${esc(opts.hint)}</div>` : ""}</div>`;
}

function renderEditForm(deal) {
  const form = $("#edit-form");
  const I = deal.inputs;
  const lenderOpts = `<option value="">— none / manual —</option>` +
    state.lenders.map((l) => `<option value="${l.id}" ${deal.lenderId === l.id ? "selected" : ""}>${esc(l.name)}${l.terms?.rate ? ` · ${pct(l.terms.rate)}` : ""}</option>`).join("");

  if (deal.type === "flip") {
    form.innerHTML = `
      <div class="panel"><h3><span class="dot"></span>Property</h3>
        ${field("Address", "i-address", deal.address, { ph: "123 Main St" })}
        <div class="row3">
          ${field("Beds", "i-beds", I.beds)}${field("Baths", "i-baths", I.baths)}${field("Sq Ft", "i-sqft", I.sqft)}
        </div>
        ${field("Year built", "i-yearBuilt", I.yearBuilt)}
        ${imageStripHTML(deal)}
      </div>
      <div class="panel"><h3><span class="dot"></span>Deal Inputs</h3>
        <div class="row2">
          ${field("Purchase price", "i-purchasePrice", I.purchasePrice, { money: 1 })}
          ${field("ARV (after-repair value)", "i-arv", I.arv, { money: 1 })}
        </div>
        <div class="row2">
          ${field("Rehab cost", "i-rehabCost", I.rehabCost, { money: 1, hint: rehabHint(I.sqft) })}
          ${field("Flip time (months)", "i-flipMonths", I.flipMonths)}
        </div>
        <div class="row3">
          ${field("Annual taxes", "i-taxes", I.taxes, { money: 1 })}
          ${field("Insurance (annual)", "i-insurancePremium", I.insurancePremium, { money: 1 })}
          ${field("Utilities /mo", "i-utilitiesMonthly", I.utilitiesMonthly, { money: 1 })}
        </div>
      </div>
      <div class="panel"><h3><span class="dot"></span>Financing — Hard Money</h3>
        <div class="field"><label>Lender preset</label><select id="i-lender">${lenderOpts}</select>
          <div class="hint">Pick a lender to auto-fill its rate &amp; terms.</div></div>
        <div class="row3">
          ${field("Down payment %", "a-downPaymentPctOfProjectCost", asPct(I.a?.downPaymentPctOfProjectCost, 10), { hint: "% of project cost" })}
          ${field("Interest rate %", "a-hmlInterestRate", asPct(I.a?.hmlInterestRate, 8.5))}
          ${field("Points %", "a-pointsPct", asPct(I.a?.pointsPct, 3.5))}
        </div>
      </div>`;
  } else if (deal.type === "rental") {
    form.innerHTML = `
      <div class="panel"><h3><span class="dot"></span>Property</h3>
        ${field("Address", "i-address", deal.address, { ph: "9-11 Robert St" })}
        ${imageStripHTML(deal)}
      </div>
      <div class="panel"><h3><span class="dot"></span>Rent Roll</h3>
        <div id="units"></div>
        <button class="btn sm" id="add-unit" style="margin-top:8px">＋ Add unit</button>
      </div>
      <div class="panel"><h3><span class="dot"></span>Purchase &amp; Expenses</h3>
        ${field("Purchase price", "i-purchasePrice", I.purchasePrice, { money: 1 })}
        <div class="row3">
          ${field("Taxes /mo", "i-taxesMonthly", I.taxesMonthly, { money: 1 })}
          ${field("Insurance /mo", "i-insuranceMonthly", I.insuranceMonthly, { money: 1 })}
          ${field("Owner utils /mo", "i-utilitiesOwnerMonthly", I.utilitiesOwnerMonthly, { money: 1 })}
        </div>
        <div class="row2">
          ${field("Trash /mo", "i-trashMonthly", I.trashMonthly, { money: 1 })}
          ${field("Water/Sewer /mo", "i-waterSewerMonthly", I.waterSewerMonthly, { money: 1 })}
        </div>
      </div>
      <div class="panel"><h3><span class="dot"></span>Financing</h3>
        <div class="field"><label>Lender preset</label><select id="i-lender">${lenderOpts}</select></div>
        <div class="row3">
          ${field("LTV %", "a-loanLtv", asPct(I.a?.loanLtv, 80))}
          ${field("Rate %", "a-loanRate", asPct(I.a?.loanRate, 7.25))}
          ${field("Term (yrs)", "a-loanTermYears", I.a?.loanTermYears ?? 30)}
        </div>
      </div>`;
    renderUnits(deal);
    $("#add-unit").onclick = () => { I.units = I.units || []; I.units.push({ name: `Unit ${I.units.length + 1}`, monthlyRent: "" }); renderUnits(deal); recompute(deal); renderResults(deal); };
  } else { // wholesale
    form.innerHTML = `
      <div class="panel"><h3><span class="dot"></span>Property</h3>
        ${field("Address", "i-address", deal.address, { ph: "123 Main St" })}
        ${field("Sq Ft", "i-sqft", I.sqft, { hint: rehabHint(I.sqft) })}
        ${imageStripHTML(deal)}
      </div>
      <div class="panel"><h3><span class="dot"></span>Wholesale Inputs</h3>
        <div class="row2">
          ${field("ARV", "i-arv", I.arv, { money: 1 })}
          ${field("Rehab cost", "i-rehabCost", I.rehabCost, { money: 1 })}
        </div>
        ${field("Assignment fee %", "a-assignmentFeePct", asPct(I.assignmentFeePct, 15), { hint: "Your target profit as % of ARV" })}
      </div>`;
  }

  // wire inputs
  form.querySelectorAll("input, select").forEach((el) => {
    const handler = () => onFieldChange(deal, el);
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  });
  bindImageStrip(deal);
  if ($("#i-lender")) $("#i-lender").onchange = (e) => applyLender(deal, e.target.value);

  recompute(deal);
  renderResults(deal);
}

function asPct(v, dflt) { return v == null || v === "" ? dflt : +(v * 100).toFixed(4); }
function rehabHint(sqft) {
  const s = num(sqft);
  if (!s) return "Enter sq ft for tier estimates";
  const e = rehabEstimate(s);
  const t = e.tiers.map((x) => `${x.label} $${(x.low / 1000).toFixed(0)}–${(x.high / 1000).toFixed(0)}k`).join(" · ");
  return t;
}

function renderUnits(deal) {
  const wrap = $("#units"); if (!wrap) return;
  const units = deal.inputs.units || [];
  wrap.innerHTML = units.map((u, i) => `
    <div class="row2" style="align-items:end">
      <div class="field" style="margin-bottom:8px"><label>${i === 0 ? "Unit / tenant" : ""}</label><input data-unit="${i}" data-uf="name" value="${esc(u.name || "")}" placeholder="Unit ${i + 1}"></div>
      <div class="field" style="margin-bottom:8px"><label>${i === 0 ? "Monthly rent" : ""}</label><div class="input-money"><input data-unit="${i}" data-uf="monthlyRent" value="${esc(u.monthlyRent ?? "")}" inputmode="decimal"></div></div>
    </div>`).join("");
  wrap.querySelectorAll("input").forEach((el) => el.addEventListener("input", () => {
    const i = +el.dataset.unit; deal.inputs.units[i][el.dataset.uf] = el.value; recompute(deal); renderResults(deal);
  }));
}

function onFieldChange(deal, el) {
  const id = el.id;
  if (id === "i-address") { deal.address = el.value; }
  else if (id.startsWith("i-")) { deal.inputs[id.slice(2)] = el.value; }
  else if (id.startsWith("a-")) {
    deal.inputs.a = deal.inputs.a || {};
    const key = id.slice(2);
    // percentage inputs are entered as whole numbers (8.5 => 0.085); years stay as-is
    deal.inputs.a[key] = key.endsWith("Years") ? num(el.value) : num(el.value) / 100;
  }
  if (id === "i-assignmentFeePct") deal.inputs.assignmentFeePct = num(el.value) / 100;
  recompute(deal);
  renderResults(deal);
}

function applyLender(deal, lenderId) {
  deal.lenderId = lenderId || null;
  const l = state.lenders.find((x) => x.id === lenderId);
  deal.inputs.a = deal.inputs.a || {};
  if (l && l.terms) {
    const t = l.terms;
    if (deal.type === "flip") {
      if (t.downPct != null) deal.inputs.a.downPaymentPctOfProjectCost = t.downPct;
      if (t.rate != null) deal.inputs.a.hmlInterestRate = t.rate;
      if (t.pointsPct != null) deal.inputs.a.pointsPct = t.pointsPct;
      if (t.termMonths != null) deal.inputs.a.hmlTermMonths = t.termMonths;
      if (t.ltc != null) deal.inputs.a.ltcMax = t.ltc;
    } else if (deal.type === "rental") {
      if (t.ltv != null) deal.inputs.a.loanLtv = t.ltv;
      if (t.rate != null) deal.inputs.a.loanRate = t.rate;
    }
  }
  renderEditForm(deal); // re-render to reflect auto-filled values
}

// ── compute + results ──
function recompute(deal) {
  const I = deal.inputs;
  const a = I.a || {};
  if (deal.type === "flip") {
    const r = computeFlip(I, a);
    deal.computed = r;
    deal.snapshot = { netProfit: r.flipExit.netProfit, roi: r.flipExit.roi, maxOffer70: r.maxOffer.maxOffer70, isDeal: r.flipExit.isDeal };
  } else if (deal.type === "rental") {
    const r = computeRental(I, a);
    deal.computed = r;
    deal.snapshot = { cashFlowMonthly: r.ratios.cashFlowAfterReservesMonthly, dscr: r.ratios.dscr, capRate: r.ratios.capRateAtPurchase };
  } else {
    const r = computeWholesale(I, { assignmentFeePct: I.assignmentFeePct });
    deal.computed = r;
    deal.snapshot = { maxAllowableOffer: r.maxAllowableOffer, buyerPrice: r.buyerPrice, assignmentFee: r.assignmentFee };
  }
}

function statRow(k, v, opts = {}) {
  return `<div class="stat-row"><span class="k">${esc(k)}</span><span class="v ${opts.cls || ""} ${opts.big ? "big" : ""}">${v}</span></div>`;
}

function renderResults(deal) {
  const el = $("#results"); if (!el) return;
  const c = deal.computed;
  if (deal.type === "flip") el.innerHTML = flipResults(c);
  else if (deal.type === "rental") el.innerHTML = rentalResults(c);
  else el.innerHTML = wholesaleResults(c);
}

function flipResults(c) {
  const e = c.flipExit, l = c.loan, co = c.costs, mo = c.maxOffer, br = c.brrrExit, al = c.allocation;
  return `
    <div class="panel">
      <div class="verdict ${e.isDeal ? "go" : "no"}">${e.isDeal ? "✅ Deal — at/under 70% rule" : "🚫 Not a deal — over 70% max offer"}</div>
      <div class="stat-hero"><div class="label">Net Profit (flip exit)</div><div class="num ${cls(e.netProfit)}">${money(e.netProfit)}</div></div>
      <div class="row2">
        <div class="stat-hero"><div class="label">ROI</div><div class="num" style="font-size:24px">${pct(e.roi)}</div></div>
        <div class="stat-hero"><div class="label">Return on ARV</div><div class="num" style="font-size:24px">${pct(e.returnOnArv)}</div></div>
      </div>
    </div>
    <div class="panel"><h3><span class="dot"></span>Max Offer</h3>
      ${statRow("70% rule max offer", money(mo.maxOffer70), { big: 1 })}
      ${statRow("Max expense allowed (70% ARV)", money(mo.maxExpenseAllowed))}
      ${statRow("Target profit (15% ARV)", money(mo.targetProfit))}
    </div>
    <div class="panel"><h3><span class="dot"></span>Hard Money Loan</h3>
      ${statRow("Project cost", money(l.projectCost))}
      ${statRow("Down payment", money(l.downPayment))}
      ${statRow("Loan amount", money(l.loanAmount))}
      ${statRow("Monthly interest", money(l.monthlyInterest))}
      ${statRow("Interest during hold", money(l.interestDuringHold))}
    </div>
    <div class="panel"><h3><span class="dot"></span>Cash to Close</h3>
      ${statRow("Points", money(co.points))}
      ${statRow("Brokerage", money(co.brokerage))}
      ${statRow("Title / closing", money(co.titleBuy))}
      ${statRow("Cost to purchase", money(co.costToPurchase))}
      ${statRow("Total cash outflow", money(co.totalCashOutflow), { big: 1 })}
    </div>
    <div class="panel"><h3><span class="dot"></span>BRRRR Refinance Exit</h3>
      ${statRow("Refi loan (75% ARV)", money(br.refiLoan))}
      ${statRow("After loan repaying", money(br.afterLoanRepaying), { cls: cls(br.afterLoanRepaying) })}
      ${statRow("Cash left in deal", money(br.cashLeftInDeal))}
    </div>
    <div class="panel"><h3><span class="dot"></span>Sale Price → Profit</h3>
      <table class="mini-table"><thead><tr><th>Sale price</th><th>Profit</th></tr></thead><tbody>
        ${c.ladder.map((r) => `<tr><td>${money(r.salePrice)}</td><td class="${cls(r.profit)}">${money(r.profit)}</td></tr>`).join("")}
      </tbody></table>
    </div>
    <div class="panel"><h3><span class="dot"></span>After the Deal — Profit Allocation</h3>
      ${statRow("Taxes (35%)", money(al.taxes))}
      ${statRow("Reinvest (25%)", money(al.reinvest))}
      ${statRow("Owner pay & savings (15%)", money(al.ownerPay))}
      ${statRow("Long-term (5%)", money(al.longTerm))}
      ${statRow("Marketing (10%)", money(al.marketing))}
      ${statRow("Emergency / debt (10%)", money(al.emergency))}
    </div>`;
}

function rentalResults(c) {
  const r = c.ratios, d = c.debt, n = c.noi;
  const cf = r.cashFlowAfterReservesMonthly;
  return `
    <div class="panel">
      <div class="stat-hero"><div class="label">Monthly Cash Flow (after reserves)</div><div class="num ${cls(cf)}">${money2(cf)}</div></div>
      <div class="row2">
        <div class="stat-hero"><div class="label">DSCR</div><div class="num" style="font-size:24px; color:${r.dscr >= 1 ? "var(--good)" : "var(--bad)"}">${r.dscr.toFixed(2)}</div></div>
        <div class="stat-hero"><div class="label">Cap Rate</div><div class="num" style="font-size:24px">${pct(r.capRateAtPurchase)}</div></div>
      </div>
    </div>
    <div class="panel"><h3><span class="dot"></span>Income &amp; NOI</h3>
      ${statRow("Gross rent /mo", money2(c.income.grossRentMonthly))}
      ${statRow("Operating expenses /mo", money2(c.expenses.directExpensesMonthly))}
      ${statRow("NOI /mo (before reserves)", money2(n.monthly), { big: 1 })}
      ${statRow("NOI /yr", money2(n.annual))}
    </div>
    <div class="panel"><h3><span class="dot"></span>Debt</h3>
      ${statRow("Loan amount", money(d.loanAmount))}
      ${statRow("Monthly P&I", money2(d.monthlyPayment))}
      ${statRow("First-month interest", money2(d.firstMonthInterest))}
    </div>
    <div class="panel"><h3><span class="dot"></span>Cap-Rate Valuation</h3>
      <table class="mini-table"><thead><tr><th>Cap rate</th><th>Value</th></tr></thead><tbody>
        ${c.capValuation.map((v) => `<tr><td>${pct(v.capRate)}</td><td>${money(v.value)}</td></tr>`).join("")}
      </tbody></table>
    </div>
    <div class="panel"><h3><span class="dot"></span>Cash to Close</h3>
      ${statRow("Down payment", money(c.cashToClose.downPayment))}
      ${statRow("Title / bank / brokerage", money(c.cashToClose.titleClosing + c.cashToClose.bankFees + c.cashToClose.brokerage))}
      ${statRow("Reserves", money(c.cashToClose.mxReserves))}
      ${statRow("Total cash to close", money(c.cashToClose.total), { big: 1 })}
    </div>
    <div class="panel"><h3><span class="dot"></span>Appreciation (3%/yr)</h3>
      <table class="mini-table"><thead><tr><th>Year</th><th>Value</th></tr></thead><tbody>
        ${c.appreciation.map((a) => `<tr><td>${a.year === 0 ? "Today" : "Year " + a.year}</td><td>${money(a.value)}</td></tr>`).join("")}
      </tbody></table>
    </div>`;
}

function wholesaleResults(c) {
  return `
    <div class="panel">
      <div class="stat-hero"><div class="label">Maximum Allowable Offer</div><div class="num">${money(c.maxAllowableOffer)}</div></div>
      <div class="row2">
        <div class="stat-hero"><div class="label">Assignment Fee</div><div class="num" style="font-size:22px">${money(c.assignmentFee)}</div></div>
        <div class="stat-hero"><div class="label">Buyer's Price</div><div class="num" style="font-size:22px">${money(c.buyerPrice)}</div></div>
      </div>
    </div>
    <div class="panel"><h3><span class="dot"></span>Assignment Profit Ladder</h3>
      <table class="mini-table"><thead><tr><th>Assignment price</th><th>Your profit</th></tr></thead><tbody>
        ${c.ladder.map((r) => `<tr><td>${money(r.assignmentPrice)}</td><td class="${cls(r.profit)}">${money(r.profit)}</td></tr>`).join("")}
      </tbody></table>
    </div>`;
}

// ───────────────────────── Images ─────────────────────────
function imageStripHTML(deal) {
  const imgs = deal.images || [];
  return `<div class="field"><label>Photos</label><div class="img-strip" id="img-strip">
    ${imgs.map((u, i) => `<div class="img-thumb"><img src="${esc(u)}"><button class="rm" data-rm="${i}">✕</button></div>`).join("")}
    <label class="img-add">＋<input type="file" accept="image/*" id="img-input" hidden multiple></label>
  </div></div>`;
}
function bindImageStrip(deal) {
  const input = $("#img-input");
  if (input) input.onchange = async (e) => {
    for (const file of e.target.files) {
      try {
        const dataUrl = await fileToDataUrl(file);
        const { url } = await API.upload(dataUrl, file.name);
        deal.images = deal.images || []; deal.images.push(url);
      } catch (err) { toast("Upload failed: " + err.message); }
    }
    await API.update("deals", deal.id, { images: deal.images });
    renderEditForm(deal);
  };
  document.querySelectorAll("[data-rm]").forEach((b) => b.onclick = async (ev) => {
    ev.preventDefault();
    deal.images.splice(+b.dataset.rm, 1);
    await API.update("deals", deal.id, { images: deal.images });
    renderEditForm(deal);
  });
}

// ───────────────────────── Lenders ─────────────────────────
function renderLenders(view) {
  view.innerHTML = `
    <div class="page-head"><div><h1>Lenders</h1><div class="sub">${state.lenders.length} saved · pick one in any deal to auto-fill terms</div></div>
      <button class="btn primary" id="new-lender">＋ Add Lender</button></div>
    ${state.lenders.length ? state.lenders.map(lenderRow).join("") : emptyState("🏦", "No lenders yet", "Add your hard-money and private lenders with their rates and contacts.")}`;
  $("#new-lender").onclick = () => lenderModal();
  view.querySelectorAll("[data-lender]").forEach((el) => el.onclick = () => lenderModal(state.lenders.find((l) => l.id === el.dataset.lender)));
}

function lenderRow(l) {
  const t = l.terms || {};
  const tags = [];
  if (t.rate != null) tags.push(`${pct(t.rate)} rate`);
  if (t.pointsPct != null) tags.push(`${pct(t.pointsPct)} pts`);
  if (t.ltc != null) tags.push(`${pct(t.ltc)} LTC`);
  if (t.termMonths != null) tags.push(`${t.termMonths} mo`);
  return `
    <div class="list-row" data-lender="${l.id}" style="cursor:pointer">
      <div class="av" style="width:42px;height:42px;border-radius:11px;background:var(--bg-elev-2);display:grid;place-items:center;font-size:20px">${l.type === "private" ? "🤝" : l.type === "conventional" ? "🏛️" : "💰"}</div>
      <div class="lead-info">
        <div class="lr-name">${esc(l.name)} ${l.type ? `<span class="badge">${esc(l.type)}</span>` : ""}</div>
        <div class="lr-sub">${[l.contactPerson, l.phone, l.email].filter(Boolean).map(esc).join(" · ") || "No contact info"}</div>
        <div class="tag-list" style="margin-top:7px">${tags.map((x) => `<span class="badge">${esc(x)}</span>`).join("")}</div>
      </div>
    </div>`;
}

function lenderModal(existing) {
  const l = existing || { type: "hard", terms: {} };
  const t = l.terms || {};
  openModal({
    title: existing ? "Edit Lender" : "Add Lender",
    body: `
      <div class="row2">
        <div class="field"><label>Lender name</label><input id="l-name" value="${esc(l.name || "")}" placeholder="e.g. Kiavi"></div>
        <div class="field"><label>Type</label><select id="l-type">
          ${["hard", "private", "conventional"].map((x) => `<option value="${x}" ${l.type === x ? "selected" : ""}>${x[0].toUpperCase() + x.slice(1)} money</option>`).join("")}
        </select></div>
      </div>
      <div class="row2">
        <div class="field"><label>Contact person</label><input id="l-contact" value="${esc(l.contactPerson || "")}"></div>
        <div class="field"><label>Company</label><input id="l-company" value="${esc(l.company || "")}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Phone</label><input id="l-phone" value="${esc(l.phone || "")}"></div>
        <div class="field"><label>Email</label><input id="l-email" value="${esc(l.email || "")}"></div>
      </div>
      <h3 style="font-size:13px;margin:6px 0 12px;color:var(--text-dim)">Default term sheet</h3>
      <div class="row3">
        <div class="field"><label>Down %</label><input id="t-down" value="${pctV(t.downPct)}" inputmode="decimal"></div>
        <div class="field"><label>Rate %</label><input id="t-rate" value="${pctV(t.rate)}" inputmode="decimal"></div>
        <div class="field"><label>Points %</label><input id="t-points" value="${pctV(t.pointsPct)}" inputmode="decimal"></div>
      </div>
      <div class="row3">
        <div class="field"><label>LTV %</label><input id="t-ltv" value="${pctV(t.ltv)}" inputmode="decimal"></div>
        <div class="field"><label>LTC %</label><input id="t-ltc" value="${pctV(t.ltc)}" inputmode="decimal"></div>
        <div class="field"><label>Term (mo)</label><input id="t-term" value="${esc(t.termMonths ?? "")}" inputmode="decimal"></div>
      </div>
      <div class="field"><label>Notes</label><textarea id="l-notes">${esc(l.notes || "")}</textarea></div>`,
    okText: existing ? "Save" : "Add",
    extra: existing ? `<button class="btn danger" id="l-del">Delete</button>` : "",
    onOk: async (close) => {
      const payload = {
        name: $("#l-name").value.trim(), type: $("#l-type").value,
        contactPerson: $("#l-contact").value.trim(), company: $("#l-company").value.trim(),
        phone: $("#l-phone").value.trim(), email: $("#l-email").value.trim(),
        notes: $("#l-notes").value.trim(),
        terms: {
          downPct: pctIn("t-down"), rate: pctIn("t-rate"), pointsPct: pctIn("t-points"),
          ltv: pctIn("t-ltv"), ltc: pctIn("t-ltc"),
          termMonths: $("#t-term").value ? num($("#t-term").value) : null
        }
      };
      if (!payload.name) return toast("Lender name required");
      if (existing) {
        const { item } = await API.update("lenders", existing.id, payload);
        Object.assign(existing, item);
      } else {
        const { item } = await API.create("lenders", payload);
        state.lenders.push(item);
      }
      close(); renderLenders($("#view"));
    },
    onMount: () => {
      if ($("#l-del")) $("#l-del").onclick = async () => {
        if (!confirm("Delete this lender?")) return;
        await API.remove("lenders", existing.id);
        state.lenders = state.lenders.filter((x) => x.id !== existing.id);
        closeModal(); renderLenders($("#view"));
      };
    }
  });
}
const pctV = (v) => (v == null || v === "" ? "" : +(v * 100).toFixed(4));
const pctIn = (id) => { const el = $("#" + id); return el && el.value !== "" ? num(el.value) / 100 : null; };

// ───────────────────────── Pipeline ─────────────────────────
function renderPipeline(view) {
  const byStage = Object.fromEntries(CRM_STAGES.map((s) => [s, []]));
  state.deals.filter((d) => !d.archived).forEach((d) => { (byStage[d.status] || byStage["New Lead"]).push(d); });
  view.innerHTML = `
    <div class="page-head"><div><h1>Pipeline</h1><div class="sub">Drag-free CRM — open a deal to change its stage</div></div></div>
    <div class="board">
      ${CRM_STAGES.map((s) => `
        <div class="col"><h4>${esc(s)} <span class="count">${byStage[s].length}</span></h4>
          ${byStage[s].map((d) => `<div class="lead" data-deal="${d.id}"><div class="ln">${esc(d.address || "Untitled")}</div><div class="la">${esc(TYPE_LABELS[d.type] || "")}</div></div>`).join("")}
        </div>`).join("")}
    </div>`;
  view.querySelectorAll("[data-deal]").forEach((el) => el.onclick = () => { location.hash = `#/deal/${el.dataset.deal}`; });
}

// ───────────────────────── Expenses ─────────────────────────
function renderExpenses(view) {
  const total = state.expenses.reduce((s, e) => s + (e.refunded ? 0 : num(e.cost)), 0);
  view.innerHTML = `
    <div class="page-head"><div><h1>Expenses</h1><div class="sub">Project spend ledger</div></div>
      <button class="btn primary" id="new-exp">＋ Add Expense</button></div>
    <div class="panel" style="margin-bottom:18px"><div class="stat-hero"><div class="label">Total (excl. refunded)</div><div class="num">${money2(total)}</div></div></div>
    ${state.expenses.length ? `<div class="panel"><table class="mini-table">
      <thead><tr><th>Item</th><th>Date</th><th>Category</th><th>Deal</th><th>Cost</th></tr></thead><tbody>
      ${state.expenses.map((e) => `<tr data-exp="${e.id}" style="cursor:pointer">
        <td>${esc(e.name)}</td><td>${esc(e.date || "")}</td><td>${esc(e.category || "")}</td>
        <td>${esc((state.deals.find((d) => d.id === e.dealId) || {}).address || "—")}</td>
        <td>${e.refunded ? "<s>" + money2(num(e.cost)) + "</s>" : money2(num(e.cost))}</td></tr>`).join("")}
      </tbody></table></div>` : emptyState("🧾", "No expenses yet", "Track materials, labor, and fees per project.")}`;
  $("#new-exp").onclick = () => expenseModal();
  view.querySelectorAll("[data-exp]").forEach((el) => el.onclick = () => expenseModal(state.expenses.find((e) => e.id === el.dataset.exp)));
}

function expenseModal(existing) {
  const e = existing || {};
  const dealOpts = `<option value="">— no deal —</option>` + state.deals.map((d) => `<option value="${d.id}" ${e.dealId === d.id ? "selected" : ""}>${esc(d.address || "Untitled")}</option>`).join("");
  openModal({
    title: existing ? "Edit Expense" : "Add Expense",
    body: `
      ${labeled("Item", `<input id="e-name" value="${esc(e.name || "")}" placeholder="Materials, Labor…">`)}
      <div class="row2">
        ${labeled("Cost", `<div class="input-money"><input id="e-cost" value="${esc(e.cost ?? "")}" inputmode="decimal"></div>`)}
        ${labeled("Date", `<input id="e-date" type="date" value="${esc(e.date || "")}">`)}
      </div>
      <div class="row2">
        ${labeled("Category", `<input id="e-cat" value="${esc(e.category || "")}" placeholder="Labor, Material…">`)}
        ${labeled("Deal", `<select id="e-deal">${dealOpts}</select>`)}
      </div>
      ${labeled("", `<label style="display:flex;gap:8px;align-items:center;color:var(--text-dim)"><input type="checkbox" id="e-ref" ${e.refunded ? "checked" : ""} style="width:auto"> Refunded</label>`)}`,
    okText: existing ? "Save" : "Add",
    extra: existing ? `<button class="btn danger" id="e-del">Delete</button>` : "",
    onOk: async (close) => {
      const payload = {
        name: $("#e-name").value.trim(), cost: num($("#e-cost").value),
        date: $("#e-date").value, category: $("#e-cat").value.trim(),
        dealId: $("#e-deal").value || null, refunded: $("#e-ref").checked
      };
      if (!payload.name) return toast("Item name required");
      if (existing) { const { item } = await API.update("expenses", existing.id, payload); Object.assign(existing, item); }
      else { const { item } = await API.create("expenses", payload); state.expenses.push(item); }
      close(); renderExpenses($("#view"));
    },
    onMount: () => {
      if ($("#e-del")) $("#e-del").onclick = async () => {
        await API.remove("expenses", existing.id);
        state.expenses = state.expenses.filter((x) => x.id !== existing.id);
        closeModal(); renderExpenses($("#view"));
      };
    }
  });
}
const labeled = (label, inner) => `<div class="field">${label ? `<label>${esc(label)}</label>` : ""}${inner}</div>`;

// ───────────────────────── Settings ─────────────────────────
function renderSettings(view) {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  view.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><div class="sub">${esc(state.brand.productName)} · ${esc(state.user.email)}</div></div></div>
    <div class="panel" style="max-width:560px">
      <h3><span class="dot"></span>Appearance</h3>
      <div class="field"><label>Theme</label>
        <div class="seg" id="theme-seg">
          <button data-th="dark" class="${theme === "dark" ? "on" : ""}">Dark</button>
          <button data-th="light" class="${theme === "light" ? "on" : ""}">Light</button>
        </div></div>
    </div>
    <div class="panel" style="max-width:560px">
      <h3><span class="dot"></span>Account</h3>
      ${statRow("Name", esc(state.user.name || "—"))}
      ${statRow("Email", esc(state.user.email))}
      ${statRow("Plan", esc(state.user.plan || "owner"))}
      <button class="btn danger" id="set-logout" style="margin-top:14px">Sign out</button>
    </div>
    <div class="panel" style="max-width:560px">
      <h3><span class="dot"></span>About</h3>
      <p style="color:var(--text-dim);font-size:13px;margin:0">${esc(state.brand.productName)} — real-estate deal analysis. Your numbers sync to your account across every device.</p>
    </div>`;
  view.querySelectorAll("#theme-seg button").forEach((b) => b.onclick = () => {
    document.documentElement.setAttribute("data-theme", b.dataset.th);
    localStorage.setItem("dealforge.theme", b.dataset.th);
    renderSettings(view);
  });
  $("#set-logout").onclick = logout;
}

// ───────────────────────── Modal ─────────────────────────
function openModal({ title, body, okText = "Save", extra = "", onOk, onMount }) {
  closeModal();
  const bg = document.createElement("div");
  bg.className = "modal-bg"; bg.id = "modal-bg";
  bg.innerHTML = `<div class="modal"><div class="mh"><h3>${esc(title)}</h3><button class="x" data-close>✕</button></div>
    <div class="mb">${body}</div>
    <div class="mf">${extra}<button class="btn" data-close>Cancel</button><button class="btn primary" id="modal-ok">${esc(okText)}</button></div></div>`;
  document.body.appendChild(bg);
  bg.querySelectorAll("[data-close]").forEach((el) => el.onclick = closeModal);
  bg.onclick = (e) => { if (e.target === bg) closeModal(); };
  $("#modal-ok").onclick = () => onOk && onOk(closeModal);
  onMount && onMount();
}
function closeModal() { const m = $("#modal-bg"); if (m) m.remove(); }

boot();
