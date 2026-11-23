import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // На GitHub Pages сайт живе в підпапці (/saved/), локально та на інших хостингах — у корені
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Saved — усе збережене в одному місці',
        short_name: 'Saved',
        description: 'Збереження посилань із TikTok, YouTube, Threads, Instagram та інших у папки й теги.',
        lang: 'uk',
        // Відносні шляхи рахуються від адреси маніфесту, тож працюють і в корені, і в підпапці
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0a0a0d',
        theme_color: '#0a0a0d',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Android: застосунок з'являється в меню «Поділитися»
        share_target: {
          action: './',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
    }),
  ],
});
