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

type Players = Map<string, GamePlayer>

function byId(players: readonly GamePlayer[]): Players {
  return new Map(players.map(p => [p.id, p]))
}

function startCues(prev: GameState, next: GameState, you: string): Sound[] {
  const cues: Sound[] = []
  if (next.phase === 'choosing' && next.drawerId === you && prev.drawerId !== you) cues.push('your-turn')
  if (next.phase === 'drawing' && prev.phase !== 'drawing' && next.drawerId !== you) cues.push('turn-start')
  return cues
}

function endCues(prev: GameState, next: GameState, after: Players): Sound[] {
  const cues: Sound[] = []
  if (prev.phase === 'drawing' && next.phase === 'intermission'
    && prev.players.some(p => p.connected && p.id !== prev.drawerId && !after.get(p.id)?.guessed))
    cues.push('turn-end')
  if (next.phase === 'finished' && prev.phase !== 'finished') cues.push('game-over')
  return cues
}

function guessCues(next: GameState, you: string, before: Players): Sound[] {
  return next.players
    .filter(p => p.guessed && before.get(p.id)?.guessed === false)
    .map(p => (p.id === you ? 'guessed-self' : 'guessed-other'))
}

function presenceCue(player: GamePlayer, was: GamePlayer | undefined): Sound | null {
  if (player.connected && !was?.connected) return 'join'
  return !player.connected && was?.connected ? 'leave' : null
}

function presenceCues(prev: GameState, next: GameState, you: string, before: Players, after: Players): Sound[] {
  const cues = next.players.filter(p => p.id !== you).map(p => presenceCue(p, before.get(p.id)))
  const gone = prev.players.some(p => p.id !== you && p.connected && !after.has(p.id))
  return [...cues.filter(cue => cue !== null), ...(gone ? ['leave' as const] : [])]
}

export function soundCues(prev: GameState, next: GameState, you: string): Sound[] {
  const before = byId(prev.players)
  const after = byId(next.players)
  return [...new Set([
    ...startCues(prev, next, you),
    ...guessCues(next, you, before),
    ...endCues(prev, next, after),
    ...presenceCues(prev, next, you, before, after),
  ])]
}
