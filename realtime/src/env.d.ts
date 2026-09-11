import type { GameRoom } from './game-room'

declare global {
  interface Env {
    /**
     * One Durable Object per game room.
     *
     * `routePartykitRequest` routes on the kebab-cased BINDING name, not the
     * class name, so this binding is reachable at `/parties/game-room/:roomId`.
     */
    GameRoom: DurableObjectNamespace<GameRoom>
    /** Comma-separated origins allowed to open a socket. Unset means any. */
    ALLOWED_ORIGINS?: string
  }
}

export {}
