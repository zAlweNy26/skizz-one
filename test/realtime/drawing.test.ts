import type { WireBrush } from '#shared/utils/protocol'
import { describe, expect, it, vi } from 'vitest'
import { COLOR_LIMITS } from '#shared/utils/protocol'
import { createWorld, seat, startDrawing } from '#test/realtime/harness'

const brush: WireBrush = { mode: 'draw', color: '#000000', size: 16 }
const STROKE = '<path d="M 10,20 L 150,800"/>'

describe('streaming strokes', () => {
  it('relays the drawer\'s strokes to everyone else, intact', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, guessers: [bob] } = await startDrawing(players)
    bob!.clear()
    drawer.clear()

    const pts = [100, 200, 0, 1500, 8000, 16]
    await drawer.send({ t: 'strokeStart', id: 's1', brush })
    await drawer.send({ t: 'draw', id: 's1', pts })
    await drawer.send({ t: 'commit', id: 's1', svg: STROKE })

    expect(bob!.messages).toEqual([
      { t: 'strokeStart', id: 's1', brush },
      { t: 'draw', id: 's1', pts },
      { t: 'commit', id: 's1', svg: STROKE },
    ])
    expect(drawer.messages).toEqual([])
  })

  it('takes strokes from nobody but the drawer, and only while drawing', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const [alice, bob] = players
    await alice.send({ t: 'start' })
    await alice.send({ t: 'commit', id: 'early', svg: STROKE })
    expect(bob.all('commit')).toEqual([])

    await alice.send({ t: 'choose', index: 0 })
    alice.clear()
    await bob.send({ t: 'strokeStart', id: 'forged', brush })
    await bob.send({ t: 'commit', id: 'forged', svg: STROKE })
    expect(alice.messages).toEqual([])
  })

  it('does not let an impersonator draw or learn the word', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, guessers: [bob], word } = await startDrawing(players)

    const spy = await world.join('Spy', { token: drawer.id })
    expect(spy.id).not.toBe(drawer.id)
    expect(JSON.stringify(spy.history)).not.toContain(`"${word}"`)
    expect(spy.all('choices')).toEqual([])

    bob!.clear()
    await spy.send({ t: 'commit', id: 'spy', svg: STROKE })
    expect(bob!.all('commit')).toEqual([])
  })
})

describe('sanitising', () => {
  it('strips script from drawings but keeps drauu\'s own markup', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, guessers: [bob] } = await startDrawing(players)
    await drawer.send({ t: 'commit', id: 'ok', svg: STROKE })
    bob!.clear()

    const handler = '<g><animate attributeName="x" dur="1s" onbegin="alert(1)"/></g>'
    await drawer.send({ t: 'commit', id: 'xss-commit', svg: handler })
    await drawer.send({ t: 'preview', id: 'xss-preview', svg: '<image href="x" onerror="alert(1)"/>' })
    await drawer.send({ t: 'canvas', svg: `${STROKE}${handler}` })
    const arrow = '<g><defs><marker id="m-1"><path d="M0,0"></path></marker></defs>'
      + '<line x1="0" y1="0" x2="9" y2="9" marker-end="url(#m-1)"></line></g>'
    await drawer.send({ t: 'commit', id: 'arrow', svg: arrow })

    expect(JSON.stringify(bob!.messages)).not.toMatch(/onbegin|onerror/)
    expect(bob!.all('canvas')).toEqual([])
    expect(bob!.all('commit').find(m => m.id === 'arrow')?.svg).toContain('marker-end="url(#m-1)"')
  })

  it('refuses a commit that would overflow the cached canvas', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, guessers: [bob] } = await startDrawing(players)
    await drawer.send({ t: 'commit', id: 'ok', svg: STROKE })
    bob!.clear()
    drawer.clear()

    await drawer.send({ t: 'commit', id: 'huge', svg: `<path d="M 0,0 ${'L 1,1 '.repeat(200_000)}"/>` })

    expect(bob!.all('commit')).toEqual([])
    expect(bob!.last('canvas')?.svg).toBe(STROKE)
    expect(drawer.last('canvas')?.svg).toBe(STROKE)
    expect(drawer.logs).toEqual(['canvasFull'])
  })
})

describe('the cached canvas', () => {
  it('catches a late joiner up on the drawing, but not the word', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, word } = await startDrawing(players)
    await drawer.send({ t: 'commit', id: 'a', svg: STROKE })
    await drawer.send({ t: 'commit', id: 'b', svg: '<path d="M 1,1"/>' })

    const carol = await world.join('Carol')
    expect(carol.last('canvas')?.svg).toBe(`${STROKE}<path d="M 1,1"/>`)
    expect(carol.last('turn')).toBeUndefined()
    expect(JSON.stringify(carol.history)).not.toContain(`"${word}"`)
  })

  it('replaces the cache on a full resync and saves it after a moment', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer } = await startDrawing(players)
    await drawer.send({ t: 'commit', id: 'a', svg: STROKE })
    await drawer.send({ t: 'canvas', svg: '<path d="M 5,5"/>' })
    expect(world.storage().data.get('canvas') ?? '').toBe('')

    await world.advance(1_000)
    expect(world.storage().data.get('canvas')).toBe('<path d="M 5,5"/>')
  })

  it('wipes the canvas for the next turn', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, guessers: [bob], word } = await startDrawing(players)
    await drawer.send({ t: 'commit', id: 'a', svg: STROKE })
    await bob!.send({ t: 'guess', text: word })
    await world.advance(5_000)

    expect(bob!.last('canvas')?.svg).toBe('')
    const carol = await world.join('Carol')
    expect(carol.all('canvas')).toEqual([])
  })
})

describe('turn rules', () => {
  it('applies the room\'s own rules to every turn', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    await players[0].send({ t: 'settings', settings: { noUndo: true, noEraser: true, colorLimit: 3 } })
    await startDrawing(players)

    const { rules } = players[1].state!
    expect(rules.noUndo).toBe(true)
    expect(rules.noEraser).toBe(true)
    expect(rules.colors).toHaveLength(3)
    expect(rules.colors).not.toContain('#FFFFFF')
  })

  it('ignores a colour limit it does not offer', async () => {
    const world = createWorld()
    const [alice] = await seat(world, 'Alice', 'Bob')
    await alice.send({ t: 'settings', settings: { colorLimit: 4 } })
    expect(COLOR_LIMITS).not.toContain(4)
    expect(alice.state!.colorLimit).toBe(0)
  })

  it('draws one random rule per turn under chaos, and says which', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    await players[0].send({ t: 'settings', settings: { chaos: true } })
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    await startDrawing(players)

    expect(players[1].state!.rules.colors.length).toBeGreaterThan(0)
    expect(players[1].state!.rules).toMatchObject({ noUndo: false, noEraser: false })
    expect(players[1].last('log')).toMatchObject({ key: 'chaosColors', params: { n: players[1].state!.rules.colors.length } })
  })

  it('lifts the rules once the turn is over', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    await players[0].send({ t: 'settings', settings: { noUndo: true } })
    const { guessers: [bob], word } = await startDrawing(players)
    await bob!.send({ t: 'guess', text: word })
    await world.advance(5_000)
    expect(bob!.state!.rules).toEqual({ noUndo: false, noEraser: false, colors: [] })
  })
})
