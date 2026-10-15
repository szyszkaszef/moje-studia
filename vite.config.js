// Konfiguracja budowania. Wtyczka PWA robi z aplikacji instalowalną "appkę":
// plik manifestu (nazwa, ikona), service worker (działanie offline) i automatyczne aktualizacje.
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate', // nowa wersja pobiera się sama i włącza po zamknięciu/otwarciu aplikacji
      includeAssets: ['icons/apple-touch-icon.png', 'schedule.json'],
      manifest: {
        name: 'Moje Studia',
        short_name: 'Studia',
        description: 'Grafik zajęć, zadania i notatki na studia',
        lang: 'pl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#000000',
        theme_color: '#4f46e5',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // zapamiętaj wszystkie pliki aplikacji, także silnik PDF (.mjs) i grafik (.json), żeby działała bez internetu
        globPatterns: ['**/*.{js,mjs,css,html,json,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
