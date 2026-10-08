import type { ClientMessage, GameState, LobbyMessage, ServerMessage } from '#shared/utils/protocol'
import type { FakeWebSocket } from '#test/realtime/runtime'
import { vi } from 'vitest'
import worker, { GameRoom, Lobby } from '#realtime/index'
import { PROTOCOL_VERSION } from '#shared/utils/protocol'
import { FakeNamespace } from '#test/realtime/runtime'

export const ROOM = 'a1b2c3d4'

type Of<M extends { t: string }, T extends M['t']> = Extract<M, { t: T }>

/** One end of a socket as the browser sees it: what the server sent, and whether it hung up. */
class Client<M extends { t: string }> {
  /** Everything received, kept across `clear()`. */
  readonly history: M[] = []
  messages: M[] = []

  constructor(readonly socket: FakeWebSocket) {
    socket.onFrame = data => this.receive(JSON.parse(data))
    for (const data of socket.buffered.splice(0)) this.receive(JSON.parse(data))
  }

  private receive(msg: M) {
    this.history.push(msg)
    this.messages.push(msg)
  }

  get closed() {
    return this.socket.closed
  }

  all<T extends M['t']>(t: T) {
    return this.messages.filter((m): m is Of<M, T> => m.t === t)
  }

  last<T extends M['t']>(t: T) {
    return this.all(t).at(-1)
  }

  clear() {
    this.messages = []
  }
}

class LobbyWatcher extends Client<LobbyMessage> {
  get rooms() {
    return this.history.at(-1)?.rooms ?? []
  }
}

class Player extends Client<ServerMessage> {
  constructor(
    socket: FakeWebSocket,
    readonly name: string,
    readonly token: string,
    private readonly deliver: (frame: string) => Promise<void>,
    private readonly hangUp: () => Promise<void>,
  ) {
    super(socket)
  }

  /** The latest room state this player was sent. */
  get state(): GameState | null {
    for (const msg of [...this.history].reverse())
      if (msg.t === 'welcome' || msg.t === 'state' || msg.t === 'roundEnd') return msg.state

    return null
  }

  get id() {
    const welcome = this.history.find(m => m.t === 'welcome')
    return welcome?.t === 'welcome' ? welcome.you : ''
  }

  get logs() {
    return this.all('log').map(m => m.key)
  }

  get chat() {
    return this.all('chat')
  }

  send(msg: ClientMessage) {
    return this.deliver(JSON.stringify(msg))
  }

  /** Send what a well-behaved client never would. */
  sendUntyped(msg: unknown) {
    return this.deliver(JSON.stringify(msg))
  }

  sendRaw(frame: string) {
    return this.deliver(frame)
  }

  disconnect() {
    return this.hangUp()
  }
}

interface JoinOptions {
  room?: string
  token?: string
  avatar?: string
  color?: string
  public?: boolean
  lang?: string
  origin?: string
  /** `PROTOCOL_VERSION` unless given; null leaves it out. */
  version?: string | null
}

/** A realtime worker with its Durable Objects, driven the way workerd drives them, on a fake clock. */
export function createWorld(vars: { ALLOWED_ORIGINS?: string } = {}) {
  const events: AnalyticsEngineDataPoint[] = []
  const analytics = { writeDataPoint: (point: AnalyticsEngineDataPoint) => events.push(point) }
  const env = { ...vars, ANALYTICS: analytics } as unknown as Env
  const rooms = new FakeNamespace(state => new GameRoom(state as never, env))
  const lobbies = new FakeNamespace(state => new Lobby(state as never, env))
  Object.assign(env, { GameRoom: rooms, Lobby: lobbies })
  const namespaces = [rooms, lobbies] as const

  function states() {
    return namespaces.flatMap(ns => [...ns.states.values()])
  }

  /** Wait for every `waitUntil` task, including those they start. */
  async function settle() {
    for (;;) {
      const pending = states().flatMap(s => s.pending.splice(0))
      if (!pending.length) return
      await Promise.allSettled(pending)
    }
  }

  async function connect(path: string, origin?: string) {
    const res = await worker.fetch(new Request(`https://skizz.app${path}`, {
      headers: { Upgrade: 'websocket', ...(origin ? { Origin: origin } : {}) },
    }), env) as Response & { webSocket: FakeWebSocket | null }
    await settle()
    return res
  }

  function serverEnd(client: FakeWebSocket) {
    return client.peer!
  }

  /** Run every alarm due within `ms`, in order, then land exactly `ms` later. */
  async function advance(ms: number) {
    const target = Date.now() + ms
    for (;;) {
      const due = namespaces
        .flatMap(ns => [...ns.states].map(([name, state]) => ({ ns, name, state })))
        .filter(({ state }) => state.storage.alarm !== null && state.storage.alarm <= target)
        .sort((a, b) => a.state.storage.alarm! - b.state.storage.alarm!)[0]
      if (!due) break
      await vi.advanceTimersByTimeAsync(Math.max(0, due.state.storage.alarm! - Date.now()))
      due.state.storage.alarm = null
      await due.ns.instance(due.name).alarm()
      await settle()
    }
    await vi.advanceTimersByTimeAsync(target - Date.now())
    await settle()
  }

  return {
    rooms,
    advance,
    /** Analytics Engine data points written so far, oldest first. */
    events,

    request(path: string, origin?: string) {
      return connect(path, origin)
    },

    async join(name: string, options: JoinOptions = {}) {
      const room = options.room ?? ROOM
      const token = options.token ?? `token-${name}`
      const version = options.version === undefined ? String(PROTOCOL_VERSION) : options.version
      const optional = {
        v: version,
        avatar: options.avatar,
        color: options.color,
        public: options.public ? '1' : null,
        lang: options.lang,
      }
      const params = new URLSearchParams({ token, name })
      for (const [key, value] of Object.entries(optional))
        if (value) params.set(key, value)

      const res = await connect(`/parties/game-room/${room}?${params}`, options.origin)
      if (!res.webSocket) throw new Error(`join failed with ${res.status}`)
      const client = res.webSocket
      const player = new Player(
        client,
        name,
        token,
        async (frame) => {
          await rooms.instance(room).webSocketMessage(serverEnd(client) as never, frame)
          await settle()
        },
        async () => {
          const ws = serverEnd(client)
          ws.close(1000, 'bye')
          await rooms.instance(room).webSocketClose(ws as never, 1000, 'bye', true)
          await settle()
        },
      )
      return player
    },

    async watchLobby() {
      const res = await connect('/parties/lobby/global')
      return new LobbyWatcher(res.webSocket!)
    },

    /** Forget the room's in-memory object, as hibernation would, keeping its storage and sockets. */
    hibernate(room = ROOM) {
      rooms.evict(room)
    },

    storage(room = ROOM) {
      return rooms.states.get(room)!.storage
    },
  }
}

export type World = ReturnType<typeof createWorld>

/** Players joined in order; the first is the host. */
export async function seat(world: World, ...names: string[]) {
  const players: Player[] = []
  for (const name of names) players.push(await world.join(name))
  return players
}

/** Start the game and have the first drawer pick a word. */
export async function startDrawing(players: Player[], index = 0) {
  const [host] = players
  await host!.send({ t: 'start' })
  return chooseWord(players, index)
}

/** The current drawer picks a word. */
export async function chooseWord(players: Player[], index = 0) {
  const drawerId = players.find(p => p.state)!.state!.drawerId
  const drawer = players.find(p => p.id === drawerId)!
  await drawer.send({ t: 'choose', index })
  const word = drawer.last('turn')!.word!
  return { drawer, guessers: players.filter(p => p !== drawer), word }
}
