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
      ],
      link: [
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
