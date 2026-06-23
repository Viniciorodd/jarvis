# JARVIS 3D Site Starter

The **default** starting point for every website the operator requests. Fully 3D, immersive,
highest-quality — never a flat template (see `prompts/web-studio-spec.md`).

Stack: **React Three Fiber + drei + Vite**. One WebGL canvas, a scroll-driven scene, and HTML
content layered over it with `<Scroll html>`.

## Run
```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # production bundle in dist/
```

## What's here
- `src/App.jsx` — the canvas, lighting, environment, stars, scroll rig, and the HTML overlay sections.
- `src/Scene.jsx` — the 3D content (distorted hero core + tumbling knot + sparkles) reacting to scroll.
- `src/styles.css` — overlay typography + CTA styling.

## Per-brand checklist (keep it 3D)
1. Swap the hero mesh in `Scene.jsx` (brand object / logo extrusion / product model).
2. Set the palette in `styles.css` (`--bg`, `--accent`) and material colors in `Scene.jsx`.
3. Rewrite the three section copies in `App.jsx`.
4. Add real sections/routes as needed — but the hero and transitions stay three-dimensional.
