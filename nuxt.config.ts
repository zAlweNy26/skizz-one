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

  compatibilityDate: '2024-11-27',

  nitro: {
    experimental: {
      websocket: true,
    },
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
    cloudflareDev: {
      configPath: './data/hub',
    },
  },

  hub: {
    kv: {
      driver: 'cloudflare-kv-binding',
      namespaceId: 'ff91b50cf1de4e1a827fdc2f6f486f07',
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
