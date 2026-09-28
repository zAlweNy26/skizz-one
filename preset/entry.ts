import { createHandler } from 'nitropack/presets/cloudflare/runtime/_module-handler'
// @ts-expect-error virtual module, resolved by Nitro at build time
import { isPublicAssetURL } from '#nitro-internal-virtual/public-assets'
import '#nitro-internal-pollyfills'

interface Binding {
  fetch: (request: Request) => Promise<Response>
}

interface AppEnv {
  ASSETS?: Binding
  REALTIME?: Binding
}

export default createHandler<AppEnv>({
  fetch(request: Request, env: AppEnv, _context: unknown, url: URL) {
    if (env.ASSETS && isPublicAssetURL(url.pathname))
      return env.ASSETS.fetch(request)

    if (url.pathname.startsWith('/parties/')) {
      const upgrade = request.headers.get('Upgrade')
      if (!upgrade || upgrade.toLowerCase() !== 'websocket')
        return new Response('Expected Upgrade: websocket', { status: 426 })

      if (!env.REALTIME)
        return new Response('Realtime service binding is not configured', { status: 503 })

      return env.REALTIME.fetch(request)
    }
  },
})
