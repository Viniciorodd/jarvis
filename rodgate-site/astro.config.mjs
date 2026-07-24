import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Static output (default) — ships plain HTML for best Core Web Vitals.
// Set `site` to the production domain for correct canonical URLs / sitemaps.
export default defineConfig({
  site: 'https://rodgategroup.com',
  // applyBaseStyles: true (default) — Tailwind Preflight normalizes margins,
  // headings, and box model. Without it, layout drifts / text overlaps.
  integrations: [tailwind()],
});
