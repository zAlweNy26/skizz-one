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

export type RoundPhase = 'lobby' | 'drawing' | 'intermission' | 'finished'

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
  hostId: string | null
  drawerId: string | null
  /** Epoch ms the current phase ends, or null when untimed. */
  endsAt: number | null
  /** Masked word shown to guessers, e.g. `____`. Never the word itself. */
  hint: string
  players: GamePlayer[]
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
    | { t: 'language', language: Language }
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

/** Mask a word for guessers: letters become underscores, spaces survive. */
export function maskWord(word: string) {
  return word.replace(/\S/g, '_')
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
