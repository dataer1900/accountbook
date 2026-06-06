import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const backendPort = Number(process.env.BOOKKEEPING_API_PORT || 8787)
const backendOrigin = process.env.BOOKKEEPING_API_ORIGIN || `http://localhost:${backendPort}`

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/icon-192.svg',
        'icons/icon-512.svg',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/apple-touch-icon-180.png',
      ],
      manifest: {
        id: '/',
        name: '小账本',
        short_name: '小账本',
        description: '适合手机使用的个人记账应用，支持主屏幕安装和基础离线使用。',
        theme_color: '#2563eb',
        background_color: '#f6f6f8',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'browser'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'zh-CN',
        categories: ['finance', 'productivity', 'utilities'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,ico,png,webmanifest}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'script' || request.destination === 'style' || request.destination === 'worker',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'assets',
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 32,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': backendOrigin,
    },
  },
})
