import { routePartykitRequest } from 'partyserver'
import { GameRoom } from './game-room'

export { GameRoom }

/**
 * Whether this request may open a room.
 *
 * Browsers do not send a CORS preflight for WebSocket upgrades, so nothing
 * enforces an origin for us — this check is the enforcement. `ALLOWED_ORIGINS`
 * is a comma-separated list; leaving it unset allows everything, which is
 * convenient in local development and wrong in production.
 */
function isAllowedOrigin(request: Request, env: Env): boolean {
  const allowed = env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean)
  if (!allowed || allowed.length === 0) return true

  const origin = request.headers.get('Origin')
  // Non-browser clients send no Origin; there is nothing to validate.
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
