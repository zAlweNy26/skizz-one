import type { GamePlayer } from '#shared/utils/protocol'

/** Whoever is ranked first; nobody while it is still 0–0. */
export function leaderId(players: readonly GamePlayer[]) {
  const leader = players.find(p => p.rank === 1)
  return leader && leader.points > 0 ? leader.id : null
}

/** The top three of a best-first list. */
export function podium(players: readonly GamePlayer[]) {
  return players.slice(0, 3).map(player => ({ player, rank: player.rank }))
}
