import { describe, expect, it } from 'vitest'
import { DRAW_TIME, KICKED_CLOSE_CODE } from '#shared/utils/protocol'
import { createWorld, seat, startDrawing } from '#test/realtime/harness'

const DRAW_MS = DRAW_TIME.default * 1000

describe('kicking', () => {
  it('tallies votes in the open and lets a voter change their mind', async () => {
    const world = createWorld()
    const [hana, pia, , rex] = await seat(world, 'Hana', 'Pia', 'Quin', 'Rex')

    await pia.send({ t: 'kick', target: rex.id, want: true })
    expect(hana.state!.kickVotes).toEqual({ [rex.id]: [pia.id] })
    expect(hana.last('log')).toMatchObject({ key: 'kickRequested', params: { name: 'Pia', target: 'Rex', votes: 1, needed: 2 } })

    await pia.send({ t: 'kick', target: rex.id, want: false })
    expect(hana.state!.kickVotes).toEqual({})
  })

  it('removes a player for good on a majority', async () => {
    const world = createWorld()
    const [hana, pia, quin, rex] = await seat(world, 'Hana', 'Pia', 'Quin', 'Rex')
    await pia.send({ t: 'kick', target: rex.id, want: true })
    await quin.send({ t: 'kick', target: rex.id, want: true })

    expect(rex.last('kicked')).toBeDefined()
    expect(rex.closed?.code).toBe(KICKED_CLOSE_CODE)
    expect(hana.state!.players.map(p => p.name)).toEqual(['Hana', 'Pia', 'Quin'])
    expect(hana.last('log')).toMatchObject({ key: 'kicked', params: { name: 'Rex' } })

    const again = await world.join('Rex')
    expect(again.last('kicked')).toBeDefined()
    expect(again.closed?.code).toBe(KICKED_CLOSE_CODE)
    expect(again.all('welcome')).toEqual([])
  })

  it('gives the host no more say than anyone else', async () => {
    const world = createWorld()
    const [hana, pia, quin] = await seat(world, 'Hana', 'Pia', 'Quin', 'Rex')
    await hana.send({ t: 'kick', target: quin.id, want: true })
    expect(quin.closed).toBeNull()
    await pia.send({ t: 'kick', target: quin.id, want: true })
    expect(quin.closed?.code).toBe(KICKED_CLOSE_CODE)
  })

  it('needs three players, and nobody can vote against themselves', async () => {
    const world = createWorld()
    const [hana, pia] = await seat(world, 'Hana', 'Pia')
    await hana.send({ t: 'kick', target: pia.id, want: true })
    await pia.send({ t: 'kick', target: hana.id, want: true })
    expect(hana.state!.kickVotes).toEqual({})

    const quin = await world.join('Quin')
    await quin.send({ t: 'kick', target: quin.id, want: true })
    await quin.send({ t: 'kick', target: 'nobody', want: true })
    expect(hana.state!.kickVotes).toEqual({})
  })

  it('moves the turn on when the drawer is kicked, and the room when the host is', async () => {
    const world = createWorld()
    const players = await seat(world, 'Hana', 'Pia', 'Sol')
    const [hana, pia, sol] = players
    await hana.send({ t: 'start' })
    expect(hana.state!.drawerId).toBe(hana.id)

    await pia.send({ t: 'kick', target: hana.id, want: true })
    await sol.send({ t: 'kick', target: hana.id, want: true })

    expect(pia.state).toMatchObject({ phase: 'choosing', drawerId: pia.id, hostId: pia.id })
    expect(pia.logs).toContain('newHost')
  })

  it('ends a drawing turn when its drawer is kicked', async () => {
    const world = createWorld()
    const players = await seat(world, 'Hana', 'Pia', 'Sol', 'Tom')
    const { drawer, guessers: [pia, sol], word } = await startDrawing(players)
    await pia!.send({ t: 'kick', target: drawer.id, want: true })
    await sol!.send({ t: 'kick', target: drawer.id, want: true })
    expect(pia!.last('roundEnd')?.word).toBe(word)
  })
})

describe('pausing', () => {
  it('pauses only when everyone agrees', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const [alice, bob, carol] = players
    await startDrawing(players)
    await world.advance(30_000)

    await alice.send({ t: 'pause', want: true })
    expect(carol.last('log')).toMatchObject({ key: 'pauseRequested', params: { name: 'Alice', votes: 1, needed: 3 } })
    await bob.send({ t: 'pause', want: true })
    expect(carol.state).toMatchObject({ paused: false, pauseVotes: [alice.id, bob.id] })

    await carol.send({ t: 'pause', want: true })
    expect(carol.state).toMatchObject({ paused: true, pauseVotes: [], endsAt: null, remainingMs: DRAW_MS - 30_000 })
    expect(carol.logs).toContain('paused')
  })

  it('freezes the clock, the canvas and the scoring, but not the chat', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const { drawer, guessers: [bob, carol], word } = await startDrawing(players)
    for (const p of players) await p.send({ t: 'pause', want: true })

    await world.advance(10 * DRAW_MS)
    expect(bob!.state).toMatchObject({ phase: 'drawing', paused: true })

    bob!.clear()
    await drawer.send({ t: 'commit', id: 'frozen', svg: '<path d="M0,0"/>' })
    expect(bob!.all('commit')).toEqual([])

    await carol!.send({ t: 'guess', text: word })
    expect(carol!.logs).toContain('guessOnHold')
    expect(bob!.logs).not.toContain('guessed')

    await carol!.send({ t: 'guess', text: 'still thinking' })
    expect(bob!.last('chat')).toMatchObject({ t: 'chat', sender: 'Carol', text: 'still thinking' })
  })

  it('resumes on a majority with the time that was left', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const [alice, bob] = players
    await startDrawing(players)
    await world.advance(30_000)
    for (const p of players) await p.send({ t: 'pause', want: true })
    await world.advance(60_000)

    await alice.send({ t: 'pause', want: true })
    expect(alice.state!.paused).toBe(true)
    expect(alice.logs).toContain('resumeRequested')
    await bob.send({ t: 'pause', want: true })

    expect(alice.state!.paused).toBe(false)
    expect(alice.state!.endsAt).toBe(Date.now() + DRAW_MS - 30_000)
    expect(alice.logs).toContain('resumed')

    await world.advance(DRAW_MS - 30_000)
    expect(alice.last('roundEnd')).toBeDefined()
  })

  it('only pauses a running countdown', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await alice.send({ t: 'pause', want: true })
    await bob.send({ t: 'pause', want: true })
    expect(alice.state).toMatchObject({ paused: false, pauseVotes: [] })

    await alice.send({ t: 'start' })
    await alice.send({ t: 'pause', want: true })
    expect(alice.state!.pauseVotes).toEqual([])
  })

  it('drops the vote of a player who leaves', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const [alice, bob, carol] = players
    await startDrawing(players)
    await carol.send({ t: 'pause', want: true })
    await bob.send({ t: 'pause', want: true })
    await carol.disconnect()

    expect(alice.state!.pauseVotes).toEqual([bob.id])
    await alice.send({ t: 'pause', want: true })
    expect(alice.state!.paused).toBe(true)
  })
})
