import type { Connection, ConnectionContext, WSMessage } from 'partyserver'
import type { Room } from '#realtime/room/context'
import type { RoomState } from '#realtime/room/state'
import type { ClientMessage, PublicRoom, ServerMessage } from '#shared/utils/protocol'
import { getServerByName, Server } from 'partyserver'
import { dataPoint } from '#realtime/analytics'
import { RateLimiter } from '#realtime/rate-limit'
import { handleMessage } from '#realtime/room/messages'
import { connect, disconnect, expireAway, playerIdFor } from '#realtime/room/presence'
import { runCountdown } from '#realtime/room/round'
import { initialState, listing, publicState } from '#realtime/room/state'
import { AWAY_GRACE_MS } from '#shared/utils/protocol'

/** How long an empty room keeps its state before it is wiped. */
const ROOM_RETENTION_MS = 15 * 60_000

/** Canvas writes are batched this long. */
const CANVAS_SAVE_MS = 1_000

/** Guesses and chat lines a player can send at once, then one per refill. */
const TEXT_BURST = 5
const TEXT_REFILL_MS = 1_000

/** Votes, reactions and host commands a player can send at once, then one per refill. */
const ACTION_BURST = 5
const ACTION_REFILL_MS = 500

/** One game room. The game itself lives in `room/`; this class owns storage, sockets and the lobby listing. */
export class GameRoom extends Server<Env> {
  static options = { hibernate: true }

  #state: RoomState = initialState()

  #canvas = ''

  #canvasTimer: ReturnType<typeof setTimeout> | null = null

  /** The last listing sent to the lobby, as JSON. */
  #reported: string | null = null

  #limits = {
    text: new RateLimiter(TEXT_BURST, TEXT_REFILL_MS),
    action: new RateLimiter(ACTION_BURST, ACTION_REFILL_MS),
  }

  readonly #room: Room

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(
      JSON.stringify({ t: 'ping' } satisfies ClientMessage),
      JSON.stringify({ t: 'pong' } satisfies ServerMessage),
    ))
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<RoomState | string>(['state', 'canvas'])
      this.#state = { ...initialState(), ...(stored.get('state') as RoomState | undefined) }
      this.#canvas = (stored.get('canvas') as string | undefined) ?? ''
    })
    this.#room = this.#createRoom()
  }

  #createRoom(): Room {
    const actions = {
      send: (connection: Connection, msg: ServerMessage) => connection.send(JSON.stringify(msg)),
      broadcast: (msg: ServerMessage, without?: string[]) => this.broadcast(JSON.stringify(msg), without),
      log: (level, key, params) => this.broadcast(JSON.stringify({ t: 'log', level, key, params })),
      connections: () => [...this.getConnections()],
      connectionsOf: playerId => [...this.getConnections(playerId)],
      save: () => this.ctx.storage.put('state', this.#state),
      saveCanvas: () => this.#saveCanvas(),
      broadcastState: () => this.#broadcastState(),
      scheduleAlarm: () => this.#scheduleAlarm(),
      track: e => this.env.ANALYTICS?.writeDataPoint(dataPoint(this.name, e)),
      allow: (kind, playerId) => this.#limits[kind].take(playerId),
      forgetLimits: (playerId) => {
        this.#limits.text.forget(playerId)
        this.#limits.action.forget(playerId)
      },
    } satisfies Omit<Room, 'name' | 'state' | 'canvas'>
    return Object.defineProperties(actions, {
      name: { get: () => this.name },
      state: { get: () => this.#state },
      canvas: { get: () => this.#canvas, set: (svg: string) => { this.#canvas = svg } },
    }) as Room
  }

  #saveCanvas() {
    this.#canvasTimer ??= setTimeout(() => {
      this.#canvasTimer = null
      void this.ctx.storage.put('canvas', this.#canvas)
    }, CANVAS_SAVE_MS)
  }

  async #wipe() {
    if (this.#canvasTimer) clearTimeout(this.#canvasTimer)
    this.#canvasTimer = null
    this.#state = initialState()
    this.#canvas = ''
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }

  /** Point the storage alarm at whichever is due first: the game countdown, an away player's deadline or the wipe. */
  async #scheduleAlarm() {
    const s = this.#state
    const due = Object.values(s.players).flatMap(p => (p.awaySince === undefined ? [] : [p.awaySince + AWAY_GRACE_MS]))
    if (s.alarmKind && s.alarmAt !== null) due.push(s.alarmAt)
    if (s.emptySince !== null) due.push(s.emptySince + ROOM_RETENTION_MS)
    if (due.length) await this.ctx.storage.setAlarm(Math.min(...due))
    else await this.ctx.storage.deleteAlarm()
  }

  #broadcastState() {
    this.broadcast(JSON.stringify({ t: 'state', state: publicState(this.#state, this.name) } satisfies ServerMessage))
    this.#reportToLobby()
  }

  /** The room as the lobby lists it, or null to stay unlisted. Called by the lobby to confirm a stale listing. */
  listing(): PublicRoom | null {
    return listing(this.#state, this.name)
  }

  #reportToLobby() {
    const room = this.listing()
    const report = JSON.stringify(room)
    if (report === this.#reported || (this.#reported === null && room === null)) return
    this.#reported = report
    this.ctx.waitUntil(getServerByName(this.env.Lobby, 'global')
      .then(lobby => lobby.update(this.name, room))
      .catch(() => {
        this.#reported = null
      }))
  }

  async getConnectionTags(_connection: Connection, ctx: ConnectionContext) {
    const playerId = await playerIdFor(this.name, new URL(ctx.request.url))
    return playerId ? [playerId] : []
  }

  onConnect(connection: Connection, ctx: ConnectionContext) {
    return connect(this.#room, connection, new URL(ctx.request.url))
  }

  onClose(connection: Connection) {
    return disconnect(this.#room, connection)
  }

  onMessage(connection: Connection, message: WSMessage) {
    return handleMessage(this.#room, connection, message)
  }

  async onAlarm() {
    const s = this.#state
    if (s.emptySince !== null && Date.now() >= s.emptySince + ROOM_RETENTION_MS) {
      await this.#wipe()
      return
    }
    await expireAway(this.#room)
    await runCountdown(this.#room)
    await this.#scheduleAlarm()
  }
}
