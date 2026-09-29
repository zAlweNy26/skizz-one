import type { GamePlayer } from '#shared/utils/protocol'
import { describe, expect, it } from 'vitest'
import { leaderId, podium } from '~/utils/game'

function player(id: string, points: number, rank: number): GamePlayer {
  return { id, name: id, avatar: id, points, rank, connected: true, away: false, guessed: false }
}

describe('podium', () => {
  it('keeps the top three in order', () => {
    const places = podium([player('a', 300, 1), player('b', 200, 2), player('c', 100, 3), player('d', 50, 4)])
    expect(places.map(p => [p.player.id, p.rank])).toEqual([['a', 1], ['b', 2], ['c', 3]])
  })

  it('never shares a place, even on equal points', () => {
    const places = podium([player('a', 300, 1), player('b', 300, 2), player('c', 100, 3)])
    expect(places.map(p => p.rank)).toEqual([1, 2, 3])
  })

  it('handles fewer than three players', () => {
    expect(podium([player('a', 10, 1)])).toHaveLength(1)
    expect(podium([])).toEqual([])
  })
})

describe('leaderId', () => {
  it('crowns only the first-ranked player', () => {
    expect(leaderId([player('a', 300, 1), player('b', 300, 2)])).toBe('a')
  })

  it('crowns nobody at 0–0', () => {
    expect(leaderId([player('a', 0, 1), player('b', 0, 2)])).toBeNull()
  })
})
