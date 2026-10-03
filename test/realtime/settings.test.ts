import { describe, expect, it, vi } from 'vitest'
import { DRAW_TIME, HINTS, ROUNDS } from '#shared/utils/protocol'
import { createWorld, seat, startDrawing } from '#test/realtime/harness'

describe('settings', () => {
  it('can only be changed by the host', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    alice.clear()
    await bob.send({ t: 'settings', settings: { language: 'it', drawTime: 30 } })
    expect(alice.messages).toEqual([])
  })

  it('clamps numbers and ignores values of the wrong type', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await alice.sendUntyped({ t: 'settings', settings: { drawTime: 9999, totalRounds: 1, hints: 'lots' } })
    expect(bob.state).toMatchObject({ drawTime: DRAW_TIME.max, totalRounds: ROUNDS.min, hints: HINTS.default })

    await alice.sendUntyped({ t: 'settings', settings: { drawTime: -5, public: 'yes', chaos: 1 } })
    expect(bob.state).toMatchObject({ drawTime: DRAW_TIME.min, public: false, chaos: false })

    await alice.sendUntyped({ t: 'settings', settings: null })
    await alice.sendUntyped({ t: 'settings' })
    expect(bob.state!.drawTime).toBe(DRAW_TIME.min)
  })

  it('switches the word language and says so', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await alice.send({ t: 'settings', settings: { language: 'it' } })
    expect(bob.state!.language).toBe('it')
    expect(bob.last('log')?.key).toBe('languageChanged')

    bob.clear()
    await alice.sendUntyped({ t: 'settings', settings: { language: 'xx' } })
    expect(bob.state!.language).toBe('it')
    expect(bob.logs).toEqual([])
  })

  it('cleans custom words and shows them to the host alone', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await alice.send({ t: 'settings', settings: { customWords: ['Zeppelin', 'rock-n-roll', 'zeppelin', '  ice   cream '] } })

    expect(bob.state!.customWordCount).toBe(2)
    expect(alice.last('customWords')?.words).toEqual(['zeppelin', 'ice cream'])
    expect(bob.all('customWords')).toEqual([])
    expect(JSON.stringify(bob.history)).not.toContain('zeppelin')
  })

  it('sends a returning host their custom words', async () => {
    const world = createWorld()
    const alice = await world.join('Alice')
    await alice.send({ t: 'settings', settings: { customWords: ['zeppelin'] } })
    await alice.disconnect()
    const back = await world.join('Alice')
    expect(back.last('customWords')?.words).toEqual(['zeppelin'])
  })

  it('stay fixed during a game and open up again when it ends', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const [alice, bob] = players
    await alice.send({ t: 'settings', settings: { totalRounds: 2 } })
    await startDrawing(players)
    await alice.send({ t: 'settings', settings: { drawTime: 30 } })
    expect(bob.state!.drawTime).toBe(DRAW_TIME.default)

    await bob.disconnect()
    await world.advance(60_000)
    expect(alice.state!.phase).toBe('finished')
    await alice.send({ t: 'settings', settings: { drawTime: 30 } })
    expect(alice.state!.drawTime).toBe(30)
  })

  it('deals custom words into the choices', async () => {
    const world = createWorld()
    const [alice] = await seat(world, 'Alice', 'Bob')
    await alice.send({ t: 'settings', settings: { customWords: ['blorp', 'flimflam', 'snorkel cat'] } })
    vi.spyOn(Math, 'random').mockReturnValue(0.9999)
    await alice.send({ t: 'start' })
    expect(alice.last('choices')!.words.sort()).toEqual(['blorp', 'flimflam', 'snorkel cat'])
  })
})
