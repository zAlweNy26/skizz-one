import { describe, expect, it, vi } from 'vitest'

vi.mock('nitropack/presets/cloudflare/runtime/_module-handler', () => ({
  createHandler: (hooks: unknown) => hooks,
}))
vi.mock('#nitro-internal-virtual/public-assets', () => ({
  isPublicAssetURL: (path: string) => path.startsWith('/_nuxt/'),
}))
vi.mock('#nitro-internal-pollyfills', () => ({}))

type Fetch = (request: Request, env: object, context: unknown, url: URL) => Response | Promise<Response> | undefined

const { default: entry } = await import('~~/preset/entry') as unknown as { default: { fetch: Fetch } }

function binding(name: string) {
  return { fetch: vi.fn(async () => new Response(name)) }
}

function call(path: string, env: object, headers: HeadersInit = {}) {
  const url = new URL(path, 'https://skizz.app')
  return entry.fetch(new Request(url, { headers }), env, undefined, url)
}

describe('app entry', () => {
  it('serves public assets from the assets binding', async () => {
    const env = { ASSETS: binding('asset') }
    expect(await (await call('/_nuxt/app.js', env))?.text()).toBe('asset')
  })

  it('forwards websocket upgrades on /parties to the realtime worker', async () => {
    const env = { REALTIME: binding('realtime') }
    const response = await call('/parties/game-room/abc', env, { Upgrade: 'WebSocket' })
    expect(await response?.text()).toBe('realtime')
  })

  it('refuses plain requests to /parties', async () => {
    expect((await call('/parties/game-room/abc', { REALTIME: binding('realtime') }))?.status).toBe(426)
  })

  it('reports a missing realtime binding', async () => {
    expect((await call('/parties/game-room/abc', {}, { Upgrade: 'websocket' }))?.status).toBe(503)
  })

  it('leaves every other request to Nitro', () => {
    expect(call('/room/abc', { ASSETS: binding('asset') })).toBeUndefined()
  })
})
