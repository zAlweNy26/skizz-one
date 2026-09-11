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
