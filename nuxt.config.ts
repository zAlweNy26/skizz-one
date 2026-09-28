import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
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

  future: {
    compatibilityVersion: 4,
  },

  compatibilityDate: '2026-09-11',

  nitro: {
    // No `experimental.websocket`: crossws would intercept every upgrade
    // before our entry sees it, and on Cloudflare its `publish()` is a no-op
    // anyway. Realtime lives in the skizz-realtime Worker instead.
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },

  runtimeConfig: {
    public: {
      // Host the game socket connects to. Empty means same origin, which is
      // what production wants: the app worker proxies /parties/* itself.
      realtimeHost: '',
    },
  },

  $development: {
    runtimeConfig: {
      public: {
        // `nuxt dev` cannot proxy the upgrade: the entry below is production
        // only, and Nitro's dev server hands every upgrade to its own worker
        // (`devProxy` covers plain HTTP, not websockets). Connect straight to
        // `bun run dev:realtime` instead. Override with NUXT_PUBLIC_REALTIME_HOST.
        realtimeHost: 'localhost:8787',
      },
    },
  },

  $production: {
    nitro: {
      // Replaces the preset's generated entry so websocket upgrades under
      // /parties/ are forwarded to the skizz-realtime Worker over a service
      // binding.
      //
      // Production only. `nuxt dev` runs its own Node worker from
      // .nuxt/dev/index.mjs, and this entry is a Cloudflare module handler —
      // set globally it is compiled into the dev worker too, which then never
      // initialises and leaves the dev server reporting a missing entry.
      entry: fileURLToPath(new URL('./preset/entry.ts', import.meta.url)),
    },
  },

  // The UI language is each player's own. It is unrelated to a room's word
  // language, which the host picks and every player shares.
  i18n: {
    // One route, no SSR: nothing to gain from /it/ style URLs.
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'it', language: 'it-IT', name: 'Italiano', file: 'it.json' },
    ],
    detectBrowserLanguage: {
      // Detected once, then remembered. A future settings toggle only needs
      // to call setLocale(), which overwrites this cookie.
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
