import { describe, expect, it } from 'vitest'
import { AWAY_GRACE_MS, DRAW_TIME, DRAWER_GRACE_MS } from '#shared/utils/protocol'
import { createWorld, seat, startDrawing } from '#test/realtime/harness'

const ROOM_RETENTION_MS = 15 * 60_000

describe('a dropped player', () => {
  it('keeps their seat while away, and comes back quietly', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    alice.clear()

    await bob.disconnect()
    const away = alice.state!.players.find(p => p.id === bob.id)!
    expect(away).toMatchObject({ away: true, connected: true })

    await world.advance(AWAY_GRACE_MS - 1)
    const back = await world.join('Bob')
    expect(back.id).toBe(bob.id)
    expect(alice.state!.players.find(p => p.id === bob.id)).toMatchObject({ away: false, connected: true })
    expect(alice.logs).not.toContain('disconnected')
  })

  it('stays put while another tab is still open', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    const secondTab = await world.join('Bob')
    expect(alice.state!.players).toHaveLength(2)

    await bob.disconnect()
    expect(alice.state!.players.find(p => p.id === bob.id)!.away).toBe(false)
    await secondTab.disconnect()
    expect(alice.state!.players.find(p => p.id === bob.id)!.away).toBe(true)
  })

  it('loses their seat once the grace runs out', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await bob.disconnect()
    await world.advance(AWAY_GRACE_MS)

    expect(alice.last('log')).toMatchObject({ key: 'disconnected', params: { name: 'Bob' } })
    expect(alice.state!.players.map(p => p.name)).toEqual(['Alice'])
  })

  it('hands the room over when the host leaves', async () => {
    const world = createWorld()
    const [alice, bob, carol] = await seat(world, 'Alice', 'Bob', 'Carol')
    await alice.send({ t: 'settings', settings: { customWords: ['zeppelin'] } })
    await alice.disconnect()
    await bob.disconnect()
    await world.advance(AWAY_GRACE_MS)

    expect(carol.state!.hostId).toBe(carol.id)
    expect(carol.all('log').find(l => l.key === 'hostLeft')?.params).toEqual({ name: 'Alice', host: 'Carol' })
    expect(carol.last('customWords')?.words).toEqual(['zeppelin'])
  })
})

describe('a dropped drawer', () => {
  it('freezes the turn, then picks up where they left off', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, guessers: [bob], word } = await startDrawing(players)
    await world.advance(20_000)

    await drawer.disconnect()
    expect(bob!.state!.endsAt).toBeNull()
    expect(bob!.logs).toContain('drawerDropped')

    await world.advance(DRAWER_GRACE_MS - 1)
    const back = await world.join(drawer.name)
    expect(back.last('turn')).toMatchObject({ word })
    expect(bob!.logs).toContain('reconnected')
    expect(bob!.state!.endsAt).toBe(Date.now() + DRAW_TIME.default * 1000 - 20_000)
  })

  it('forfeits the turn if they don\'t make it back', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const { drawer, guessers: [bob], word } = await startDrawing(players)
    await drawer.disconnect()
    await world.advance(DRAWER_GRACE_MS)

    expect(bob!.logs).toContain('drawerGone')
    expect(bob!.last('roundEnd')?.word).toBe(word)
  })

  it('is skipped if they are gone when the word must be picked', async () => {
    const world = createWorld()
    const [alice, bob, carol] = await seat(world, 'Alice', 'Bob', 'Carol')
    await alice.send({ t: 'start' })
    await alice.disconnect()
    await world.advance(15_000)

    expect(bob.logs).toContain('drawerGone')
    expect(bob.state).toMatchObject({ phase: 'choosing', drawerId: bob.id })
    expect(carol.all('choices')).toEqual([])
  })
})

describe('the room emptying', () => {
  it('ends the round once the only player still guessing leaves', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const { drawer, guessers: [bob, carol], word } = await startDrawing(players)
    await bob!.send({ t: 'guess', text: word })
    await carol!.disconnect()
    expect(drawer.last('roundEnd')?.word).toBe(word)
  })

  it('ends the game when one player is left', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, guessers: [bob] } = await startDrawing(players)
    await bob!.disconnect()
    await world.advance(AWAY_GRACE_MS)

    expect(drawer.state).toMatchObject({ phase: 'finished', paused: false })
    expect(drawer.logs.some(k => k === 'winner' || k === 'winnerByAHair')).toBe(true)
  })

  it('drops departed players from the lobby roster', async () => {
    const world = createWorld()
    const [alice, bob, carol] = await seat(world, 'Alice', 'Bob', 'Carol')
    await bob.disconnect()
    await world.advance(AWAY_GRACE_MS)
    expect(alice.state!.players.map(p => p.name)).toEqual(['Alice', 'Carol'])
    expect(carol.state!.players).toHaveLength(2)
  })

  it('forgets an empty room after a while', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await alice.send({ t: 'settings', settings: { drawTime: 30 } })
    await alice.disconnect()
    await bob.disconnect()
    await world.advance(AWAY_GRACE_MS + ROOM_RETENTION_MS)

    expect(world.storage().data.size).toBe(0)
    expect(world.storage().alarm).toBeNull()

    world.hibernate()
    const carol = await world.join('Carol')
    expect(carol.state).toMatchObject({ hostId: carol.id, drawTime: DRAW_TIME.default })
    expect(carol.state!.players).toHaveLength(1)
  })

  it('keeps an empty room for anyone who comes back in time', async () => {
    const world = createWorld()
    const alice = await world.join('Alice')
    await alice.send({ t: 'settings', settings: { drawTime: 30 } })
    await alice.disconnect()
    await world.advance(AWAY_GRACE_MS + ROOM_RETENTION_MS - 1)

    const back = await world.join('Alice')
    expect(back.state!.drawTime).toBe(30)
  })
})
