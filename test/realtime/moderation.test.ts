import { describe, expect, it } from 'vitest'
import { createWorld, seat } from '#test/realtime/harness'

describe('names', () => {
  it('masks a blocked name', async () => {
    const world = createWorld()
    const alice = await world.join('Alice')
    const rude = await world.join('Sh1t', { token: 'rude' })
    await world.join('shit lord', { token: 'lord' })

    expect(rude.id).toBeTruthy()
    expect(alice.state!.players.map(p => p.name)).toEqual(['Alice', 'S***', 's*** lord'])
  })

  it('lists a public room under its masked host name', async () => {
    const world = createWorld()
    const lobby = await world.watchLobby()
    await world.join('cazzo', { public: true })
    expect(lobby.rooms[0]?.hostName).toBe('c****')
  })

  it('leaves chat as written', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await bob.send({ t: 'chat', text: 'what the fuck' })
    expect(alice.last('chat')?.text).toBe('what the fuck')
  })
})
