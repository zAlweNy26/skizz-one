import { createHandler } from 'nitropack/presets/cloudflare/runtime/_module-handler'
// @ts-expect-error virtual module, resolved by Nitro at build time
import { isPublicAssetURL } from '#nitro-internal-virtual/public-assets'
import '#nitro-internal-pollyfills'

/**
 * Worker entry for the Nuxt app.
 *
 * Identical to Nitro's stock `cloudflare-module` entry except that WebSocket
 * upgrades under `/parties/` are handed to the `skizz-realtime` Worker over a
 * service binding.
 *
 * This has to happen here rather than in a Nitro server route: `localFetch`
 * round-trips through node-mock-http, and a 101 response carrying a `webSocket`
 * cannot survive that. The generated entry is the only place that sees the raw
 * `Request`.
 */
export default createHandler({
  fetch(request: Request, env: any, _context: unknown, url: URL) {
    if (env.ASSETS && isPublicAssetURL(url.pathname))
      return env.ASSETS.fetch(request)

    if (url.pathname.startsWith('/parties/')) {
      // Cloudflare's own guidance: reject non-upgrade requests here so they
      // never reach the Durable Object and get billed against it.
      const upgrade = request.headers.get('Upgrade')
      if (!upgrade || upgrade.toLowerCase() !== 'websocket')
        return new Response('Expected Upgrade: websocket', { status: 426 })

      if (!env.REALTIME)
        return new Response('Realtime service binding is not configured', { status: 503 })

      return env.REALTIME.fetch(request)
    }
  },
})
