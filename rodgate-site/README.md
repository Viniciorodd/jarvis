# Rodgate Group — website (rodgategroup.com)

Elevated static rebuild of the Rodgate public site. Astro + Tailwind, **100% static
output** (no server), deployed on Netlify. Replaces the legacy single-file site at
`../site/index.html` once verified — that build stays live until DNS is repointed.

Built from `03 - Business/Gov Contracting/PRD - Rodgate Group Website (rodgategroup.com).md`.

## Run it

```bash
npm install
npm run dev      # local dev at http://localhost:4321
npm run build    # static output → dist/
npm run preview  # serve the built dist/
```

## Structure

- `src/data/company.js` — **single source of truth for every fact.** Copied from the vault
  Canonical Facts table (Lessons Ledger). Never re-compose facts from memory; edit here only,
  then re-audit against that table.
- `src/layouts/Base.astro` — shell: fonts, meta/OG, theme toggle, nav, footer, scroll-reveal.
- `src/components/` — `Hero3D.astro` (Three.js globe via CDN + graceful fallback), `Nav`,
  `Footer`, `ServiceCard`, `BadgeRow`, `CapabilityTable`, `ContactForm`, `PageHeader`, `Icon`.
- `src/pages/` — `index`, `services`, `capabilities`, `past-performance`, `about`, `contact`,
  `contact/thanks`.
- `src/styles/tokens.css` — design tokens (navy/gold, light + dark). No AI purple/pink gradients.

## Before publishing — checklist

1. **Confirm the capability PDF.** `public/Rodgate-LLC-Capability-Statement.pdf` was copied from
   the vault and **predates recent fact corrections** (new email, PA/NJ/NY/FL service area). Read
   it and confirm it does NOT show the old `RodGateGroup@gmail.com` or an outdated service area /
   any certification beyond self-certified SDB. If it does, regenerate it to match the site before
   the download link goes live. (The richer `Rodgate Capability Package 2026.pdf`, 265 KB, is an
   alternative source — same audit applies.)
2. **Netlify Forms notification.** In the Netlify dashboard → Forms → `capability-briefing`, set
   the notification email to `vinicio@rodgategroup.com`. Submit a test message end-to-end.
3. **DNS.** rodgategroup.com is registered but not pointed. Deploy to a Netlify preview first;
   repoint DNS only after sign-off. Keep `../site/` live until then.
4. **A11y / perf pass.** Run Lighthouse on the deployed preview: Core Web Vitals green with the 3D
   hero; verify no CLS from the hero canvas; test `prefers-reduced-motion` and WebGL-disabled
   (hero must fall back to the gradient, not a blank/spinner); check dark mode contrast; test
   375 / 768 / 1024 / 1440 px.

## Notes

- The 3D hero loads Three.js from `unpkg.com` at runtime (progressive enhancement). If it fails
  to load — offline, WebGL disabled, locked-down agency laptop — the navy gradient hero stands on
  its own and the page is fully legible. This is intentional and required.
- Contact form uses **Netlify Forms** (`data-netlify="true"`) — works only on Netlify, not on a
  bare static host.
