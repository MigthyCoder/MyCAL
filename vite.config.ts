import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Built for https://<user>.github.io/MyCAL/, so assets need that prefix — but dev
// stays at the root so localhost URLs (and Supabase redirects) are plain.
export default defineConfig(({ command }) => {
  const base = process.env.BASE ?? (command === 'build' ? '/MyCAL/' : '/')
  return {
  base,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'MyCAL — your life, in time',
        short_name: 'MyCAL',
        description: 'A cinematic week calendar that acts as an external brain.',
        theme_color: '#08090c',
        background_color: '#08090c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The whole app is static; caching it means the calendar opens with no
        // signal, which matters at school.
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        navigateFallback: `${base}index.html`,
        // Without these a new deploy sits behind the old cached one until you
        // close every tab. Take the update on the next load instead.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // strictPort matters more than it looks. Your calendar lives in localStorage,
  // which is scoped to the origin — so if 5273 is busy and Vite quietly starts
  // on 5274 instead, the app opens completely empty and reads as "it lost
  // everything". Failing to start is the honest outcome; the data is still
  // there on 5273 once whatever took the port is gone.
  server: { port: 5273, strictPort: true },
  }
})
