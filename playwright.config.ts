import type { ConfigOptions } from '@nuxt/test-utils/playwright'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

/** Where the e2e run's own realtime worker listens, apart from `bun run dev`'s 8787. */
const REALTIME_PORT = 8799

export default defineConfig<ConfigOptions>({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  webServer: {
    command: `bunx wrangler dev --config realtime/wrangler.jsonc --port ${REALTIME_PORT} --inspector-port 9239 `
      + '--var ALLOWED_ORIGINS:',
    port: REALTIME_PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    trace: 'on-first-retry',
    nuxt: {
      rootDir: fileURLToPath(new URL('.', import.meta.url)),
      nuxtConfig: {
        nitro: { preset: 'node-server' },
        runtimeConfig: { public: { realtimeHost: `localhost:${REALTIME_PORT}` } },
        security: {
          headers: {
            contentSecurityPolicy: { 'connect-src': ['\'self\'', `ws://localhost:${REALTIME_PORT}`] },
          },
        },
      },
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
