# Web Studio — build spec (AUTHORITATIVE for every website)

This is a standing directive: **every website the operator requests is built fully 3D,
immersive, and highest-quality possible.** 3D is the baseline, never an upsell. (Memory:
`feedback-websites-3d`.)

## Non-negotiables
1. **Start from `web-templates/3d-starter/`** (React Three Fiber + drei + Vite). Never hand-roll a
   flat HTML/CSS landing page as the default.
2. **Real-time 3D, not video.** Actual geometry, lighting, and materials in a WebGL canvas that
   reacts to scroll and cursor. A looping `<video>` or pre-rendered image does not satisfy this.
3. **Immersive hero on first paint** — depth, motion, light before the user does anything.
4. **Production quality**: 60fps target, `dpr={[1,2]}`, lazy/Suspense for heavy assets, mobile fallback
   that stays 3D (reduce particle counts / disable post-fx, don't drop to 2D).
5. **Brand it, keep it 3D**: swap hero mesh, palette, copy, and routes per client — the dimensionality
   and transitions remain.

## Only drop below full-3D if
- The operator explicitly asks for a flat/simple site, **or**
- A hard constraint forces it (strict SEO-only content site, a perf/device target that can't run WebGL).
- In those cases, **surface the tradeoff to the operator first** — do not silently ship 2D.

## How to apply
- New site request → scaffold from the starter, then customize per the starter README checklist.
- The Web Studio pod and any agent generating a site must inject this spec into its build prompt.
- Track the project in Web Studio (`/api/web-studio`) like any other client site.
