import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    //vueDevTools(),
    VitePWA({
      // El registro y la activación son explícitos: nunca recargar formularios automáticamente.
      injectRegister: false,
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'recetapis-32.png', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'RecetAPIs',
        short_name: 'RecetAPIs',
        lang: 'es-AR',
        description: 'Recetas para compartir. Se necesita internet para consultar o modificar recetas.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#365f40',
        background_color: '#faf9f5',
        icons: [
          { src: 'recetapis-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'recetapis-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'recetapis-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        // Sólo interfaz compilada e íconos. Ninguna respuesta de red entra en caché.
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          /^\/api(?:\/|$)/,
          /\/(?:auth|rest|storage|functions|realtime)\/v\d+(?:\/|$)/,
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
