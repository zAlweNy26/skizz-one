import { routePartykitRequest } from 'partyserver'
import { GameRoom } from './game-room'

export { GameRoom }

function isAllowedOrigin(request: Request, env: Env): boolean {
  const allowed = env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean)
  if (!allowed || allowed.length === 0) return true

  const origin = request.headers.get('Origin')
  if (!origin) return true

  return allowed.includes(origin)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isAllowedOrigin(request, env))
      return new Response('Forbidden', { status: 403 })

    return (await routePartykitRequest(request, env))
      ?? new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
