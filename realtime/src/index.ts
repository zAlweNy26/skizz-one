import { routePartykitRequest } from 'partyserver'
import { GameRoom } from './game-room'
import { Lobby } from './lobby'

export { GameRoom, Lobby }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowed = env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) ?? []
    const origin = request.headers.get('Origin')
    if (origin && allowed.length && !allowed.includes(origin))
      return new Response('Forbidden', { status: 403 })

    return (await routePartykitRequest(request, env))
      ?? new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
