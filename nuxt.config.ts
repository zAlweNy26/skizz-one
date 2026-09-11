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
    // Replaces the preset's generated entry so websocket upgrades under
    // /parties/ can be forwarded to that Worker over a service binding.
    entry: fileURLToPath(new URL('./preset/entry.ts', import.meta.url)),
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
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
