import { describe, expect, it, vi } from 'vitest'
import { AWAY_GRACE_MS, PRIVATE_ROOM_CAP, PUBLIC_ROOM_CAP, ROOM_FULL_CLOSE_CODE } from '#shared/utils/protocol'
import { createWorld, ROOM, startDrawing } from '#test/realtime/harness'

const STALE_MS = 30 * 60_000

describe('the public room list', () => {
  it('never lists a private room', async () => {
    const world = createWorld()
    await world.join('Pat')
    expect(world.listings()).toEqual([])
    expect(await world.quickPlay()).toBeNull()
  })

  it('lists a public room and follows its player count', async () => {
    const world = createWorld()
    const hugo = await world.join('Hugo', { public: true })
    expect(hugo.state!.public).toBe(true)
    expect(world.listings()).toEqual([
      { id: ROOM, hostName: 'Hugo', players: 1, language: 'en', phase: 'lobby', round: 0, totalRounds: 3 },
    ])

    await world.join('Jo')
    expect(world.listings()[0]!.players).toBe(2)
  })

  it('lists rooms until the host makes them private', async () => {
    const world = createWorld()
    const hugo = await world.join('Hugo', { public: true })
    const jo = await world.join('Jo', { public: true })

    await jo.send({ t: 'settings', settings: { public: false } })
    expect(world.listings()).toHaveLength(1)
    await hugo.send({ t: 'settings', settings: { public: false } })
    expect(world.listings()).toEqual([])
    await hugo.send({ t: 'settings', settings: { public: true } })
    expect(world.listings()).toHaveLength(1)
  })

  it('counts away players out, and takes down a room nobody is in', async () => {
    const world = createWorld()
    const hugo = await world.join('Hugo', { public: true })
    const jo = await world.join('Jo')
    await jo.disconnect()
    expect(world.listings()[0]?.players).toBe(1)

    await hugo.disconnect()
    expect(world.listings()).toEqual([])
    await world.advance(AWAY_GRACE_MS)
    expect(world.listings()).toEqual([])
  })

  it('stays quiet when a woken room reports an unchanged listing', async () => {
    const world = createWorld()
    const hugo = await world.join('Hugo', { public: true })
    const put = vi.spyOn(world.lobbyStorage(), 'put')

    world.hibernate()
    await hugo.send({ t: 'settings', settings: { drawTime: 90 } })
    expect(put).not.toHaveBeenCalled()
  })

  it('checks a listing that has gone quiet with its room', async () => {
    const world = createWorld()
    await world.join('Hugo', { public: true })
    await world.join('Zed', { room: 'ffff0000', public: true })
    expect(world.listings()).toHaveLength(2)

    await world.rooms.states.get('ffff0000')!.storage.deleteAll()
    world.rooms.evict('ffff0000')
    await world.advance(STALE_MS)
    expect(world.listings().map(room => room.id)).toEqual([ROOM])
  })
})

describe('quick play', () => {
  it('picks any open room at random', async () => {
    const world = createWorld()
    await world.join('Hugo', { public: true })
    await world.join('Zed', { room: 'ffff0000', public: true })
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99)
    expect(await world.quickPlay()).toBe(ROOM)
    expect(await world.quickPlay()).toBe('ffff0000')
  })

  it('skips full rooms', async () => {
    const world = createWorld()
    for (let i = 0; i < PUBLIC_ROOM_CAP; i++) await world.join(`P${i}`, { public: true })
    expect(world.listings()).toHaveLength(1)
    expect(await world.quickPlay()).toBeNull()
  })

  it('skips finished games', async () => {
    const world = createWorld()
    const players = [await world.join('Hugo', { public: true }), await world.join('Jo')]
    await startDrawing(players)
    await players[1]!.disconnect()
    await world.advance(60_000)
    expect(world.listings()[0]?.phase).toBe('finished')
    expect(await world.quickPlay()).toBeNull()
  })
})

describe('a full room', () => {
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

  it('gives a private room more seats', async () => {
    const world = createWorld()
    for (let i = 0; i < PRIVATE_ROOM_CAP; i++) await world.join(`P${i}`)
    const extra = await world.join('Xan')
    expect(extra.closed?.code).toBe(ROOM_FULL_CLOSE_CODE)
    expect(extra.all('welcome')).toEqual([])
  })
})
