import type { GameLog, GamePlayer, GameState } from '#shared/utils/interfaces'
import type { Peer } from 'crossws'
import { getQuery } from 'ufo'

class Game implements GameState {
  public clients: GamePlayer[] = []
  public round = 1

  private constructor(private _id: string, private _totalRounds: number, public host: string) {}

  get id() {
    return this._id
  }

  get totalRounds() {
    return this._totalRounds
  }

  static async getOrInit(id: string, host: string, rounds: number) {
    const game = await hubKV().get<Record<string, any>>(`game:${id}`)
    if (!game) {
      const newGame = new Game(id, rounds, host)
      await hubKV().set(`game:${id}`, newGame.toJSON(), { ttl: 60 * 60 * 24 })
      return newGame
    }
    return Game.fromKV(game)
  }

  static fromKV(data: Record<string, any>) {
    const newGame = new Game(data.id, data.totalRounds, data.host)
    newGame.clients = data.clients
    return newGame
  }

  toJSON(): GameState {
    return {
      id: this.id,
      host: this.host,
      round: this.round,
      totalRounds: this.totalRounds,
      clients: this.clients,
    }
  }

  async update(data: Partial<GameState>) {
    await hubKV().set(`game:${this.id}`, data, { ttl: 60 * 60 * 24 })
  }

  delete() {
    return hubKV().del(`game:${this.id}`)
  }
}

async function getActiveGames() {
  const keys = await hubKV().keys('game')
  return keys.length
}

async function getGame(peer: Peer) {
  const { id, name } = getQuery(peer.websocket.url!) as { id: string, name: string }
  if (!id || !name) return
  const game = await Game.getOrInit(id, peer.id, 3)
  return { game, id, name }
}

export default defineWebSocketHandler({
  async open(peer) {
    const data = await getGame(peer)
    if (!data) return peer.close(1011, 'Game ID and player name required')
    const { game, id, name } = data

    peer.subscribe(id)

    if (!game.clients.find(client => client.id === peer.id)) {
      game.clients.push({ id: peer.id, name, points: 0 })
      const log = {
        sender: 'system',
        type: 'info',
        message: `Client ${name} joined the game`,
      } satisfies GameLog
      peer.publish(game.id, log)
      peer.send(log)
    }

    await game.update(game.toJSON())
    peer.publish(game.id, game.toJSON())
    peer.send(game.toJSON())
    console.info(`[Peer] Client ${name} (${peer.id}) joined game ${id}`)

    console.info(`[Peer] Active games: ${await getActiveGames()}`)
  },
  async message(peer, message) {
    if (message.text().includes('ping')) peer.send('pong')
    else {
      const data = await getGame(peer)
      if (!data) return peer.close(1011, 'Game ID required')
      const content = message.json<GameLog>()
      console.info(`[Peer] Message from ${peer.id}:`, content)
      peer.publish(data.id, content)
    }
  },
  async close(peer) {
    const data = await getGame(peer)
    if (!data) return
    const { game, id } = data

    peer.unsubscribe(id)
    const oldClient = game.clients.find(client => client.id === peer.id)
    if (!oldClient) return
    game.clients = game.clients.filter(client => client.id !== peer.id)

    if (peer.id === game.host) console.warn(`[Peer] Host ${game.host} exited from game ${id}`)
    else console.warn(`[Peer] Client ${peer.id} disconnected from game ${id}`)

    if (game.clients.length > 0) {
      if (peer.id === game.host) {
        const newHost = game.clients[0]
        game.host = newHost.id
        const log = {
          sender: 'system',
          type: 'warning',
          message: `Host ${oldClient.name} disconnected, ${newHost.name} is now the host`,
        } satisfies GameLog
        peer.publish(game.id, log)
        peer.send(log)
      }
      else {
        const log = {
          sender: 'system',
          type: 'info',
          message: `Client ${oldClient.name} disconnected`,
        } satisfies GameLog
        peer.publish(game.id, log)
        peer.send(log)
      }
      await game.update(game.toJSON())
      peer.publish(id, game.toJSON())
    }
    else await game.delete()

    console.info(`[Peer] Active games: ${await getActiveGames()}`)
  },
  error(peer, error) {
    console.error(`[Peer] Error: ${error.message}`)
  },
})
