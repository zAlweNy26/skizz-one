import { describe, expect, it } from 'vitest'
import { summarizeStats } from '#shared/utils/stats'

const rows = {
  started: [
    { kind: 'first', games: '8', players: '30' },
    { kind: 'rematch', games: 2, players: 8 },
  ],
  finished: [
    { outcome: 'completed', games: 5, ms: 5 * 12 * 60_000 },
    { outcome: 'abandoned', games: 3, ms: 3 * 60_000 },
  ],
  turns: [
    { reason: 'guessed', turns: 30 },
    { reason: 'timeUp', turns: 9 },
    { reason: 'drawerGone', turns: 1 },
  ],
  words: [
    { language: 'en', word: 'cat', turns: 4, guessers: 12, correct: 12 },
    { language: 'en', word: 'volcano', turns: 3, guessers: 9, correct: 1 },
    { language: 'it', word: 'gatto', turns: 5, guessers: 10, correct: 6 },
    { language: 'en', word: 'rare', turns: 2, guessers: 6, correct: 0 },
  ],
}

describe('summarizeStats', () => {
  it('turns query rows into the page\'s numbers', () => {
    const stats = summarizeStats(rows)
    expect(stats).toMatchObject({
      games: 10,
      rematchRate: 2 / 5,
      completedShare: 5 / 8,
      avgPlayers: 3.8,
      avgMinutes: 12,
      turns: { guessed: 30, timeUp: 9, drawerGone: 1, drawerKicked: 0 },
      totalTurns: 40,
    })
  })

  it('ranks words by how many guessers got them, once they have enough turns', () => {
    const stats = summarizeStats(rows)
    expect(stats.hardest.map(w => w.word)).toEqual(['volcano', 'gatto', 'cat'])
    expect(stats.easiest.map(w => w.word)).toEqual(['cat', 'gatto', 'volcano'])
    expect(stats.hardest[0]).toEqual({ language: 'en', word: 'volcano', turns: 3, guessedShare: 1 / 9 })
  })

  it('has nothing to divide by when nothing happened', () => {
    const stats = summarizeStats({ started: [], finished: [], turns: [], words: [] })
    expect(stats).toMatchObject({
      games: 0,
      rematchRate: null,
      completedShare: null,
      avgPlayers: null,
      avgMinutes: null,
    })
  })
})
