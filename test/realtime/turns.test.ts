import { describe, expect, it } from 'vitest'
import { DRAW_TIME, WORD_CHOICES } from '#shared/utils/protocol'
import { chooseWord, createWorld, seat, startDrawing } from '#test/realtime/harness'

const CHOOSE_MS = 15_000
const INTERMISSION_MS = 5_000

describe('starting', () => {
  it('only lets the host start', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await bob.send({ t: 'start' })
    expect(alice.state!.phase).toBe('lobby')

    await alice.send({ t: 'start' })
    expect(alice.state).toMatchObject({ phase: 'choosing', round: 1, drawerId: alice.id })
  })

  it('waits for a second player', async () => {
    const world = createWorld()
    const alice = await world.join('Alice')
    await alice.send({ t: 'start' })
    expect(alice.state!.phase).toBe('lobby')
    expect(alice.logs).toContain('waitingForPlayers')
  })
})

describe('choosing a word', () => {
  it('offers the drawer, and only the drawer, a choice of words', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await alice.send({ t: 'start' })

    const choices = alice.last('choices')!
    expect(choices.words).toHaveLength(WORD_CHOICES)
    expect(choices.canReroll).toBe(true)
    expect(bob.all('choices')).toEqual([])
    expect(bob.state!.hint).toBe('')
    expect(bob.state!.endsAt).toBe(Date.now() + CHOOSE_MS)
    expect(bob.logs).toContain('choosing')
  })

  it('lets the drawer swap the words once', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await alice.send({ t: 'start' })
    const first = alice.last('choices')!.words

    await bob.send({ t: 'reroll' })
    expect(bob.all('choices')).toEqual([])

    alice.clear()
    await alice.send({ t: 'reroll' })
    const second = alice.last('choices')!
    expect(second.words).toHaveLength(WORD_CHOICES)
    expect(second.words.filter(w => first.includes(w))).toEqual([])
    expect(second.canReroll).toBe(false)

    alice.clear()
    await alice.send({ t: 'reroll' })
    expect(alice.all('choices')).toEqual([])
  })

  it('only takes the drawer\'s pick of a word on offer', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await alice.send({ t: 'start' })

    await bob.send({ t: 'choose', index: 0 })
    await alice.send({ t: 'choose', index: 7 })
    await alice.sendUntyped({ t: 'choose', index: '0' })
    expect(alice.state!.phase).toBe('choosing')

    const words = alice.last('choices')!.words
    await alice.send({ t: 'choose', index: 1 })
    expect(alice.last('turn')!.word).toBe(words[1])
  })

  it('tells the drawer the word and everyone else only its shape', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const { drawer, guessers, word } = await startDrawing(players)

    expect(drawer.last('turn')).toMatchObject({ drawerId: drawer.id, round: 1, word })
    for (const guesser of guessers) {
      const turn = guesser.last('turn')!
      expect(turn.word).toBeUndefined()
      expect(turn.hint).toHaveLength(word.length)
      expect(turn.hint.replace(/ /g, '')).toMatch(/^_+$/)
      expect(JSON.stringify(guesser.history)).not.toContain(`"${word}"`)
    }
    expect(drawer.state!.endsAt).toBe(Date.now() + DRAW_TIME.default * 1000)
    expect(drawer.logs).toContain('drawing')
  })

  it('picks a word for a drawer who takes too long', async () => {
    const world = createWorld()
    const [alice, bob] = await seat(world, 'Alice', 'Bob')
    await alice.send({ t: 'start' })
    const words = alice.last('choices')!.words

    await world.advance(CHOOSE_MS - 1)
    expect(bob.state!.phase).toBe('choosing')
    await world.advance(1)
    expect(bob.state!.phase).toBe('drawing')
    expect(words).toContain(alice.last('turn')!.word)
  })
})

describe('the turn ending', () => {
  it('reveals the word when time is up, then hands the pen on', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const [alice, bob] = players
    const { word } = await startDrawing(players)

    await world.advance(DRAW_TIME.default * 1000)
    expect(bob.logs).toContain('timeUp')
    expect(bob.last('roundEnd')).toMatchObject({ word, state: { phase: 'intermission', drawerId: null } })

    await world.advance(INTERMISSION_MS)
    expect(alice.state).toMatchObject({ phase: 'choosing', drawerId: bob.id, round: 1 })
    expect(bob.last('choices')).toBeDefined()
    expect(alice.last('canvas')!.svg).toBe('')
  })

  it('plays every round, never repeats a word, then ends the game', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const [alice] = players
    await alice.send({ t: 'settings', settings: { totalRounds: 2 } })
    await alice.send({ t: 'start' })

    const words: string[] = []
    const drawers: string[] = []
    for (let turn = 0; turn < 4; turn++) {
      const { drawer, guessers, word } = await chooseWord(players)
      words.push(word)
      drawers.push(drawer.name)
      expect(alice.state!.round).toBe(Math.floor(turn / 2) + 1)
      await guessers[0]!.send({ t: 'guess', text: word })
      await world.advance(INTERMISSION_MS)
    }

    expect(drawers).toEqual(['Alice', 'Bob', 'Alice', 'Bob'])
    expect(new Set(words).size).toBe(4)
    expect(alice.state).toMatchObject({ phase: 'finished', drawerId: null, endsAt: null })
    expect(alice.logs.some(k => k === 'winner' || k === 'winnerByAHair')).toBe(true)
    expect(world.storage().alarm).toBeNull()
  })

  it('starts over from zero when the host plays again', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const [alice] = players
    await alice.send({ t: 'settings', settings: { totalRounds: 2 } })
    await alice.send({ t: 'start' })
    for (let turn = 0; turn < 4; turn++) {
      const { guessers, word } = await chooseWord(players)
      await guessers[0]!.send({ t: 'guess', text: word })
      await world.advance(INTERMISSION_MS)
    }
    expect(alice.state!.players.some(p => p.points > 0)).toBe(true)

    await alice.send({ t: 'start' })
    expect(alice.state).toMatchObject({ phase: 'choosing', round: 1, awards: [] })
    expect(alice.state!.players.every(p => p.points === 0)).toBe(true)
  })
})

describe('awards', () => {
  it('names the fastest guesser, the near misser and the most guessed drawer', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const [alice, bob] = players
    await alice.send({ t: 'settings', settings: { totalRounds: 2 } })
    await alice.send({ t: 'start' })

    const first = await chooseWord(players)
    expect(first.drawer).toBe(alice)
    await world.advance(3_000)
    await bob.send({ t: 'guess', text: `${first.word}xx` })
    await bob.send({ t: 'guess', text: first.word })
    await world.advance(INTERMISSION_MS)

    for (let turn = 1; turn < 4; turn++) {
      await chooseWord(players)
      await world.advance(DRAW_TIME.default * 1000 + INTERMISSION_MS)
    }

    expect(alice.state!.phase).toBe('finished')
    const awards = Object.fromEntries(alice.state!.awards.map(a => [a.key, a]))
    expect(awards.fastest).toEqual({ key: 'fastest', playerId: bob.id, value: 3_000 })
    expect(awards.almostHadIt).toEqual({ key: 'almostHadIt', playerId: bob.id, value: 1 })
    expect(awards.picasso).toEqual({ key: 'picasso', playerId: alice.id, value: 1 })
    expect(awards.mostLiked).toBeUndefined()
  })

  it('stays out of a running game', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    const { guessers, word } = await startDrawing(players)
    await guessers[0]!.send({ t: 'guess', text: word })
    expect(players[0].state!.awards).toEqual([])
  })
})
