import { describe, expect, it } from 'vitest'
import { drawerShare, guessPoints, standings } from '#realtime/scoring'

const DRAW_MS = 80_000

describe('guessPoints', () => {
  it('pays the most for an instant first guess', () => {
    expect(guessPoints(DRAW_MS, DRAW_MS, 0)).toBe(300)
  })

  it('pays only the base for a last-second guess outside the bonus ranks', () => {
    expect(guessPoints(0, DRAW_MS, 2)).toBe(50)
  })

  it('rewards the first two guessers of a turn', () => {
    const late = guessPoints(40_000, DRAW_MS, 5)
    expect(guessPoints(40_000, DRAW_MS, 0)).toBe(late + 50)
    expect(guessPoints(40_000, DRAW_MS, 1)).toBe(late + 25)
    expect(guessPoints(40_000, DRAW_MS, 2)).toBe(late)
  })

  it('drops faster than linear over the turn', () => {
    const halfway = guessPoints(DRAW_MS / 2, DRAW_MS, 2)
    expect(halfway).toBeLessThan(50 + 100)
    expect(halfway).toBeCloseTo(50 + 200 * 0.5 ** 1.5)
  })

  it('tells apart guesses a millisecond apart', () => {
    expect(guessPoints(40_001, DRAW_MS, 2)).toBeGreaterThan(guessPoints(40_000, DRAW_MS, 2))
  })

  it('clamps time outside the turn', () => {
    expect(guessPoints(2 * DRAW_MS, DRAW_MS, 2)).toBe(250)
    expect(guessPoints(-1, DRAW_MS, 2)).toBe(50)
    expect(guessPoints(1000, 0, 2)).toBe(50)
  })
})

describe('drawerShare', () => {
  it('adds up to 90% of the average of what the guessers earned without order bonuses', () => {
    const earned = [300, 250, 180]
    const guessers = 4
    const total = earned.reduce((sum, points, rank) => sum + drawerShare(points, rank, guessers), 0)
    expect(total).toBeCloseTo(0.9 * (250 + 225 + 180) / guessers)
  })

  it('pays the drawer less than the guesser\'s own speed points in a two-player room', () => {
    const first = guessPoints(DRAW_MS / 2, DRAW_MS, 0)
    expect(drawerShare(first, 0, 1)).toBeLessThan(first - 50)
  })

  it('never pays the drawer as much as the first guesser', () => {
    for (let guessers = 1; guessers <= 6; guessers++) {
      const earned = Array.from({ length: guessers }, (_, rank) =>
        guessPoints(DRAW_MS * (1 - rank / guessers), DRAW_MS, rank))
      const drawer = earned.reduce((sum, points, rank) => sum + drawerShare(points, rank, guessers), 0)
      expect(drawer).toBeLessThan(earned[0]!)
    }
  })

  it('pays nothing without guessers', () => {
    expect(drawerShare(220, 0, 0)).toBe(0)
  })
})

describe('standings', () => {
  it('ranks by exact points, decimals included', () => {
    const order = standings([{ id: 'a', points: 1589.2 }, { id: 'b', points: 1589.4 }]).map(p => p.id)
    expect(order).toEqual(['b', 'a'])
  })

  it('keeps join order for a dead level score', () => {
    const order = standings([{ id: 'a', points: 0 }, { id: 'b', points: 0 }, { id: 'c', points: 5 }]).map(p => p.id)
    expect(order).toEqual(['c', 'a', 'b'])
  })

  it('breaks the two-player tie a full game used to end in', () => {
    const totals = { a: 0, b: 0 }
    for (let turn = 0; turn < 6; turn++) {
      const drawer = turn % 2 ? 'b' : 'a'
      const guesser = drawer === 'a' ? 'b' : 'a'
      const points = guessPoints(DRAW_MS - 5_000 * (turn + 1), DRAW_MS, 0)
      totals[guesser] += points
      totals[drawer] += drawerShare(points, 0, 1)
    }
    expect(totals.a).not.toBe(totals.b)
  })
})
