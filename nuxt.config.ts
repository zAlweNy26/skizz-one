import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: [
    'nitro-cloudflare-dev',
    '@formkit/auto-animate/nuxt',
    '@nuxt/ui',
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/scripts',
    '@nuxt/test-utils',
    '@vueuse/nuxt',
    '@nuxthub/core',
    '@nuxtjs/i18n',
    '@vite-pwa/nuxt',
  ],

  ssr: false,

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
        },
        { name: 'theme-color', content: '#6e0b22' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Shantell+Sans:wght,BNCE,INFM@300..800,-100..100,0..100&display=swap',
        },
      ],
    },
  },

  future: {
    compatibilityVersion: 4,
  },

  compatibilityDate: '2026-09-11',

  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },

  runtimeConfig: {
    public: {
      realtimeHost: '',
    },
  },

  $development: {
    vite: {
      server: {
        allowedHosts: ['.trycloudflare.com'],
      },
    },
    runtimeConfig: {
      public: {
        realtimeHost: 'localhost:8787',
      },
    },
  },

  $production: {
    nitro: {
      entry: fileURLToPath(new URL('./preset/entry.ts', import.meta.url)),
    },
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'it', language: 'it-IT', name: 'Italiano', file: 'it.json' },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'locale',
      fallbackLocale: 'en',
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    registerWebManifestInRouteRules: true,
    manifest: {
      name: 'SkizzOne',
      short_name: 'SkizzOne',
      start_url: '/',
      display: 'standalone',
      background_color: '#6e0b22',
      theme_color: '#6e0b22',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      additionalManifestEntries: [{ url: '/', revision: Date.now().toString() }],
      navigateFallbackDenylist: [/^\/parties\//],
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/,
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'google-fonts' },
        },
        {
          urlPattern: /^https:\/\/api\.dicebear\.com\/.*/,
          handler: 'CacheFirst',
          options: { cacheName: 'avatars', expiration: { maxEntries: 200 }, cacheableResponse: { statuses: [0, 200] } },
        },
        {
          urlPattern: /\/api\/_nuxt_icon\/.*/,
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'icons' },
        },
      ],
    },
  },

  hub: {
    kv: {
      driver: 'cloudflare-kv-binding',
    },
  },

  vite: {
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        '@vueuse/integrations/useDrauu',
        'unique-names-generator',
      ],
    },
  },
})
