import { describe, expect, it } from 'vitest'
import { DRAW_TIME } from '#shared/utils/protocol'
import { chooseWord, createWorld, ROOM, seat, startDrawing } from '#test/realtime/harness'

const DRAW_MS = DRAW_TIME.default * 1000
const INTERMISSION_MS = 5_000

describe('game analytics', () => {
  it('records a game starting, with nothing that names a player', async () => {
    const world = createWorld()
    const [alice] = await seat(world, 'Alice', 'Bob', 'Carol')
    await alice.send({ t: 'start' })

    expect(world.events).toEqual([{
      indexes: [ROOM],
      blobs: ['game_started', 'en', 'private', 'first'],
      doubles: [3, 3, DRAW_TIME.default],
    }])
    expect(JSON.stringify(world.events)).not.toMatch(/Alice|Bob|Carol|token/)
  })

  it('does not count a start that waits for more players', async () => {
    const world = createWorld()
    const alice = await world.join('Alice')
    await alice.send({ t: 'start' })
    expect(world.events).toEqual([])
  })

  it('records how each turn ended, with its word', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob', 'Carol')
    const { guessers: [bob], word } = await startDrawing(players)
    await world.advance(20_000)
    await bob!.send({ t: 'guess', text: word })
    await world.advance(DRAW_MS)

    expect(world.events.at(-1)).toEqual({
      indexes: [ROOM],
      blobs: ['turn_ended', 'en', 'timeUp', word],
      doubles: [2, 1, DRAW_MS],
    })

    const next = await chooseWord(players)
    await world.advance(5_000)
    for (const guesser of next.guessers) await guesser.send({ t: 'guess', text: next.word })
    expect(world.events.at(-1)!.blobs).toEqual(['turn_ended', 'en', 'guessed', next.word])
    expect(world.events.at(-1)!.doubles).toEqual([2, 2, 5_000])
  })

  it('records a completed game, then a rematch', async () => {
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

    const finished = world.events.find(e => e.blobs?.[0] === 'game_finished')!
    expect(finished.blobs).toEqual(['game_finished', 'en', 'completed'])
    expect(finished.doubles).toEqual([2, 2, 4 * INTERMISSION_MS])

    await alice.send({ t: 'start' })
    expect(world.events.at(-1)!.blobs).toEqual(['game_started', 'en', 'private', 'rematch'])
  })

  it('records a game abandoned by its players', async () => {
    const world = createWorld()
    const players = await seat(world, 'Alice', 'Bob')
    await startDrawing(players)
    await players[1].disconnect()
    await world.advance(60_000)

    expect(world.events.at(-1)).toMatchObject({ blobs: ['game_finished', 'en', 'abandoned'], doubles: [1, 1, 60_000] })
  })
})
