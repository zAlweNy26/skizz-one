import { describe, expect, it } from 'vitest'
import { AWAY_GRACE_MS, DRAW_TIME } from '#shared/utils/protocol'
import { createWorld, seat, startDrawing } from '#test/realtime/harness'

const DRAW_MS = DRAW_TIME.default * 1000

describe('waking from hibernation', () => {
  it('picks up a turn where it left off', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const { drawer, guessers: [bob, carol], word } = await startDrawing(players)
    await world.advance(10_000)

    world.hibernate()
    await bob!.send({ t: 'guess', text: word })
    expect(drawer.last('log')).toMatchObject({ key: 'guessed', params: { name: 'Bob' } })
    expect(carol!.state!.players.find(p => p.id === bob!.id)!.guessed).toBe(true)

    world.hibernate()
    await world.advance(DRAW_MS - 10_000)
    expect(carol!.last('roundEnd')?.word).toBe(word)
  })

  it('still knows who each socket belongs to', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, guessers: [bob] } = await startDrawing(players)

    world.hibernate()
    bob!.clear()
    await drawer.send({ t: 'commit', id: 'after', svg: '<path d="M0,0"/>' })
    expect(bob!.last('commit')?.id).toBe('after')

    world.hibernate()
    drawer.clear()
    await bob!.send({ t: 'commit', id: 'forged', svg: '<path d="M0,0"/>' })
    expect(drawer.messages).toEqual([])
  })

  it('keeps the saved canvas for late joiners', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer } = await startDrawing(players)
    await drawer.send({ t: 'commit', id: 'a', svg: '<path d="M 1,1"/>' })
    await world.advance(1_000)

    world.hibernate()
    const carol = await world.join('Carol')
    expect(carol.last('canvas')?.svg).toBe('<path d="M 1,1"/>')
  })

  it('still lets an away player\'s grace run out', async () => {
    const world = createWorld()
    const [alice, bob, carol] = await seat(world, 'Alice', 'Bob', 'Carol')
    await bob.disconnect()

    world.hibernate()
    await world.advance(AWAY_GRACE_MS)
    expect(alice.state!.players.map(p => p.name)).toEqual(['Alice', 'Carol'])
    expect(carol.logs).toContain('disconnected')
  })

  it('remembers who was kicked', async () => {
    const world = createWorld()
    const [, pia, quin, rex] = await seat(world, 'Hana', 'Pia', 'Quin', 'Rex')
    await pia.send({ t: 'kick', target: rex.id, want: true })
    await quin.send({ t: 'kick', target: rex.id, want: true })

    world.hibernate()
    const again = await world.join('Rex')
    expect(again.last('kicked')).toBeDefined()
  })
})
