/**
 * Wire protocol shared by the Nuxt client and the `skizz-realtime` worker.
 *
 * The realtime worker is a separate Worker and cannot use Nuxt's `#shared`
 * alias, so it imports this file by relative path. Keep it dependency-free.
 */

/** SVG user-space the canvas is drawn in. Fixed so every client agrees. */
export const CANVAS_WIDTH = 1600
export const CANVAS_HEIGHT = 900

/**
 * Coalescing window for in-progress stroke points, in ms.
 *
 * Watchers replay points at the pace they were drawn, so this sets latency,
 * not smoothness. ~30 messages/s is 1.5 billed Durable Object requests/s.
 */
export const DRAW_FLUSH_MS = 33

/** Cloudflare's guidance: flush on whichever of time or count comes first. */
export const DRAW_FLUSH_POINTS = 50

/** How long a disconnected drawer keeps the turn before the round is ended. */
export const DRAWER_GRACE_MS = 10_000

/** Longest nickname the room accepts. The client form enforces the same. */
export const MAX_NAME_LENGTH = 24

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

/** Modes that mutate existing nodes, so they only sync on commit. */
export const OPAQUE_MODES = ['eraseLine', 'bucket'] as const

export function isFreehand(mode: DrawingMode) {
  return (FREEHAND_MODES as readonly string[]).includes(mode)
}

export function isOpaque(mode: DrawingMode) {
  return (OPAQUE_MODES as readonly string[]).includes(mode)
}

/**
 * Numbers per point on the wire: quantised x, quantised y, and ms since the
 * stroke's first point on the drawer's clock, so watchers can replay it at
 * the pace it was drawn rather than in network-sized jumps.
 */
export const POINT_STRIDE = 3

/**
 * Word-list languages, keyed by the tag a room stores.
 *
 * Only the names live here: the lists themselves stay in the realtime worker
 * so the client bundle never ships the words.
 */
export const LANGUAGES = {
  en: 'English',
  it: 'Italiano',
} as const

export type Language = keyof typeof LANGUAGES

export const DEFAULT_LANGUAGE: Language = 'en'

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.hasOwn(LANGUAGES, value)
}

/** Seconds a drawer gets per turn. */
export const DRAW_TIME = { min: 10, max: 240, default: 80 } as const

/** Rounds per game; in each one everybody draws once. */
export const ROUNDS = { min: 2, max: 10, default: 3 } as const

/** Letters revealed to guessers over a turn. */
export const HINTS = { min: 0, max: 5, default: 2 } as const

/** Keeps a room's stored state, and the host's paste, reasonably small. */
export const MAX_CUSTOM_WORDS = 200
export const MAX_CUSTOM_WORD_LENGTH = 30

/** How a room plays. Only the host changes it, and only between games. */
export interface RoomSettings {
  language: Language
  /** Seconds per turn. */
  drawTime: number
  totalRounds: number
  hints: number
  /** Added to the word list, and a little likelier to come up. */
  customWords: string[]
}

/** Round `value` into `[min, max]`, or null if it isn't a number at all. */
export function clampSetting(value: unknown, range: { min: number, max: number }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(range.max, Math.max(range.min, Math.round(value)))
}

/**
 * Tidy a host's custom words: lowercase, single spaces, letters only, no
 * duplicates. Apostrophes and hyphens are dropped along with the word, like
 * in the built-in lists, because the masked hint can't show them.
 */
export function cleanCustomWords(words: unknown): string[] {
  if (!Array.isArray(words)) return []
  const clean = new Set<string>()
  for (const raw of words) {
    if (typeof raw !== 'string') continue
    const word = raw.trim().toLowerCase().replace(/\s+/g, ' ')
    if (word && word.length <= MAX_CUSTOM_WORD_LENGTH && /^[\p{L}\p{M} ]+$/u.test(word)) clean.add(word)
    if (clean.size >= MAX_CUSTOM_WORDS) break
  }
  return [...clean]
}

/** Split what the host typed, one word or phrase per comma or line. */
export function splitCustomWords(text: string) {
  return cleanCustomWords(text.split(/[,\n]/))
}

export type RoundPhase = 'lobby' | 'drawing' | 'intermission' | 'finished'

/** Phases whose countdown players can vote to pause. */
export const PAUSABLE_PHASES: readonly RoundPhase[] = ['drawing', 'intermission']

/**
 * Votes a pause or resume needs to pass, out of the connected players.
 *
 * Pausing takes everyone, so nobody is frozen out of a round against their
 * will; resuming takes a strict majority, so one absent-minded player can't
 * hold the room hostage.
 */
export function votesNeeded(connected: number, paused: boolean) {
  return paused ? Math.floor(connected / 2) + 1 : connected
}

export interface GamePlayer {
  id: string
  name: string
  points: number
  connected: boolean
  /** Has this player already guessed the word this round? */
  guessed: boolean
}

export interface GameState {
  id: string
  phase: RoundPhase
  round: number
  totalRounds: number
  /** Which word list the room draws from. Only the host can change it. */
  language: Language
  /** Seconds per turn. */
  drawTime: number
  /** Most letters revealed over a turn; short words get fewer. */
  hints: number
  /**
   * How many custom words the host added. The words themselves go to the
   * host only, in a `customWords` message: guessers could read them here.
   */
  customWordCount: number
  hostId: string | null
  drawerId: string | null
  /** Epoch ms the current phase ends, or null when untimed. */
  endsAt: number | null
  /** Masked word shown to guessers, e.g. `____`. Never the word itself. */
  hint: string
  players: GamePlayer[]
  /** Is the countdown frozen by a vote? */
  paused: boolean
  /**
   * Connected players voting to flip `paused`: to pause while running, to
   * resume while paused.
   */
  pauseVotes: string[]
  /** Time left on the frozen countdown, or null when not paused. */
  remainingMs: number | null
}

export type LogLevel = 'info' | 'success' | 'warning' | 'error'

/**
 * Announcements the room makes in chat.
 *
 * Sent as a key, never as text: players share a room but not a UI language,
 * so each client renders `log.<key>` from its own locale file.
 */
export type LogKey
  = | 'joined' | 'reconnected' | 'disconnected' | 'hostLeft' | 'drawerDropped'
    | 'drawerGone' | 'languageChanged' | 'waitingForPlayers' | 'drawing'
    | 'close' | 'guessed' | 'timeUp' | 'winner' | 'gameOver'
    | 'paused' | 'resumed' | 'guessOnHold'

/** Values interpolated into a log message, e.g. `{ name: 'Bob' }`. */
export type LogParams = Record<string, string | number>

/** Sent by the drawer and relayed verbatim to everyone else. */
export type DrawingMessage
  = | { t: 'strokeStart', id: string, brush: WireBrush }
  /** `pts` is flat, `POINT_STRIDE` numbers per point. */
    | { t: 'draw', id: string, pts: number[] }
  /**
   * An in-progress shape, as SVG. Unlike `commit` this is transient: the
   * server relays it but never folds it into the cached canvas.
   */
    | { t: 'preview', id: string, svg: string }
    | { t: 'commit', id: string, svg: string }
    | { t: 'canvas', svg: string }

/** Client -> server. */
export type ClientMessage
  = | DrawingMessage
    | { t: 'guess', text: string }
    | { t: 'chat', text: string }
    | { t: 'start' }
  /** Host only, between games. Fields left out stay as they are. */
    | { t: 'settings', settings: Partial<RoomSettings> }
  /** Cast (`want: true`) or withdraw a vote to pause or resume. */
    | { t: 'pause', want: boolean }
    | { t: 'ping' }

/** Server -> client. */
export type ServerMessage
  = | DrawingMessage
    | { t: 'welcome', you: string, state: GameState }
    | { t: 'state', state: GameState }
  /** `word` is present only in the copy sent to the drawer. */
    | { t: 'turn', drawerId: string, round: number, endsAt: number, hint: string, word?: string }
    | { t: 'roundEnd', word: string, state: GameState }
    | { t: 'log', level: LogLevel, key: LogKey, params?: LogParams }
    | { t: 'chat', sender: string, text: string, private?: boolean }
  /** Sent to the host only, whenever the list changes or the host does. */
    | { t: 'customWords', words: string[] }
    | { t: 'pong' }

/** Messages only the current drawer is allowed to send. */
const DRAWING_MESSAGES = new Set(['strokeStart', 'draw', 'preview', 'commit', 'canvas'])

export function isDrawingMessage(msg: ClientMessage): msg is DrawingMessage {
  return DRAWING_MESSAGES.has(msg.t)
}

/**
 * Quantise a coordinate to a tenth of a user-space unit.
 *
 * On a 1600-unit-wide canvas that is finer than a physical pixel on any
 * realistic display, and it keeps every point an integer on the wire.
 */
export function quantize(n: number) {
  return Math.round(n * 10)
}

export function dequantize(n: number) {
  return n / 10
}

/**
 * Mask a word for guessers: letters become underscores, spaces survive, and
 * so do the letters at the `revealed` indices, which hints have given away.
 */
export function maskWord(word: string, revealed: readonly number[] = []) {
  const shown = new Set(revealed)
  return [...word].map((c, i) => (/\s/.test(c) || shown.has(i) ? c : '_')).join('')
}

/**
 * Letters a turn actually reveals: the room's setting, but never more than
 * half the word, so a hint can't simply hand over a short one.
 */
export function hintBudget(word: string, hints: number) {
  const letters = [...word].filter(c => !/\s/.test(c)).length
  return Math.max(0, Math.min(hints, Math.floor(letters / 2)))
}

/**
 * Ms into a turn at which hint `n` (1-based) is revealed. The hints split
 * the turn evenly, so the last one still leaves time to use it. Whole ms, so
 * the alarm that fires at this time is sure to find the hint due.
 */
export function hintRevealAt(n: number, drawMs: number, budget: number) {
  return Math.ceil(drawMs * n / (budget + 1))
}

/**
 * Characters in each word of an answer, e.g. `ice cream` -> `[3, 5]`.
 *
 * Works on the masked hint just as well, since masking keeps the spaces, so
 * guessers get the counts without ever seeing the word.
 */
export function wordLengths(text: string) {
  return text.split(/\s+/).filter(Boolean).map(w => [...w].length)
}

/** Normalise a guess for comparison: case, accents and spacing are ignored. */
export function normalizeGuess(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
}

/**
 * Levenshtein distance, capped so a long pair of strings costs little.
 *
 * Used only to tell a guesser they are close; never to accept a guess.
 */
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
