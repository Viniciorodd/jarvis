# Rodgate Group — website (rodgategroup.com)

Public capability site for Rodgate, LLC. Astro + the **Rodgate Group Design System**
("Keystone Ledger"), static output, deployed on Netlify.

- **Live:** https://rodgate-group.netlify.app
- **Netlify project:** `rodgate-group` (site id `406a4f9d-dff6-4f67-bbfc-40deef689ebc`)
- **Design rules:** see `CLAUDE.md` (read before changing anything visual)

## Run it

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output → dist/
npm run preview  # serve the built dist/
```

Deploy: `netlify deploy --build --prod`

## Structure

- `src/styles/ds/` — **design system token files, verbatim from the published system.
  Never edit these.** Re-export from the design system project instead.
- `src/styles/tokens.css` — only this site's component classes, built on those tokens.
- `src/data/company.js` — **single source of truth for every fact.** Mirrors the vault's
  Canonical Facts table. Also holds `SHOW_MARK` (keystone mark on/off).
- `public/brand/` — real logo assets (slate / black / white / bronze).
- `src/pages/logo-options.astro` — internal comparison page, not linked in nav. Delete
  once the mark decision is final.

---

## ⚠️ Go-live checklist — rodgategroup.com

**Current state:** the domain is registered and on Cloudflare DNS, but **broken** —
`www.rodgategroup.com` returns HTTP 525 (SSL handshake failure to a dead origin) and the
apex returns nothing. The steps below repoint it at this site.

### 1. Cloudflare DNS (you must do this — the token in `jarvis/.env` has no zone access)

> 🛑 **Do NOT change nameservers to Netlify.** The MX records on this domain are
> **Cloudflare Email Routing** — that is what makes `vinicio@rodgategroup.com` work.
> Moving nameservers breaks your email. We keep Cloudflare DNS and change only the web records.
>
> 🛑 **Do not touch any MX or TXT record.** Only the `A`/`CNAME` records for `@` and `www`.

In the Cloudflare dashboard → **rodgategroup.com → DNS → Records**:

| Action | Type | Name | Content | Proxy |
|---|---|---|---|---|
| **Delete** the existing `A` records | A | `@` | (old/dead origin) | — |
| **Add** | CNAME | `@` | `rodgate-group.netlify.app` | **DNS only** (grey cloud) |
| **Add / edit** | CNAME | `www` | `rodgate-group.netlify.app` | **DNS only** (grey cloud) |

Cloudflare flattens the apex CNAME automatically, so `@` works.

**Grey cloud matters.** With the orange cloud (proxied), Netlify cannot complete the
Let's Encrypt HTTP challenge and you get a cert error or a redirect loop. Leave both records
**DNS only** at minimum until Netlify shows the certificate as issued. If you later want
Cloudflare's proxy, first set SSL/TLS mode to **Full (strict)** — never *Flexible*.

### 2. Netlify — provision the certificate

The custom domain is already attached (`rodgategroup.com` + `www` alias). After DNS propagates:

Netlify → **rodgate-group → Domain management → HTTPS → Verify DNS / Provision certificate.**

Verify from a terminal:

```bash
curl -sI https://rodgategroup.com | head -3
```

### 3. Netlify Forms — two dashboard steps (cannot be done via API)

The contact form is deployed but **will not capture submissions until form detection is on**.

1. **Site configuration → Forms → Enable form detection**, then redeploy
   (`netlify deploy --build --prod`) so the form is registered.
2. **Forms → Notifications → Add notification → Email** → `vinicio@rodgategroup.com`.
3. Submit a test message through https://rodgategroup.com/contact and confirm it arrives.

### 4. Retire the old site

`jarvis/site/index.html` (rodgate-llc.netlify.app) is the predecessor. Once
rodgategroup.com is serving correctly, take it down or point it here so there is only one
public Rodgate site.

---

## Open decisions

- **Keystone mark — keep or drop?** Compare at `/logo-options`. One line to switch:
  `SHOW_MARK` in `src/data/company.js`.
- **Past performance.** `src/pages/past-performance.astro` currently states plainly that no
  awarded contracts are listed. Real contracts drop into the `contracts` array — agency,
  scope, period, reference. Never filler.
- **Service-area conflict.** This site says **PA / NJ / NY / FL** (confirmed by Vinicio
  2026-07-24). The design system readme still says PA/NJ/FL — update it there so the two
  do not drift.
