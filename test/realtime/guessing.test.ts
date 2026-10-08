import { describe, expect, it, vi } from 'vitest'
import { DRAW_TIME, hintBudget, hintRevealAt } from '#shared/utils/protocol'
import { createWorld, seat, startDrawing } from '#test/realtime/harness'

const DRAW_MS = DRAW_TIME.default * 1000

/** Letters a guesser can see in a masked hint. */
function shown(hint: string) {
  return [...hint].filter(c => c !== '_' && c !== ' ').length
}

describe('guessing', () => {
  it('shares a wrong guess as chat and quietly tells a near miss it is close', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const { drawer, guessers: [bob, carol], word } = await startDrawing(players)

    await bob!.send({ t: 'guess', text: 'definitely not it' })
    expect(drawer.last('chat')).toEqual({ t: 'chat', sender: 'Bob', text: 'definitely not it' })
    expect(carol!.last('chat')?.text).toBe('definitely not it')

    await bob!.send({ t: 'guess', text: `${word}x` })
    expect(bob!.last('log')).toMatchObject({ key: 'close', params: { text: `${word}x` } })
    expect(carol!.logs).not.toContain('close')
  })

  it('scores a correct guess without ever echoing it', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, guessers: [bob], word } = await startDrawing(players)
    drawer.clear()

    await world.advance(10_000)
    await bob!.send({ t: 'guess', text: word })

    expect(drawer.all('log').find(l => l.key === 'guessed')?.params).toEqual({ name: 'Bob' })
    expect(drawer.chat).toEqual([])
    const scores = Object.fromEntries(drawer.state!.players.map(p => [p.name, p]))
    expect(scores.Bob!.points).toBeGreaterThan(0)
    expect(scores.Bob!.guessed).toBe(true)
    expect(scores.Alice!.points).toBeGreaterThan(0)
    expect(drawer.state!.players.every(p => Number.isInteger(p.points))).toBe(true)
    expect(drawer.state!.players.map(p => p.rank).sort()).toEqual([1, 2])
  })

  it('ignores case, accents and spacing', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { guessers: [bob], word } = await startDrawing(players)
    const sloppy = `  ${[...word].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join('').replace(/e/g, 'é')}  `
    await bob!.send({ t: 'guess', text: sloppy })
    expect(bob!.state!.players.find(p => p.id === bob!.id)!.guessed).toBe(true)
  })

  it('pays an earlier guess more than a later one', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol', 'Dan')
    const { guessers: [bob, carol], word } = await startDrawing(players)
    await bob!.send({ t: 'guess', text: word })
    await carol!.send({ t: 'guess', text: word })
    const points = Object.fromEntries(bob!.state!.players.map(p => [p.name, p.points]))
    expect(points.Bob).toBeGreaterThan(points.Carol!)
  })

  it('ends the turn as soon as everyone has guessed', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const { drawer, guessers: [bob, carol], word } = await startDrawing(players)

    await bob!.send({ t: 'guess', text: word })
    expect(drawer.state!.phase).toBe('drawing')
    await carol!.send({ t: 'guess', text: word })
    expect(drawer.last('roundEnd')?.word).toBe(word)
  })

  it('keeps the chat of those who know the word away from those still guessing', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const { drawer, guessers: [bob, carol], word } = await startDrawing(players)
    await bob!.send({ t: 'guess', text: word })
    for (const p of players) p.clear()

    await bob!.send({ t: 'guess', text: 'psst, easy one' })
    await bob!.send({ t: 'chat', text: 'so easy' })
    await drawer.send({ t: 'guess', text: `thanks! it was ${word}` })

    expect(drawer.chat.map(c => c.text)).toEqual(['psst, easy one', 'so easy', `thanks! it was ${word}`])
    expect(drawer.chat.every(c => c.private)).toBe(true)
    expect(bob!.chat.at(-1)).toMatchObject({ sender: 'Alice', private: true })
    expect(carol!.chat).toEqual([])
  })

  it('treats guesses outside a drawing turn as chat', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await bob.send({ t: 'guess', text: '  hello  ' })
    expect(alice.last('chat')).toEqual({ t: 'chat', sender: 'Bob', text: 'hello' })
    await bob.send({ t: 'guess', text: '   ' })
    expect(alice.chat).toHaveLength(1)
  })

  it('cuts a spray of guesses down to the burst', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, guessers: [bob], word } = await startDrawing(players)
    drawer.clear()

    for (let i = 0; i < 30; i++) await bob!.send({ t: 'guess', text: `nope-${i}` })
    await bob!.send({ t: 'guess', text: word })

    expect(drawer.chat).toHaveLength(5)
    expect(bob!.logs).toContain('slowDown')
    expect(drawer.state!.players.some(p => p.guessed)).toBe(false)

    await world.advance(1_000)
    await bob!.send({ t: 'guess', text: word })
    expect(drawer.logs).toContain('guessed')
  })
})

describe('hints', () => {
  it('reveals letters on schedule, never the whole word', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const [, bob] = players
    const { word } = await startDrawing(players)
    const budget = hintBudget(word, 2)

    for (let n = 1; n <= budget; n++) {
      await world.advance(hintRevealAt(n, DRAW_MS, budget) - (DRAW_MS - (bob.state!.endsAt! - Date.now())) - 1)
      expect(shown(bob.state!.hint)).toBe(n - 1)
      await world.advance(1)
      expect(shown(bob.state!.hint)).toBe(n)
    }
    expect(bob.state!.hint).toHaveLength(word.length)
    expect(bob.state!.hint).toContain('_')
  })

  it('reveals nothing when hints are off', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    await players[0].send({ t: 'settings', settings: { hints: 0 } })
    await startDrawing(players)
    await world.advance(DRAW_MS - 1)
    expect(shown(players[1].state!.hint)).toBe(0)
  })
})

describe('reactions', () => {
  it('shows the drawer likes that never score', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, guessers: [bob] } = await startDrawing(players)
    const points = drawer.state!.players.map(p => p.points)

    await bob!.send({ t: 'react', reaction: 'like' })
    expect(drawer.state!.reactions).toEqual({ [bob!.id]: 'like' })
    expect(drawer.state!.players.map(p => p.points)).toEqual(points)

    await bob!.sendUntyped({ t: 'react', reaction: 'meh' })
    expect(drawer.state!.reactions).toEqual({ [bob!.id]: 'like' })
    await bob!.send({ t: 'react', reaction: null })
    expect(drawer.state!.reactions).toEqual({})

    await drawer.send({ t: 'react', reaction: 'like' })
    expect(drawer.state!.reactions).toEqual({})
  })

  it('crowns the most liked drawing', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const [alice] = players
    vi.spyOn(Math, 'random').mockReturnValue(0)
    await alice.send({ t: 'settings', settings: { totalRounds: 2 } })
    const { drawer, guessers } = await startDrawing(players)
    for (const g of guessers) await g.send({ t: 'react', reaction: 'like' })
    await world.advance(DRAW_MS * 10)
    await world.advance(DRAW_MS * 10)
    expect(alice.state!.phase).toBe('finished')
    expect(alice.state!.awards.find(a => a.key === 'mostLiked')).toEqual({ key: 'mostLiked', playerId: drawer.id, value: 2 })
  })

  it('keeps voting open through the intermission, still not for the drawer', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { drawer, guessers: [bob] } = await startDrawing(players)
    await world.advance(DRAW_MS)
    expect(bob!.state!.phase).toBe('intermission')
    expect(bob!.state!.reactionsFor).toBe(drawer.id)

    await bob!.send({ t: 'react', reaction: 'like' })
    expect(drawer.state!.reactions).toEqual({ [bob!.id]: 'like' })
    await drawer.send({ t: 'react', reaction: 'dislike' })
    expect(drawer.state!.reactions).toEqual({ [bob!.id]: 'like' })

    await world.advance(5_000)
    expect(bob!.state!.phase).toBe('choosing')
    expect(bob!.state!.reactions).toEqual({})
    expect(bob!.state!.reactionsFor).toBeNull()
  })

  it('counts likes given during the intermission towards the most liked drawing', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const [alice] = players
    vi.spyOn(Math, 'random').mockReturnValue(0)
    await alice.send({ t: 'settings', settings: { totalRounds: 1 } })
    const { drawer, guessers } = await startDrawing(players)
    await world.advance(DRAW_MS)
    for (const g of guessers) await g.send({ t: 'react', reaction: 'like' })
    await world.advance(DRAW_MS * 10)
    expect(alice.state!.phase).toBe('finished')
    expect(alice.state!.awards.find(a => a.key === 'mostLiked')).toEqual({ key: 'mostLiked', playerId: drawer.id, value: 2 })
  })
})
