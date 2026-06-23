# DealForge

Real-estate deal analysis app — **Fix & Flip / BRRRR, Rental / Hold, and Wholesale** — rebuilt
from Vinicio's "Updated Deal Calculator Jul 2025" workbook. Clean, modern, cloud-synced, and
white-labelable so it runs **inside JARVIS** for personal use *and* ships as a **standalone
sellable product**.

## Why it exists
The original was one Google Sheet doing the work of a full underwriting suite (13 tabs). DealForge
turns that into a real app you can run on Windows, Mac, the web, and mobile — track every analysis,
archive deals, attach property photos, and keep preset libraries (lenders, rehab tiers).

## Architecture
- **Dependency-free Node core** (`server.js`, builtins only — like `hq/server.js`). Runs identically
  on Windows (dev) and `node:20-alpine` (NAS / hosted). No native modules, no `npm install` for the core.
- **`engine/`** — pure, deterministic calculators (no DOM, no network). Money math is **code, not prompts**.
  The browser SPA and the eval suite import the *same* engine files, so the math is provably identical.
- **`evals/`** — regression fixtures that reproduce the source workbook's real numbers (31 anchors).
  This is the proof the app is built from the actual sheet. Run before trusting any UI.
- **`db/`** — JSON datastore + scrypt/HMAC auth behind a thin interface, so a SQLite/Postgres adapter
  can drop in for the hosted multi-tenant product without touching routes.
- **`public/`** — responsive vanilla-JS SPA + PWA (installable on web/mobile).
- **`config/brand.json`** — white-label: product name, logo, theme, feature flags, and a **billing
  seam** (disabled until the billing phase is approved).

## Run it
```bash
node dealforge/evals/run.js     # verify the engine reproduces the workbook (31/31)
node dealforge/server.js        # http://localhost:8096
```
Set `DEALFORGE_SECRET` in the environment for the token-signing key (least privilege; never in code).
Set `DEALFORGE_PORT` to override the port.

## Verified anchors (engine fidelity)
- **Flip:** 70%-rule max offer `0.70·ARV − rehab`, target profit `0.15·ARV`, project cost, HML
  interest-only payment, cost-to-purchase, total cash outflow, realtor/brokerage fees, profit allocation.
- **Wholesale:** MAO `0.70·ARV − rehab − fee`, buyer price — reproduce the sheet exactly.
- **Rental:** vacancy, NOI, DSCR (→1.00), cap rate (→6.53%), cap valuation (5%→$313,308), amortized
  P&I, 3% appreciation.

> Note: the original workbook's single flip "Net Profit" cell did not reconcile from the export (the
> source contains `#REF!` errors and cross-tab references). DealForge computes profit transparently
> from itemized lines so it is auditable. Tell us if you want it pinned to a specific definition.

## Status
- **Phase 1 (done):** engine + evals, auth + cloud-synced REST API, responsive SPA (deals, live
  calculators, lenders with auto-fill, CRM pipeline, expenses, archive, images, settings/themes), PWA.
- **Phase 2:** Electron Win/Mac installers; embed into the JARVIS "Real Estate Desk" room.
- **Phase 3:** Market Analysis + Total Costs tabs.
- **Phase 4 (separate approval):** Stripe membership (monthly/quarterly/yearly/lifetime) + license keys.
