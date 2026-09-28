import type { GamePlayer } from '#shared/utils/protocol'

/** Every player tied on the top score; nobody while it is still 0–0. */
export function leaderIds(players: readonly GamePlayer[]): Set<string> {
  const top = Math.max(0, ...players.map(p => p.points))
  if (top === 0) return new Set()
  return new Set(players.filter(p => p.points === top).map(p => p.id))
}

/** The top three of a best-first list; `rank` is 1-based and shared by tied scores. */
export function podium(players: readonly GamePlayer[]) {
  return players.slice(0, 3).map(player => ({
    player,
    rank: players.findIndex(p => p.points === player.points) + 1,
  }))
}
