import { fileURLToPath } from 'node:url'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

const alias = {
  '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
  '#realtime': fileURLToPath(new URL('./realtime/src', import.meta.url)),
  '#test': fileURLToPath(new URL('./test', import.meta.url)),
  '~': fileURLToPath(new URL('./app', import.meta.url)),
  '~~': fileURLToPath(new URL('.', import.meta.url)),
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['test/unit/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
      {
        resolve: {
          alias: {
            ...alias,
            'cloudflare:workers': fileURLToPath(new URL('./test/realtime/cloudflare-workers.ts', import.meta.url)),
          },
        },
        test: {
          name: 'realtime',
          include: ['test/realtime/*.{test,spec}.ts'],
          environment: 'node',
          setupFiles: ['test/realtime/setup.ts'],
          server: { deps: { inline: ['partyserver'] } },
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/*.{test,spec}.ts'],
          environment: 'nuxt',
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL('.', import.meta.url)),
              domEnvironment: 'happy-dom',
            },
          },
        },
      }),
    ],
    coverage: {
      enabled: true,
      provider: 'v8',
      exclude: ['test/**'],
    },
  },
})
