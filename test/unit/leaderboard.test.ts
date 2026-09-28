import type { GamePlayer } from '../../shared/utils/protocol'
import { describe, expect, it } from 'vitest'
import { podium } from '../../app/utils/leaderboard'

function player(id: string, points: number): GamePlayer {
  return { id, name: id, points, connected: true, guessed: false }
}

describe('podium', () => {
  it('keeps the top three in order', () => {
    const places = podium([player('a', 300), player('b', 200), player('c', 100), player('d', 50)])
    expect(places.map(p => [p.player.id, p.rank])).toEqual([['a', 1], ['b', 2], ['c', 3]])
  })

  it('lets tied scores share a rank', () => {
    const places = podium([player('a', 300), player('b', 300), player('c', 100)])
    expect(places.map(p => p.rank)).toEqual([1, 1, 3])
  })

  it('handles fewer than three players', () => {
    expect(podium([player('a', 10)])).toHaveLength(1)
    expect(podium([])).toEqual([])
  })
})
