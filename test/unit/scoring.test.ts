import { describe, expect, it } from 'vitest'
import { drawerShare, guessPoints } from '../../realtime/src/scoring'

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
    expect(halfway).toBe(50 + Math.round(200 * 0.5 ** 1.5))
  })

  it('clamps time outside the turn', () => {
    expect(guessPoints(2 * DRAW_MS, DRAW_MS, 2)).toBe(250)
    expect(guessPoints(-1, DRAW_MS, 2)).toBe(50)
    expect(guessPoints(1000, 0, 2)).toBe(50)
  })
})

describe('drawerShare', () => {
  it('adds up to the average of what the guessers earned, give or take rounding', () => {
    const earned = [300, 250, 180]
    const guessers = 4
    const total = earned.reduce((sum, points) => sum + drawerShare(points, guessers), 0)
    expect(Math.abs(total - (300 + 250 + 180) / guessers)).toBeLessThanOrEqual(earned.length / 2)
  })

  it('gives the whole guess to the drawer in a two-player room', () => {
    expect(drawerShare(220, 1)).toBe(220)
  })

  it('pays nothing without guessers', () => {
    expect(drawerShare(220, 0)).toBe(0)
  })
})
