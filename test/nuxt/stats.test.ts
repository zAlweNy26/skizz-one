import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { summarizeStats } from '#shared/utils/stats'
import StatsPage from '~/pages/stats.vue'

const stats = summarizeStats({
  started: [{ kind: 'first', games: 3, players: 12 }, { kind: 'rematch', games: 1, players: 4 }],
  finished: [{ outcome: 'completed', games: 2, ms: 2 * 15 * 60_000 }],
  turns: [{ reason: 'guessed', turns: 6 }, { reason: 'timeUp', turns: 2 }],
  words: [
    { language: 'en', word: 'volcano', turns: 3, guessers: 9, correct: 1 },
    { language: 'it', word: 'gatto', turns: 3, guessers: 9, correct: 9 },
  ],
})

describe('stats page', () => {
  it('shows the headline numbers and the word rankings', async () => {
    registerEndpoint('/api/stats', () => ({ days: 30, stats }))
    const page = await mountSuspended(StatsPage)
    await flushPromises()

    const text = page.text()
    expect(text).toContain('Games played')
    expect(text).toContain('4')
    expect(text).toContain('50%')
    expect(text).toContain('How 8 turns ended')
    expect(text).toContain('volcano')
    expect(text).toContain('Share of guessers who got it')
    expect(text).toContain('11%')
  })

  it('says so when there are no games yet', async () => {
    registerEndpoint('/api/stats', () => ({ days: 30, stats: null }))
    const page = await mountSuspended(StatsPage)
    await flushPromises()
    expect(page.text()).toContain('No games in this period yet')
  })
})
