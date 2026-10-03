import { describe, expect, it } from 'vitest'
import { AWAY_GRACE_MS, PUBLIC_ROOM_CAP, ROOM_FULL_CLOSE_CODE } from '#shared/utils/protocol'
import { createWorld, ROOM } from '#test/realtime/harness'

const STALE_MS = 30 * 60_000

describe('the public room list', () => {
  it('sends the list on connect', async () => {
    const world = createWorld()
    const lobby = await world.watchLobby()
    expect(lobby.last('rooms')).toEqual({ t: 'rooms', rooms: [] })
  })

  it('never lists a private room', async () => {
    const world = createWorld()
    const lobby = await world.watchLobby()
    await world.join('Pat')
    expect(lobby.rooms).toEqual([])
  })

  it('lists a public room and follows its player count', async () => {
    const world = createWorld()
    const lobby = await world.watchLobby()
    const hugo = await world.join('Hugo', { public: true })
    expect(hugo.state!.public).toBe(true)
    expect(lobby.rooms).toEqual([
      { id: ROOM, hostName: 'Hugo', players: 1, language: 'en', phase: 'lobby', round: 0, totalRounds: 3 },
    ])

    await world.join('Jo')
    expect(lobby.rooms[0]!.players).toBe(2)
  })

  it('lists rooms until the host makes them private', async () => {
    const world = createWorld()
    const lobby = await world.watchLobby()
    const hugo = await world.join('Hugo', { public: true })
    const jo = await world.join('Jo', { public: true })

    await jo.send({ t: 'settings', settings: { public: false } })
    expect(lobby.rooms).toHaveLength(1)
    await hugo.send({ t: 'settings', settings: { public: false } })
    expect(lobby.rooms).toEqual([])
    await hugo.send({ t: 'settings', settings: { public: true } })
    expect(lobby.rooms).toHaveLength(1)
  })

  it('counts away players out, and takes down a room nobody is in', async () => {
    const world = createWorld()
    const lobby = await world.watchLobby()
    const hugo = await world.join('Hugo', { public: true })
    const jo = await world.join('Jo')
    await jo.disconnect()
    expect(lobby.rooms[0]?.players).toBe(1)

    await hugo.disconnect()
    expect(lobby.rooms).toEqual([])
    await world.advance(AWAY_GRACE_MS)
    expect(lobby.rooms).toEqual([])
  })

  it('checks a listing that has gone quiet with its room', async () => {
    const world = createWorld()
    const lobby = await world.watchLobby()
    await world.join('Hugo', { public: true })
    await world.join('Zed', { room: 'ffff0000', public: true })
    expect(lobby.rooms).toHaveLength(2)

    await world.rooms.states.get('ffff0000')!.storage.deleteAll()
    world.rooms.evict('ffff0000')
    await world.advance(STALE_MS)
    expect(lobby.rooms.map(room => room.id)).toEqual([ROOM])
  })
})

describe('a full public room', () => {
  it('turns newcomers away but lets its own players back in', async () => {
    const world = createWorld()
    const seated = []
    for (let i = 0; i < PUBLIC_ROOM_CAP; i++) seated.push(await world.join(`P${i}`, { public: true }))

    const extra = await world.join('Xan')
    expect(extra.last('roomFull')).toBeDefined()
    expect(extra.closed?.code).toBe(ROOM_FULL_CLOSE_CODE)
    expect(extra.all('welcome')).toEqual([])

    const last = seated.at(-1)!
    await last.disconnect()
    const back = await world.join(last.name)
    expect(back.id).toBe(last.id)

    await world.join('P0')
    expect(seated[0]!.state!.players).toHaveLength(PUBLIC_ROOM_CAP)
  })

  it('does not cap a private room', async () => {
    const world = createWorld()
    for (let i = 0; i <= PUBLIC_ROOM_CAP; i++) await world.join(`P${i}`)
    const extra = await world.join('Xan')
    expect(extra.closed).toBeNull()
    expect(extra.state!.players).toHaveLength(PUBLIC_ROOM_CAP + 2)
  })
})
