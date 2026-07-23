import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

function versionJsonPlugin(): Plugin {
  const fileName = 'version.json';
  const content = JSON.stringify({ version });
  return {
    name: 'version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source: content });
    },
  };
}

export default defineConfig({
  base: '/ABCDiary/',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    versionJsonPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Static pages served alongside the app (e.g. the public user guide)
        // must NOT fall back to index.html — otherwise the service worker's
        // SPA catch-all boots the React app (and its PIN lock) instead of
        // serving the actual page, making it look password-protected.
        navigateFallbackDenylist: [/\/guide\.html$/],
      },
      manifest: {
        name: 'ABCDiary',
        short_name: 'ABCDiary',
        description: 'Голосовой дневник с шифрованием и Google Таблицами',
        theme_color: '#4a7fa5',
        background_color: '#f0f4f8',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
