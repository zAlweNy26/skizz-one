import type { Connection } from 'partyserver'
import type { GameEvent } from '#realtime/analytics'
import type { RoomState } from '#realtime/room/state'
import type { LogKey, LogLevel, LogParams, ServerMessage } from '#shared/utils/protocol'

/** What the room's logic needs from the Durable Object that hosts it. */
export interface Room {
  readonly name: string
  readonly state: RoomState
  /** Cached SVG innerHTML for late joiners. */
  canvas: string
  send: (connection: Connection, msg: ServerMessage) => void
  broadcast: (msg: ServerMessage, without?: string[]) => void
  log: (level: LogLevel, key: LogKey, params?: LogParams) => void
  connections: () => Connection[]
  connectionsOf: (playerId: string) => Connection[]
  save: () => Promise<void>
  /** Persist `canvas` soon, batching quick changes. */
  saveCanvas: () => void
  /** Send everyone the public state and refresh the lobby listing. */
  broadcastState: () => void
  /** Point the storage alarm at the earliest deadline in `state`. */
  scheduleAlarm: () => Promise<void>
  track: (e: GameEvent) => void
  /** Take one message from a player's rate limit; false when they are sending too fast. */
  allow: (kind: 'text' | 'action', playerId: string) => boolean
  forgetLimits: (playerId: string) => void
}
