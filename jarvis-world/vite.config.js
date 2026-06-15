import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Dev: proxy /hq and /cp to the local services so the PWA calls same-origin (no CORS).
// Prod: nginx does the same proxy (see nginx.conf). Targets overridable via env for dev.
const HQ = process.env.HQ_TARGET || 'http://localhost:8099';
const CP = process.env.CP_TARGET || 'http://localhost:8787';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Jarvis World',
        short_name: 'Jarvis World',
        description: 'A live window into the Jarvis agent org — watch every AI worker on the floor.',
        theme_color: '#04070f',
        background_color: '#04070f',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/hq': { target: HQ, changeOrigin: true, rewrite: (p) => p.replace(/^\/hq/, '') },
      '/cp': { target: CP, changeOrigin: true, rewrite: (p) => p.replace(/^\/cp/, '') },
    },
  },
});
