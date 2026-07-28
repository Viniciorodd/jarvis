# 🛡️ Repo Security Audit log

Per the vault SOP `00 - System/03 - Jobs/🛡️ Repo Security Audit (run before any install).md` (operator rule,
2026-07-27): **no external code is installed anywhere in this system without a logged CLEAN verdict.**
Every audit is recorded here so we never re-audit the same thing and never forget a BLOCK.

Verdicts: ✅ CLEAN (ok to install) · ⚠️ SUSPICIOUS (do NOT install on the main machine; sandbox-only or ask) ·
🛑 BLOCK (never install).

---

## ⚠️ SUSPICIOUS — `diegosouzapw/OmniRoute` (2026-07-27)
Free-token LLM gateway/router. Operator interest: 1B+ free tokens for the agent hands.

| Check | Finding |
|---|---|
| 1. Provenance | Personal account `diegosouzapw` — **not a reputable org**. Mitigating: account created 2014, 60 repos, 724 followers (not a throwaway). |
| 2. Popularity real? | **32,628★ / 4,222 forks — but the repo was created 2026-02-13 (~5 months).** That rise is a vertical spike, which the SOP flags. Watchers 175 (0.5% of stars) is low relative to stars. |
| 3. Maintenance | ✅ Very active (pushed 2026-07-28), 265 open issues, not archived. |
| 4. License | ✅ MIT — commercial-safe. |
| 5. Code red flags | `postinstall => node scripts/build/postinstall.mjs` — **read it: BENIGN** (copies better-sqlite3 / wreq-js native binaries into the standalone dist for platform compat; documented w/ issue links; no network, no secret reads, no obfuscation). **BUT:** ships **`wreq-js` — a TLS-fingerprint (JA3/JA4) impersonation client** — i.e. the anti-detection capability is a *dependency*, not an optional feature. Also bundles `playwright`, `http-proxy-middleware`, `https-proxy-agent`. |
| 6. Dependencies | 74 direct deps — large surface for a component that would hold API keys. |
| 7. Sandbox | **Required.** Docs describe a **transparent MITM (TPROXY) with a per-SNI CA + trust-store installer** — installing a root CA can decrypt ALL HTTPS on the host (banking, DHS portal, PHI). No documented way to disable stealth/MITM; no free-only mode. |

**VERDICT: ⚠️ SUSPICIOUS — do NOT install on the operator's Windows machine.**

**Approved sandbox path (if adopted):** Docker on the NAS only · bound to `127.0.0.1` · **free-provider keys ONLY —
never the Anthropic/OpenAI paid keys** · consumed by explicit base URL (`/v1`) from our own client code, which we
control — so **the CA/TPROXY is never installed and never needed** · `#ana`/`#finance` stay `privacy → ['local']`
and never traverse it · kill-switchable. Re-audit the exact version at install time.

**Why the explicit-URL path works:** MITM/TPROXY exists to capture CLIs that ignore proxy env vars. Jarvis's LLM
client is ours (`companion/server.js` `callActionBrain`), so we set the endpoint directly. We are the manager;
it never needs to intercept anything.

---

## ✅ Already in use (audited retroactively 2026-07-27)
| Package | Verdict | Note |
|---|---|---|
| `unpdf` | ✅ CLEAN | Pure-JS PDF text extraction (serverless pdf.js build), no native build, used by the RFP shredder. |
| `@mozilla/readability` + `turndown` + `jsdom` | ✅ CLEAN | Mozilla / well-known OSS; power the Node-native web-eyes (web→Markdown). |
| `playwright` | ✅ CLEAN | Microsoft; browser automation for `pods/browser.mjs` (read-only page reads + staged form fills, never submits). |
| `imapflow`, `nodemailer`, `adm-zip` | ✅ CLEAN | Long-standing, widely used; email read/send + DOCX unzip. |

## Pending audit (from the operator's Install Plan, 2026-07-27)
- `anthropics/skills` — ✅ top-tier org; ⚠️ note `license: null`. Audit exact version before install.
- `vercel-labs/agent-browser` — Apache-2.0, reputable; **sandbox first** (drives a browser).
- `remotion-dev/remotion` — ⚠️ **paid company license above a size threshold** — verify before shipping commercially (REDOS, not Jarvis).
- `greensock/GSAP` — MIT, fine (REDOS frontend, not Jarvis).
- `openai/codex` — optional 2nd agent; not needed now.
