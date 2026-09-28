import type { GamePlayer } from '#shared/utils/protocol'

/**
 * Who wears the crown: every player tied on the top score, once anyone has
 * scored at all. Nobody leads a game that is still 0–0.
 */
export function leaderIds(players: readonly GamePlayer[]): Set<string> {
  const top = Math.max(0, ...players.map(p => p.points))
  if (top === 0) return new Set()
  return new Set(players.filter(p => p.points === top).map(p => p.id))
}
