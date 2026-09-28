import type { GameRoom } from './game-room'

declare global {
  interface Env {
    /** One Durable Object per game room, at `/parties/game-room/:roomId`. */
    GameRoom: DurableObjectNamespace<GameRoom>
    /** Comma-separated origins allowed to open a socket. Unset means any. */
    ALLOWED_ORIGINS?: string
  }
}

export {}
