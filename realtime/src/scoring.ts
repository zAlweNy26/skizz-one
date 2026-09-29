const BASE_GUESS_POINTS = 50
const SPEED_GUESS_POINTS = 200

/** Exponent on the share of the turn left; above 1 favours early guesses. */
const SPEED_CURVE = 1.5

/** Extra points for the first, second, ... correct guess of a turn. */
const ORDER_BONUS = [50, 25] as const

/** Share of the guessers' average, order bonuses aside, that goes to the drawer. */
const DRAWER_CUT = 0.9

/** Exact points for a correct guess, unrounded; `rank` is 0 for the turn's first correct guess. */
export function guessPoints(remainingMs: number, drawMs: number, rank: number) {
  const left = drawMs > 0 ? Math.min(1, Math.max(0, remainingMs / drawMs)) : 0
  return BASE_GUESS_POINTS + SPEED_GUESS_POINTS * left ** SPEED_CURVE + (ORDER_BONUS[rank] ?? 0)
}

/** The drawer's exact cut of one guess: `DRAWER_CUT` of its points minus the order bonus, split across the guessers. */
export function drawerShare(points: number, rank: number, guessers: number) {
  return guessers > 0 ? DRAWER_CUT * (points - (ORDER_BONUS[rank] ?? 0)) / guessers : 0
}

/** Best first, by exact points; players level to the last decimal keep their order, i.e. join order. */
export function standings<T extends { points: number }>(players: readonly T[]) {
  return [...players].sort((a, b) => b.points - a.points)
}
