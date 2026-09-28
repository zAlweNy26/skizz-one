const BASE_GUESS_POINTS = 50
const SPEED_GUESS_POINTS = 200

/** Exponent on the share of the turn left; above 1 favours early guesses. */
const SPEED_CURVE = 1.5

/** Extra points for the first, second, ... correct guess of a turn. */
const ORDER_BONUS = [50, 25] as const

/** Points for a correct guess; `rank` is 0 for the turn's first correct guess. */
export function guessPoints(remainingMs: number, drawMs: number, rank: number) {
  const left = drawMs > 0 ? Math.min(1, Math.max(0, remainingMs / drawMs)) : 0
  return BASE_GUESS_POINTS + Math.round(SPEED_GUESS_POINTS * left ** SPEED_CURVE) + (ORDER_BONUS[rank] ?? 0)
}

/** The drawer's cut of one guess, so a turn pays them the average of what every guesser earned. */
export function drawerShare(points: number, guessers: number) {
  return guessers > 0 ? Math.round(points / guessers) : 0
}
