import { defineConfig } from 'void/config'

export default defineConfig({
  cloudflare: {
    name: 'skizz',
    compatibility_date: '2026-09-11',
    compatibility_flags: ['nodejs_compat', 'nodejs_als'],
    routes: [{ pattern: 'skizz.app', custom_domain: true }],
    workers_dev: false,
    preview_urls: false,
    observability: { enabled: true },
  },
})
