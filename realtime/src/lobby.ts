import type { PublicRoom, QuickPlayPick } from '#shared/utils/protocol'
import { getServerByName, Server } from 'partyserver'
import { PUBLIC_ROOM_CAP } from '#shared/utils/protocol'

/** How long a listing goes without an update before the lobby asks its room whether it is still open. */
const STALE_MS = 30 * 60_000

interface Listing {
  room: PublicRoom
  updatedAt: number
}

/** The single directory of public rooms, at `/parties/lobby/global`, which quick play asks for a room. */
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

  async #save() {
    await this.ctx.storage.put('listings', [...this.#listings.values()])
    const at = this.#listings.size ? Math.min(...[...this.#listings.values()].map(l => l.updatedAt)) + STALE_MS : null
    if (at !== await this.ctx.storage.getAlarm()) {
      if (at === null) await this.ctx.storage.deleteAlarm()
      else await this.ctx.storage.setAlarm(at)
    }
  }

  /** Called by a game room: list or refresh it, or pass `null` to take it down. */
  async update(id: string, room: PublicRoom | null) {
    const listed = this.#listings.get(id)
    if (room && listed && JSON.stringify(room) === JSON.stringify(listed.room)) {
      listed.updatedAt = Date.now()
      return
    }
    if (room) this.#listings.set(id, { room, updatedAt: Date.now() })
    else if (!this.#listings.delete(id)) return
    await this.#save()
  }

  /** Answers quick play with a random public room that has space and hasn't finished. */
  onRequest() {
    const open = [...this.#listings.values()]
      .filter(l => l.room.players < PUBLIC_ROOM_CAP && l.room.phase !== 'finished')
    const pick = open[Math.floor(Math.random() * open.length)]
    return Response.json({ id: pick?.room.id ?? null } satisfies QuickPlayPick, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
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
