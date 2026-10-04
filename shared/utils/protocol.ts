/** Bump when a change breaks clients or servers built before it; the room turns other versions away. */
export const PROTOCOL_VERSION = 1

/** SVG user-space the canvas is drawn in. */
export const CANVAS_WIDTH = 1600
export const CANVAS_HEIGHT = 1200

/** Coalescing window for in-progress stroke points, in ms. */
export const DRAW_FLUSH_MS = 33

export const DRAW_FLUSH_POINTS = 50

/** How long a disconnected drawer keeps the turn before the round is ended. */
export const DRAWER_GRACE_MS = 10_000

/** How long a dropped player keeps their seat before they count as gone. */
export const AWAY_GRACE_MS = 60_000

export const MAX_NAME_LENGTH = 24

/** Longest DiceBear seed a player can send. */
export const MAX_AVATAR_LENGTH = 32

/** Room codes are this many lowercase hex characters. */
export const ROOM_CODE_LENGTH = 8

const ROOM_CODE = new RegExp(`^[0-9a-f]{${ROOM_CODE_LENGTH}}$`)

export function isRoomCode(code: string) {
  return ROOM_CODE.test(code)
}

/** WebSocket close code for a player voted out of the room. */
export const KICKED_CLOSE_CODE = 4003

/** WebSocket close code for a newcomer turned away from a full public room. */
export const ROOM_FULL_CLOSE_CODE = 4004

/** WebSocket close code for a client built for another `PROTOCOL_VERSION`. */
export const OUTDATED_CLOSE_CODE = 4005

/** Active players a room needs before anyone can vote to kick. */
export const MIN_PLAYERS_TO_VOTE_KICK = 3

export type DrawingMode
  = | 'draw' | 'stylus' | 'line' | 'rectangle'
    | 'ellipse' | 'eraseLine' | 'highlighter' | 'bucket'

/** The parts of drauu's brush a watcher needs to reproduce a preview. */
export interface WireBrush {
  mode: DrawingMode
  color: string
  size: number
  opacity?: number
  dasharray?: string
  arrowEnd?: boolean
  cornerRadius?: number
  fill?: string
}

/** Modes whose in-progress shape is cheap to preview from raw points. */
export const FREEHAND_MODES = ['draw', 'highlighter'] as const

/** Modes that only sync on commit. */
export const OPAQUE_MODES = ['eraseLine', 'bucket'] as const

export function isFreehand(mode: DrawingMode) {
  return (FREEHAND_MODES as readonly string[]).includes(mode)
}

export function isOpaque(mode: DrawingMode) {
  return (OPAQUE_MODES as readonly string[]).includes(mode)
}

/** Numbers per point on the wire: quantised x, quantised y, ms since the stroke's first point. */
export const POINT_STRIDE = 3

/** Word-list languages, keyed by the tag a room stores. */
export const LANGUAGES = {
  en: 'English',
  it: 'Italiano',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
} as const

export type Language = keyof typeof LANGUAGES

export const DEFAULT_LANGUAGE: Language = 'en'

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.hasOwn(LANGUAGES, value)
}

/** The first word language among the browser's preferred ones (BCP 47 tags), else the default. */
export function preferredLanguage(tags: readonly string[]): Language {
  for (const tag of tags) {
    const code = tag.toLowerCase().split('-')[0]
    if (isLanguage(code)) return code
  }
  return DEFAULT_LANGUAGE
}

/** Seconds a drawer gets per turn. */
export const DRAW_TIME = { min: 10, max: 240, default: 80 } as const

export const ROUNDS = { min: 2, max: 10, default: 3 } as const

/** Letters revealed to guessers over a turn. */
export const HINTS = { min: 0, max: 5, default: 2 } as const

export const MAX_CUSTOM_WORDS = 200
export const MAX_CUSTOM_WORD_LENGTH = 30

/** The drawer's colours, as hex. */
export const PALETTE = [
  '#FFFFFF', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00ff91', '#00b2ff', '#231fd3', '#a300ba', '#df69a7', '#ffac8e', '#a0522d',
  '#000000', '#505050', '#740b07', '#c23800', '#e8a200', '#004619', '#00785d', '#00569e', '#0e0865', '#550069', '#873554', '#cc774d', '#63300d',
] as const

/** Colours a turn can be limited to; 0 leaves the whole palette. */
export const COLOR_LIMITS = [0, 2, 3, 5] as const

export function isColorLimit(value: unknown): value is typeof COLOR_LIMITS[number] {
  return COLOR_LIMITS.includes(value as typeof COLOR_LIMITS[number])
}

/** `limit` distinct random colours from the palette, never white; none when unlimited. */
export function pickTurnColors(limit: number, random = Math.random): string[] {
  const pool: string[] = PALETTE.filter(color => color !== '#FFFFFF')
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, limit)
}

/** Rules a Chaos turn draws one of. */
export const CHAOS_RULES = ['noUndo', 'noEraser', 'colors'] as const

export type ChaosRule = typeof CHAOS_RULES[number]

/** What the drawer may use this turn. */
export interface TurnRules {
  noUndo: boolean
  noEraser: boolean
  /** The only colours allowed; empty when unlimited. */
  colors: string[]
}

export const NO_RULES: TurnRules = { noUndo: false, noEraser: false, colors: [] }

/** A turn's rules: the room's own, or under Chaos a single random one. */
export function drawTurnRules(
  room: Pick<RoomSettings, 'noUndo' | 'noEraser' | 'colorLimit' | 'chaos'>,
  random = Math.random,
): { rules: TurnRules, chaos: ChaosRule | null } {
  if (!room.chaos) {
    const colors = pickTurnColors(room.colorLimit, random)
    return { rules: { noUndo: room.noUndo, noEraser: room.noEraser, colors }, chaos: null }
  }
  const chaos = CHAOS_RULES[Math.floor(random() * CHAOS_RULES.length)]!
  const limits = COLOR_LIMITS.filter(limit => limit > 0)
  const colors = chaos === 'colors' ? pickTurnColors(limits[Math.floor(random() * limits.length)]!, random) : []
  return { rules: { noUndo: chaos === 'noUndo', noEraser: chaos === 'noEraser', colors }, chaos }
}

export interface RoomSettings {
  language: Language
  /** Seconds per turn. */
  drawTime: number
  totalRounds: number
  hints: number
  customWords: string[]
  /** Listed on the home page for anyone to join. */
  public: boolean
  /** Undo, redo and clear are off. */
  noUndo: boolean
  noEraser: boolean
  /** One of `COLOR_LIMITS`. */
  colorLimit: number
  /** Each turn draws one random rule; the three above are ignored. */
  chaos: boolean
}

/** Round `value` into `[min, max]`, or null if it isn't a number at all. */
export function clampSetting(value: unknown, range: { min: number, max: number }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(range.max, Math.max(range.min, Math.round(value)))
}

/** Tidy a host's custom words: lowercase, single spaces, letters only, no duplicates. */
export function cleanCustomWords(words: unknown): string[] {
  if (!Array.isArray(words)) return []
  const clean = new Set<string>()
  for (const raw of words) {
    if (typeof raw !== 'string') continue
    const word = raw.toLowerCase().replace(/[-'’]/g, ' ').replace(/\s+/g, ' ').trim()
    if (word && word.length <= MAX_CUSTOM_WORD_LENGTH && /^[\p{L}\p{M} ]+$/u.test(word)) clean.add(word)
    if (clean.size >= MAX_CUSTOM_WORDS) break
  }
  return [...clean]
}

/** Split what the host typed, one word or phrase per comma or line. */
export function splitCustomWords(text: string) {
  return cleanCustomWords(text.split(/[,\n]/))
}

export type RoundPhase = 'lobby' | 'choosing' | 'drawing' | 'intermission' | 'finished'

/** Words the drawer picks from at the start of a turn. */
export const WORD_CHOICES = 3

/** Phases whose countdown players can vote to pause. */
export const PAUSABLE_PHASES: readonly RoundPhase[] = ['drawing', 'intermission']

/** Votes a pause or resume needs to pass, out of the connected players. */
export function votesNeeded(connected: number, paused: boolean) {
  return paused ? Math.floor(connected / 2) + 1 : connected
}

/** Votes a kick needs to pass: a majority of the active players other than its target. */
export function kickVotesNeeded(active: number) {
  return Math.floor(Math.max(0, active - 1) / 2) + 1
}

/** A guesser's thumbs up or down on the current drawing. Feedback for the drawer only; it never scores. */
export type Reaction = 'like' | 'dislike'

export type AwardKey = 'fastest' | 'mostLiked' | 'almostHadIt' | 'picasso'

/** An end-of-game title. `value` is ms for `fastest`, a count otherwise. */
export interface Award {
  key: AwardKey
  playerId: string
  value: number
}

export interface GamePlayer {
  id: string
  name: string
  /** DiceBear seed, independent of the name. */
  avatar: string
  /** Rounded for display; `rank` comes from the exact score. */
  points: number
  /** 1-based and never shared: exact score first, then join order. */
  rank: number
  connected: boolean
  /** Dropped, but still inside `AWAY_GRACE_MS`. */
  away: boolean
  guessed: boolean
}

export interface GameState {
  id: string
  phase: RoundPhase
  round: number
  totalRounds: number
  language: Language
  /** Seconds per turn. */
  drawTime: number
  /** Most letters revealed over a turn. */
  hints: number
  customWordCount: number
  hostId: string | null
  drawerId: string | null
  /** Epoch ms the current phase ends, or null when untimed. */
  endsAt: number | null
  /** Masked word shown to guessers, e.g. `____`. */
  hint: string
  players: GamePlayer[]
  paused: boolean
  /** Connected players voting to flip `paused`. */
  pauseVotes: string[]
  /** Time left on the frozen countdown, or null when not paused. */
  remainingMs: number | null
  /** Guessers' reactions to this turn's drawing, by player id. */
  reactions: Record<string, Reaction>
  /** Active players voting to kick each target, by target id. */
  kickVotes: Record<string, string[]>
  /** Set once the game is over. */
  awards: Award[]
  public: boolean
  noUndo: boolean
  noEraser: boolean
  colorLimit: number
  chaos: boolean
  /** In force for the current turn. */
  rules: TurnRules
}

/** Seats in a public room; newcomers beyond it are turned away. */
export const PUBLIC_ROOM_CAP = 10

/** A public room as the home page lists it. */
export interface PublicRoom {
  id: string
  hostName: string
  /** Connected players, away ones not counted. */
  players: number
  language: Language
  phase: RoundPhase
  round: number
  totalRounds: number
}

/** What the lobby at `/parties/lobby/global` sends. */
export interface LobbyMessage { t: 'rooms', rooms: PublicRoom[] }

export type LogLevel = 'info' | 'success' | 'warning' | 'error'

/** Announcements the room makes in chat, rendered client-side as `log.<key>`. */
export type LogKey
  = | 'joined' | 'reconnected' | 'disconnected' | 'hostLeft' | 'drawerDropped'
    | 'drawerGone' | 'languageChanged' | 'waitingForPlayers' | 'drawing'
    | 'close' | 'guessed' | 'timeUp' | 'winner' | 'winnerByAHair' | 'gameOver'
    | 'paused' | 'resumed' | 'guessOnHold' | 'choosing' | 'pauseRequested' | 'resumeRequested'
    | 'kickRequested' | 'kicked' | 'newHost' | 'canvasFull' | 'slowDown'
    | 'chaosNoUndo' | 'chaosNoEraser' | 'chaosColors'

/** Values interpolated into a log message, e.g. `{ name: 'Bob' }`. */
export type LogParams = Record<string, string | number>

export type DrawingMessage
  = | { t: 'strokeStart', id: string, brush: WireBrush }
  /** `pts` is flat, `POINT_STRIDE` numbers per point. */
    | { t: 'draw', id: string, pts: number[] }
  /** An in-progress shape, as SVG. */
    | { t: 'preview', id: string, svg: string }
    | { t: 'commit', id: string, svg: string }
    | { t: 'canvas', svg: string }

export type ClientMessage
  = | DrawingMessage
    | { t: 'guess', text: string }
    | { t: 'chat', text: string }
    | { t: 'start' }
    | { t: 'settings', settings: Partial<RoomSettings> }
    | { t: 'pause', want: boolean }
    | { t: 'choose', index: number }
  /** `null` takes the reaction back. */
    | { t: 'react', reaction: Reaction | null }
    | { t: 'kick', target: string, want: boolean }
  /** Swap the words on offer for new ones, once per turn. */
    | { t: 'reroll' }
    | { t: 'ping' }

export type ServerMessage
  = | DrawingMessage
    | { t: 'welcome', you: string, state: GameState }
    | { t: 'state', state: GameState }
  /** `word` is present only in the copy sent to the drawer. */
    | { t: 'turn', drawerId: string, round: number, endsAt: number, hint: string, word?: string }
    | { t: 'roundEnd', word: string, state: GameState }
    | { t: 'log', level: LogLevel, key: LogKey, params?: LogParams }
    | { t: 'chat', sender: string, text: string, private?: boolean }
    | { t: 'customWords', words: string[] }
  /** Sent only to the drawer while they pick the turn's word. */
    | { t: 'choices', words: string[], canReroll: boolean }
  /** Sent to a kicked player just before their socket is closed. */
    | { t: 'kicked' }
  /** Sent to a newcomer turned away from a full public room just before their socket is closed. */
    | { t: 'roomFull' }
  /** Sent to a client built for another `PROTOCOL_VERSION` just before its socket is closed. */
    | { t: 'outdated' }
    | { t: 'pong' }

const DRAWING_MESSAGES = new Set(['strokeStart', 'draw', 'preview', 'commit', 'canvas'])

export function isDrawingMessage(msg: ClientMessage): msg is DrawingMessage {
  return DRAWING_MESSAGES.has(msg.t)
}

/** Quantise a coordinate to a tenth of a user-space unit. */
export function quantize(n: number) {
  return Math.round(n * 10)
}

export function dequantize(n: number) {
  return n / 10
}

/** Mask a word for guessers, keeping spaces and the letters at `revealed` indices. */
export function maskWord(word: string, revealed: readonly number[] = []) {
  const shown = new Set(revealed)
  return [...word].map((c, i) => (/\s/.test(c) || shown.has(i) ? c : '_')).join('')
}

/** Letters a turn actually reveals: the room's setting, capped at half the word. */
export function hintBudget(word: string, hints: number) {
  const letters = [...word].filter(c => !/\s/.test(c)).length
  return Math.max(0, Math.min(hints, Math.floor(letters / 2)))
}

/** Ms into a turn at which hint `n` (1-based) is revealed. */
export function hintRevealAt(n: number, drawMs: number, budget: number) {
  return Math.ceil(drawMs * n / (budget + 1))
}

/** Characters in each word of an answer or masked hint, e.g. `ice cream` -> `[3, 5]`. */
export function wordLengths(text: string) {
  return text.split(/\s+/).filter(Boolean).map(w => [...w].length)
}

/** Normalise a guess: case, accents, spacing, `ß`/`ss`, `œ`/`oe`, hyphens and apostrophes don't count. */
export function normalizeGuess(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ß/g, 'ss')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[-'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Levenshtein distance, capped at `max + 1`. */
export function editDistance(a: string, b: string, max = 3) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost)
      row.push(v)
      if (v < best) best = v
    }
    if (best > max) return max + 1
    prev = row
  }

  return prev[b.length]!
}
