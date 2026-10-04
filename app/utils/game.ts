import type { GamePlayer, GameState, PublicRoom } from '#shared/utils/protocol'
import { PUBLIC_ROOM_CAP } from '#shared/utils/protocol'

export function avatarUrl(seed: string) {
  return `https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(seed)}`
}

/** Whoever is ranked first; nobody while it is still 0–0. */
export function leaderId(players: readonly GamePlayer[]) {
  const leader = players.find(p => p.rank === 1)
  return leader && leader.points > 0 ? leader.id : null
}

/** The top three of a best-first list. */
export function podium(players: readonly GamePlayer[]) {
  return players.slice(0, 3).map(player => ({ player, rank: player.rank }))
}

/** A random room quick play can drop you into: any with space that hasn't finished. */
export function pickQuickPlayRoom(rooms: readonly PublicRoom[]) {
  const open = rooms.filter(r => r.players < PUBLIC_ROOM_CAP && r.phase !== 'finished')
  return open[Math.floor(Math.random() * open.length)] ?? null
}

export type Sound
  = | 'your-turn' | 'turn-start' | 'guessed-self' | 'guessed-other' | 'tick'
    | 'turn-end' | 'game-over' | 'join' | 'leave'

export function soundCues(prev: GameState, next: GameState, you: string): Sound[] {
  const cues = new Set<Sound>()
  const before = new Map(prev.players.map(p => [p.id, p]))
  const after = new Map(next.players.map(p => [p.id, p]))

  if (next.phase === 'choosing' && next.drawerId === you && prev.drawerId !== you)
    cues.add('your-turn')
  if (next.phase === 'drawing' && prev.phase !== 'drawing' && next.drawerId !== you)
    cues.add('turn-start')

  for (const p of next.players) {
    const was = before.get(p.id)
    if (p.guessed && was && !was.guessed) cues.add(p.id === you ? 'guessed-self' : 'guessed-other')
  }

  if (prev.phase === 'drawing' && next.phase === 'intermission') {
    const missed = prev.players.some(p =>
      p.connected && p.id !== prev.drawerId && !after.get(p.id)?.guessed)
    if (missed) cues.add('turn-end')
  }

  if (next.phase === 'finished' && prev.phase !== 'finished') cues.add('game-over')

  for (const p of next.players) {
    if (p.id === you) continue
    const was = before.get(p.id)
    if (p.connected && !was?.connected) cues.add('join')
    else if (!p.connected && was?.connected) cues.add('leave')
  }
  for (const p of prev.players)
    if (p.id !== you && p.connected && !after.has(p.id)) cues.add('leave')

  return [...cues]
}
