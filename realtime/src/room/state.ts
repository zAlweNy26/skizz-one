import type { Connection } from 'partyserver'
import type {
  Award,
  GamePlayer,
  GameState,
  Language,
  PublicRoom,
  Reaction,
  RoundPhase,
  TurnRules,
} from '#shared/utils/protocol'
import { standings } from '#realtime/scoring'
import { DEFAULT_LANGUAGE, DRAW_TIME, HINTS, maskWord, NO_RULES, ROUNDS } from '#shared/utils/protocol'

export type AlarmKind = 'choose' | 'round' | 'intermission' | 'grace'

export interface StoredPlayer {
  id: string
  name: string
  avatar: string
  points: number
  guessed: boolean
  connected: boolean
  /** When the player's last connection dropped, while they still have a seat. */
  awaySince?: number
}

export interface RoomState {
  phase: RoundPhase
  round: number
  totalRounds: number
  language: Language
  /** Seconds per turn. */
  drawTime: number
  hints: number
  customWords: string[]
  public: boolean
  noUndo: boolean
  noEraser: boolean
  colorLimit: number
  chaos: boolean
  rules: TurnRules
  hostId: string | null
  drawerId: string | null
  endsAt: number | null
  word: string | null
  /** Words offered to the drawer while choosing. */
  choices: string[]
  /** The drawer already swapped this turn's choices. */
  rerolled: boolean
  /** Indices of the word's letters that hints have revealed this turn. */
  revealed: number[]
  usedWords: string[]
  /** Turn order, in join order. */
  order: string[]
  turnIndex: number
  players: Record<string, StoredPlayer>
  alarmKind: AlarmKind | null
  /** When `alarmKind` is due; the storage alarm may fire earlier for an away deadline. */
  alarmAt: number | null
  /** Time left in the round while it is paused for a disconnected drawer. */
  pausedMs: number | null
  /** Players voting to pause, or to resume once paused. */
  pauseVotes: string[]
  /** The countdown frozen by a vote: which alarm to re-arm, and with how long. */
  pause: { kind: AlarmKind, remainingMs: number } | null
  reactions: Record<string, Reaction>
  /** Whose drawing `reactions` are for, kept through the intermission. */
  reactionsFor: string | null
  /** Voters against each target, by target id. */
  kickVotes: Record<string, string[]>
  /** Players kicked from the room, who can't rejoin it. */
  banned: string[]
  stats: GameStats
  /** When the last seat was freed; null while anyone is connected. */
  emptySince: number | null
  /** When the running game started; null outside a game. */
  gameStartedAt: number | null
}

/** What this game's awards are drawn from. */
interface GameStats {
  /** The quickest correct guess, in ms into the turn. */
  fastest: { playerId: string, ms: number } | null
  closeGuesses: Record<string, number>
  /** The single drawing with the most likes. */
  mostLiked: { playerId: string, likes: number } | null
  /** Correct guesses on each drawer's turns. */
  guessedOn: Record<string, number>
}

interface ConnState {
  playerId: string
}

export function emptyStats(): GameStats {
  return { fastest: null, closeGuesses: {}, mostLiked: null, guessedOn: {} }
}

export function initialState(): RoomState {
  return {
    phase: 'lobby',
    round: 0,
    totalRounds: ROUNDS.default,
    language: DEFAULT_LANGUAGE,
    drawTime: DRAW_TIME.default,
    hints: HINTS.default,
    customWords: [],
    public: false,
    noUndo: false,
    noEraser: false,
    colorLimit: 0,
    chaos: false,
    rules: NO_RULES,
    hostId: null,
    drawerId: null,
    endsAt: null,
    word: null,
    choices: [],
    rerolled: false,
    revealed: [],
    usedWords: [],
    order: [],
    turnIndex: -1,
    players: {},
    alarmKind: null,
    alarmAt: null,
    pausedMs: null,
    pauseVotes: [],
    pause: null,
    reactions: {},
    reactionsFor: null,
    kickVotes: {},
    banned: [],
    stats: emptyStats(),
    emptySince: null,
    gameStartedAt: null,
  }
}

export function playerIdOf(connection: Connection): string | null {
  return (connection.state as ConnState | null)?.playerId ?? null
}

export function setPlayerId(connection: Connection, playerId: string) {
  ;(connection as Connection<ConnState>).setState({ playerId })
}

/** Seconds per turn, in ms. */
export function drawMs(s: RoomState) {
  return s.drawTime * 1000
}

/** Time left on the running countdown, in ms. */
export function remainingMs(s: RoomState) {
  return Math.max(0, (s.endsAt ?? Date.now()) - Date.now())
}

/** Connected and not away. */
export function isActive(player: StoredPlayer | null | undefined) {
  return Boolean(player?.connected && player.awaySince === undefined)
}

/** Connected players, away ones included. */
export function seated(s: RoomState) {
  return s.order.filter(id => s.players[id]?.connected)
}

export function activeCount(s: RoomState) {
  return s.order.filter(id => isActive(s.players[id])).length
}

/** Everyone with a place on the scoreboard, in join order. */
export function listed(s: RoomState) {
  return s.order
    .filter(id => !s.banned.includes(id))
    .map(id => s.players[id])
    .filter((p): p is StoredPlayer => Boolean(p))
}

/** Forget players whose seat has been freed. */
export function pruneDeparted(s: RoomState) {
  s.order = s.order.filter(id => s.players[id]?.connected)
  for (const player of Object.values(s.players))
    if (!player.connected) delete s.players[player.id]
}

export function kickVoters(s: RoomState, target: string) {
  return (s.kickVotes[target] ?? []).filter(id => id !== target && isActive(s.players[id]))
}

export function pauseVoters(s: RoomState) {
  return s.pauseVotes.filter(id => isActive(s.players[id]))
}

/** The player with the highest positive count; the earliest of a tie. */
function topCount(counts: Record<string, number>) {
  let best: [string, number] | null = null
  for (const entry of Object.entries(counts))
    if (entry[1] > 0 && entry[1] > (best?.[1] ?? 0)) best = entry
  return best
}

export function awards(s: RoomState): Award[] {
  const { fastest, closeGuesses, mostLiked, guessedOn } = s.stats
  const close = topCount(closeGuesses)
  const picasso = topCount(guessedOn)
  const all: Award[] = [
    ...(fastest ? [{ key: 'fastest' as const, playerId: fastest.playerId, value: fastest.ms }] : []),
    ...(mostLiked ? [{ key: 'mostLiked' as const, playerId: mostLiked.playerId, value: mostLiked.likes }] : []),
    ...(close ? [{ key: 'almostHadIt' as const, playerId: close[0], value: close[1] }] : []),
    ...(picasso ? [{ key: 'picasso' as const, playerId: picasso[0], value: picasso[1] }] : []),
  ]
  return all.filter(a => s.players[a.playerId] && !s.banned.includes(a.playerId))
}

/** The room as everyone is allowed to see it. */
export function publicState(s: RoomState, id: string): GameState {
  const players = listed(s)
  const ranks = new Map(standings(players).map((p, index) => [p.id, index + 1]))
  return {
    id,
    phase: s.phase,
    round: s.round,
    totalRounds: s.totalRounds,
    language: s.language,
    drawTime: s.drawTime,
    hints: s.hints,
    customWordCount: s.customWords.length,
    hostId: s.hostId,
    drawerId: s.drawerId,
    endsAt: s.endsAt,
    hint: s.word ? maskWord(s.word, s.revealed) : '',
    players: players.map<GamePlayer>(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      points: Math.round(p.points),
      rank: ranks.get(p.id)!,
      connected: p.connected,
      away: p.awaySince !== undefined,
      guessed: p.guessed,
    })),
    paused: s.pause !== null,
    pauseVotes: pauseVoters(s),
    remainingMs: s.pause?.remainingMs ?? null,
    reactions: s.reactions,
    reactionsFor: s.reactionsFor,
    kickVotes: Object.fromEntries(Object.keys(s.kickVotes).flatMap((target) => {
      const voters = kickVoters(s, target)
      return voters.length ? [[target, voters]] : []
    })),
    awards: s.phase === 'finished' ? awards(s) : [],
    public: s.public,
    noUndo: s.noUndo,
    noEraser: s.noEraser,
    colorLimit: s.colorLimit,
    chaos: s.chaos,
    rules: s.rules,
  }
}

/** The room as the lobby lists it, or null to stay unlisted. */
export function listing(s: RoomState, id: string): PublicRoom | null {
  const players = activeCount(s)
  const host = s.hostId ? s.players[s.hostId] : null
  if (!s.public || players === 0 || !host) return null
  return {
    id,
    hostName: host.name,
    players,
    language: s.language,
    phase: s.phase,
    round: s.round,
    totalRounds: s.totalRounds,
  }
}
