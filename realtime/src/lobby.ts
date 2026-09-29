import type { Connection } from 'partyserver'
import type { LobbyMessage, PublicRoom } from '#shared/utils/protocol'
import { getServerByName, Server } from 'partyserver'

/** How long a listing goes without an update before the lobby asks its room whether it is still open. */
const STALE_MS = 30 * 60_000

interface Listing {
  room: PublicRoom
  updatedAt: number
}

/** The single directory of public rooms, at `/parties/lobby/global`. */
export class Lobby extends Server<Env> {
  static options = { hibernate: true }

  #listings = new Map<string, Listing>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<Listing[]>('listings')
      this.#listings = new Map((stored ?? []).map(l => [l.room.id, l]))
    })
  }

  #rooms(): PublicRoom[] {
    return [...this.#listings.values()].map(l => l.room)
  }

  #message(): string {
    return JSON.stringify({ t: 'rooms', rooms: this.#rooms() } satisfies LobbyMessage)
  }

  async #save() {
    await this.ctx.storage.put('listings', [...this.#listings.values()])
    const oldest = Math.min(...[...this.#listings.values()].map(l => l.updatedAt))
    if (this.#listings.size) await this.ctx.storage.setAlarm(oldest + STALE_MS)
    else await this.ctx.storage.deleteAlarm()
    this.broadcast(this.#message())
  }

  /** Called by a game room: list or refresh it, or pass `null` to take it down. */
  async update(id: string, room: PublicRoom | null) {
    if (room) this.#listings.set(id, { room, updatedAt: Date.now() })
    else if (!this.#listings.delete(id)) return
    await this.#save()
  }

  onConnect(connection: Connection) {
    connection.send(this.#message())
  }

  async onAlarm() {
    const cutoff = Date.now() - STALE_MS
    const stale = [...this.#listings.values()].filter(l => l.updatedAt <= cutoff)
    await Promise.all(stale.map(async (old) => {
      const room = await getServerByName(this.env.GameRoom, old.room.id)
        .then(stub => stub.listing())
        .catch(() => null)
      if (this.#listings.get(old.room.id) !== old) return
      if (room) this.#listings.set(room.id, { room, updatedAt: Date.now() })
      else this.#listings.delete(old.room.id)
    }))
    await this.#save()
  }
}
