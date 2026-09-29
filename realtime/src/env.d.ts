import type { GameRoom } from '#realtime/game-room'
import type { Lobby } from '#realtime/lobby'

declare global {
  interface Env {
    /** One Durable Object per game room, at `/parties/game-room/:roomId`. */
    GameRoom: DurableObjectNamespace<GameRoom>
    /** The public room directory; only the `global` instance is used. */
    Lobby: DurableObjectNamespace<Lobby>
    /** Comma-separated origins allowed to open a socket. Unset means any. */
    ALLOWED_ORIGINS?: string
  }
}

export {}
