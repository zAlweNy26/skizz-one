// fallow-ignore-file unused-class-member
/** Just enough of the Workers runtime for partyserver and the realtime Durable Objects to run in Node. */

export class FakeWebSocket {
  static readonly READY_STATE_CONNECTING = 0
  static readonly READY_STATE_OPEN = 1
  static readonly READY_STATE_CLOSING = 2
  static readonly READY_STATE_CLOSED = 3
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = FakeWebSocket.OPEN
  peer: FakeWebSocket | null = null
  closed: { code?: number, reason?: string } | null = null
  onFrame: ((data: string) => void) | null = null
  /** Frames that arrived before anyone listened. */
  buffered: string[] = []
  #attachment: unknown

  send(data: string) {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error('WebSocket is closed')
    const peer = this.peer
    if (!peer) return
    if (peer.onFrame) peer.onFrame(data)
    else peer.buffered.push(data)
  }

  close(code?: number, reason?: string) {
    for (const end of [this, this.peer]) {
      if (!end || end.closed) continue
      end.readyState = FakeWebSocket.CLOSED
      end.closed = { code, reason }
    }
  }

  accept() {}
  addEventListener() {}
  removeEventListener() {}

  serializeAttachment(value: unknown) {
    this.#attachment = structuredClone(value)
  }

  deserializeAttachment() {
    return structuredClone(this.#attachment)
  }
}

class FakeWebSocketPair {
  0: FakeWebSocket
  1: FakeWebSocket

  constructor() {
    const client = new FakeWebSocket()
    const server = new FakeWebSocket()
    client.peer = server
    server.peer = client
    this[0] = client
    this[1] = server
  }
}

class FakeWebSocketRequestResponsePair {
  constructor(readonly request: string, readonly response: string) {}
}

/** Node's Response refuses status 101, which is how a Worker hands back a WebSocket. */
class WorkerResponse extends Response {
  constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: unknown }) {
    const upgrade = init?.status === 101
    super(body, upgrade ? { ...init, status: 200 } : init)
    if (upgrade) Object.defineProperty(this, 'status', { value: 101 })
    Object.defineProperty(this, 'webSocket', { value: init?.webSocket ?? null })
  }
}

export function installRuntime() {
  Object.assign(globalThis, {
    WebSocket: FakeWebSocket,
    WebSocketPair: FakeWebSocketPair,
    WebSocketRequestResponsePair: FakeWebSocketRequestResponsePair,
    Response: WorkerResponse,
  })
}

class FakeStorage {
  readonly data = new Map<string, unknown>()
  /** Epoch ms of the pending alarm. */
  alarm: number | null = null

  async get(key: string | string[]) {
    if (!Array.isArray(key)) return structuredClone(this.data.get(key))
    return new Map(key.filter(k => this.data.has(k)).map(k => [k, structuredClone(this.data.get(k))]))
  }

  async put(key: string, value: unknown) {
    this.data.set(key, structuredClone(value))
  }

  async delete(key: string) {
    return this.data.delete(key)
  }

  async deleteAll() {
    this.data.clear()
  }

  async getAlarm() {
    return this.alarm
  }

  async setAlarm(time: number | Date) {
    this.alarm = typeof time === 'number' ? time : time.getTime()
  }

  async deleteAlarm() {
    this.alarm = null
  }
}

/** A Durable Object's state. It outlives the object, so a fresh instance can wake up on it like after hibernation. */
class FakeState {
  readonly id: { name: string, toString: () => string }
  readonly storage = new FakeStorage()
  readonly sockets: { ws: FakeWebSocket, tags: string[] }[] = []
  pending: Promise<unknown>[] = []
  #lock: Promise<unknown> = Promise.resolve()

  constructor(name: string) {
    this.id = { name, toString: () => name }
  }

  blockConcurrencyWhile<T>(fn: () => Promise<T>) {
    const run = this.#lock.then(fn)
    this.#lock = run.catch(() => {})
    return run
  }

  waitUntil(promise: Promise<unknown>) {
    this.pending.push(promise)
  }

  acceptWebSocket(ws: FakeWebSocket, tags: string[]) {
    this.sockets.push({ ws, tags })
  }

  getWebSockets(tag?: string) {
    return this.sockets.filter(s => !tag || s.tags.includes(tag)).map(s => s.ws)
  }

  setWebSocketAutoResponse() {}
}

export class FakeNamespace<T> {
  readonly states = new Map<string, FakeState>()
  readonly #instances = new Map<string, T>()

  constructor(private readonly create: (state: FakeState) => T) {}

  idFromName(name: string) {
    return { name, toString: () => name }
  }

  get(id: { name: string }) {
    return this.instance(id.name)
  }

  instance(name: string) {
    let instance = this.#instances.get(name)
    if (!instance) {
      let state = this.states.get(name)
      if (!state) {
        state = new FakeState(name)
        this.states.set(name, state)
      }
      instance = this.create(state)
      this.#instances.set(name, instance)
    }
    return instance
  }

  /** Drop the object from memory, keeping its storage and sockets. */
  evict(name: string) {
    this.#instances.delete(name)
  }
}
