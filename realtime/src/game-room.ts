import type { Connection, ConnectionContext, WSMessage } from 'partyserver'
import type {
  ClientMessage,
  DrawingMessage,
  GamePlayer,
  GameState,
  Language,
  LogKey,
  LogLevel,
  LogParams,
  RoundPhase,
  ServerMessage,
} from '../../shared/utils/protocol'
import { Server } from 'partyserver'
import {
  DEFAULT_LANGUAGE,
  DRAWER_GRACE_MS,
  editDistance,
  isDrawingMessage,
  isLanguage,
  LANGUAGES,
  maskWord,
  MAX_NAME_LENGTH,
  normalizeGuess,
  PAUSABLE_PHASES,
  votesNeeded,
} from '../../shared/utils/protocol'
import { pickWord } from './words'

/** How long a drawer gets to draw. */
const ROUND_MS = 80_000

/** Pause between the word reveal and the next turn. */
const INTERMISSION_MS = 6_000

const TOTAL_ROUNDS = 3

/** Guessing fast is worth more; guessing at all is worth something. */
const BASE_GUESS_POINTS = 50
const SPEED_GUESS_POINTS = 200

/** What the drawer earns for each player who gets it. */
const DRAWER_POINTS_PER_GUESS = 25

/** A guess this close to the word earns a private "you're close" nudge. */
const NEAR_MISS_DISTANCE = 2

type AlarmKind = 'round' | 'intermission' | 'grace'

interface StoredPlayer {
  id: string
  name: string
  points: number
  guessed: boolean
  connected: boolean
}

interface RoomState {
  phase: RoundPhase
  round: number
  totalRounds: number
  language: Language
  hostId: string | null
  drawerId: string | null
  endsAt: number | null
  /** The secret. Never leaves this object except to the drawer. */
  word: string | null
  usedWords: string[]
  /** Turn order, in join order. */
  order: string[]
  turnIndex: number
  players: Record<string, StoredPlayer>
  alarmKind: AlarmKind | null
  /** Time left in the round while it is paused for a disconnected drawer. */
  pausedMs: number | null
  /** Players voting to pause, or to resume once paused. */
  pauseVotes: string[]
  /**
   * The countdown frozen by a vote: which alarm to re-arm, and with how
   * long. Separate from `pausedMs`, which the drawer's grace window owns.
   */
  pause: { kind: AlarmKind, remainingMs: number } | null
}

interface ConnState {
  playerId: string
}

function initialState(): RoomState {
  return {
    phase: 'lobby',
    round: 0,
    totalRounds: TOTAL_ROUNDS,
    language: DEFAULT_LANGUAGE,
    hostId: null,
    drawerId: null,
    endsAt: null,
    word: null,
    usedWords: [],
    order: [],
    turnIndex: -1,
    players: {},
    alarmKind: null,
    pausedMs: null,
    pauseVotes: [],
    pause: null,
  }
}

export class GameRoom extends Server<Env> {
  /**
   * Hibernate between messages.
   *
   * partyserver defaults this to `false`, which bills wall-clock duration for
   * every open connection. Cloudflare's own comparison for 100 rooms of 50
   * players: ~$143/mo without hibernation against ~$21/mo with it.
   */
  static options = { hibernate: true }

  #state: RoomState = initialState()

  /**
   * Cached SVG innerHTML, so a late joiner sees the drawing immediately.
   *
   * Kept out of `#state` so a guess or a join doesn't rewrite a canvas that
   * can grow to hundreds of KB.
   */
  #canvas = ''

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Hydrate before any handler runs. This also covers waking from
    // hibernation, where the constructor runs again on a fresh isolate.
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<RoomState | string>(['state', 'canvas'])
      // Spread over the defaults so a room saved before a field existed
      // (e.g. `language`) still wakes up with every field set.
      this.#state = { ...initialState(), ...(stored.get('state') as RoomState | undefined) }
      this.#canvas = (stored.get('canvas') as string | undefined) ?? ''
    })
  }

  #save() {
    return this.ctx.storage.put('state', this.#state)
  }

  /**
   * Persist the canvas without holding back outgoing messages.
   *
   * A Durable Object's output gate delays every message sent while a write
   * is pending, so a confirmed write here would stall the next stroke's
   * points behind every commit. Losing the last stroke of a sketch if the
   * object crashes mid-write is an acceptable price.
   */
  #saveCanvas() {
    void this.ctx.storage.put('canvas', this.#canvas, { allowUnconfirmed: true })
  }

  // --- messaging helpers -------------------------------------------------

  #send(connection: Connection, msg: ServerMessage) {
    connection.send(JSON.stringify(msg))
  }

  #broadcast(msg: ServerMessage, without?: string[]) {
    this.broadcast(JSON.stringify(msg), without)
  }

  #log(level: LogLevel, key: LogKey, params?: LogParams) {
    this.#broadcast({ t: 'log', level, key, params })
  }

  /** Every live connection belonging to a player. */
  #connectionsOf(playerId: string) {
    return [...this.getConnections<ConnState>(playerId)]
  }

  #playerIdOf(connection: Connection): string | null {
    return (connection.state as ConnState | null)?.playerId ?? null
  }

  /**
   * The room as everyone is allowed to see it.
   *
   * Deliberately has no `word` field — the secret is only ever sent to the
   * drawer, in a `turn` message addressed to their connections.
   */
  #publicState(): GameState {
    const s = this.#state
    return {
      id: this.name,
      phase: s.phase,
      round: s.round,
      totalRounds: s.totalRounds,
      language: s.language,
      hostId: s.hostId,
      drawerId: s.drawerId,
      endsAt: s.endsAt,
      hint: s.word ? maskWord(s.word) : '',
      players: s.order
        .map(id => s.players[id])
        .filter((p): p is StoredPlayer => Boolean(p))
        .map<GamePlayer>(p => ({
          id: p.id,
          name: p.name,
          points: p.points,
          connected: p.connected,
          guessed: p.guessed,
        })),
      paused: s.pause !== null,
      pauseVotes: this.#pauseVoters(),
      remainingMs: s.pause?.remainingMs ?? null,
    }
  }

  #broadcastState() {
    this.#broadcast({ t: 'state', state: this.#publicState() })
  }

  // --- connection lifecycle ----------------------------------------------

  /** Tag each connection with its player id so we can address a player. */
  getConnectionTags(_connection: Connection, ctx: ConnectionContext): string[] {
    const playerId = new URL(ctx.request.url).searchParams.get('playerId')
    return playerId ? [playerId] : []
  }

  async onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url)
    const playerId = url.searchParams.get('playerId')
    const name = (url.searchParams.get('name') ?? '').trim().slice(0, MAX_NAME_LENGTH).trim()

    if (!playerId || !name) {
      connection.close(1008, 'playerId and name are required')
      return
    }

    ;(connection as Connection<ConnState>).setState({ playerId })

    const s = this.#state
    const existing = s.players[playerId]

    if (existing) {
      existing.connected = true
      existing.name = name
    } else {
      s.players[playerId] = {
        id: playerId,
        name,
        points: 0,
        guessed: false,
        connected: true,
      }
      s.order.push(playerId)
      this.#log('info', 'joined', { name })
    }

    s.hostId ??= playerId

    if (existing && s.drawerId === playerId && s.alarmKind === 'grace') {
      const remaining = s.pausedMs ?? ROUND_MS
      s.pausedMs = null
      s.endsAt = Date.now() + remaining
      await this.#setAlarm('round', remaining)
      this.#log('success', 'reconnected', { name })
    }

    await this.#save()

    this.#send(connection, { t: 'welcome', you: playerId, state: this.#publicState() })
    if (this.#canvas) this.#send(connection, { t: 'canvas', svg: this.#canvas })

    if (s.drawerId === playerId && s.word && s.phase === 'drawing') {
      this.#send(connection, {
        t: 'turn',
        drawerId: playerId,
        round: s.round,
        endsAt: s.endsAt ?? Date.now(),
        hint: maskWord(s.word),
        word: s.word,
      })
    }

    this.#broadcastState()
  }

  async onClose(connection: Connection) {
    const playerId = this.#playerIdOf(connection)
    if (!playerId) return

    const s = this.#state
    const player = s.players[playerId]
    if (!player) return

    // Another tab may still hold this player open.
    const stillOpen = this.#connectionsOf(playerId)
      .some(c => c !== connection && c.readyState === WebSocket.OPEN)
    if (stillOpen) return

    player.connected = false
    // A vote is cast by someone at the table: leaving withdraws it.
    s.pauseVotes = s.pauseVotes.filter(id => id !== playerId)

    if (s.hostId === playerId) {
      const nextHost = s.order.find(id => s.players[id]?.connected)
      s.hostId = nextHost ?? null
      if (nextHost)
        this.#log('warning', 'hostLeft', { name: player.name, host: s.players[nextHost]!.name })
    } else
      this.#log('info', 'disconnected', { name: player.name })

    if (s.pause) {
      // A frozen countdown has nothing to run out. The grace window, or the
      // "everyone guessed" check, waits for the resume.
    } else if (s.phase === 'drawing' && s.drawerId === playerId) {
      // Hold the round briefly: a locked phone or a refresh shouldn't end it.
      s.pausedMs = Math.max(0, (s.endsAt ?? Date.now()) - Date.now())
      s.endsAt = null
      await this.#setAlarm('grace', DRAWER_GRACE_MS)
      this.#log('warning', 'drawerDropped', { name: player.name })
    } else if (s.phase === 'drawing')
      await this.#endRoundIfEveryoneGuessed()

    // The one holdout leaving can make the rest unanimous.
    await this.#checkPauseVotes()

    await this.#save()
    this.#broadcastState()
  }

  // --- messages ----------------------------------------------------------

  async onMessage(connection: Connection, message: WSMessage) {
    const playerId = this.#playerIdOf(connection)
    if (!playerId) return

    let msg: ClientMessage
    try {
      msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message))
    } catch {
      return
    }

    if (msg.t === 'ping') {
      this.#send(connection, { t: 'pong' })
      return
    }

    const s = this.#state

    if (isDrawingMessage(msg)) {
      if (playerId !== s.drawerId || s.phase !== 'drawing' || s.pause) return
      this.#handleDrawing(connection, msg)
      return
    }

    switch (msg.t) {
      case 'start':
        if (this.#canConfigure(playerId)) await this.#startGame()

        break
      case 'language':
        await this.#setLanguage(playerId, msg.language)
        break
      case 'pause':
        await this.#votePause(playerId, msg.want)
        break
      case 'guess':
        await this.#handleGuess(connection, playerId, msg.text)
        break
      case 'chat':
        this.#handleChat(playerId, msg.text)
        break
    }
  }

  #handleDrawing(connection: Connection, msg: DrawingMessage) {
    // Relay verbatim — the server never parses stroke geometry.
    this.#broadcast(msg, [connection.id])

    // Keep a snapshot so anyone joining late sees the drawing so far. Only
    // the settled states are persisted, never the in-flight points.
    if (msg.t === 'commit') this.#canvas += msg.svg
    else if (msg.t === 'canvas') this.#canvas = msg.svg
    else return
    this.#saveCanvas()
  }

  /** Only the host sets the game up, and only between games. */
  #canConfigure(playerId: string) {
    const s = this.#state
    return playerId === s.hostId && (s.phase === 'lobby' || s.phase === 'finished')
  }

  /** Not mid-game: the next word would come from a different list. */
  async #setLanguage(playerId: string, language: unknown) {
    const s = this.#state
    if (!this.#canConfigure(playerId) || !isLanguage(language) || language === s.language) return

    s.language = language
    await this.#save()
    this.#log('info', 'languageChanged', { language: LANGUAGES[language] })
    this.#broadcastState()
  }

  async #handleGuess(connection: Connection, playerId: string, rawText: string) {
    const s = this.#state
    const player = s.players[playerId]
    if (!player) return

    const text = rawText.slice(0, 120).trim()
    if (!text) return

    if (s.phase !== 'drawing' || playerId === s.drawerId || player.guessed) {
      this.#handleChat(playerId, text)
      return
    }

    // The drawing is frozen too: studying it for free isn't fair play.
    if (s.pause) {
      this.#send(connection, { t: 'log', level: 'warning', key: 'guessOnHold' })
      return
    }

    const guess = normalizeGuess(text)
    const answer = normalizeGuess(s.word ?? '')

    if (!answer || guess !== answer) {
      this.#broadcast({ t: 'chat', sender: player.name, text })

      if (answer && editDistance(guess, answer, NEAR_MISS_DISTANCE) <= NEAR_MISS_DISTANCE)
        this.#send(connection, { t: 'log', level: 'warning', key: 'close', params: { text } })

      return
    }

    // Correct. The text is never echoed — that would hand everyone the answer.
    player.guessed = true

    const remaining = Math.max(0, (s.endsAt ?? Date.now()) - Date.now())
    player.points += BASE_GUESS_POINTS + Math.round(SPEED_GUESS_POINTS * (remaining / ROUND_MS))

    const drawer = s.drawerId ? s.players[s.drawerId] : null
    if (drawer) drawer.points += DRAWER_POINTS_PER_GUESS

    this.#log('success', 'guessed', { name: player.name })
    await this.#save()
    this.#broadcastState()

    await this.#endRoundIfEveryoneGuessed()
  }

  /**
   * Chat among players who are out of the guessing.
   *
   * Kept away from players still guessing so a correct answer can't leak
   * sideways through conversation.
   */
  #handleChat(playerId: string, rawText: string) {
    const s = this.#state
    const player = s.players[playerId]
    if (!player) return

    const text = rawText.slice(0, 200).trim()
    if (!text) return

    if (s.phase !== 'drawing') {
      this.#broadcast({ t: 'chat', sender: player.name, text })
      return
    }

    const payload = JSON.stringify({
      t: 'chat',
      sender: player.name,
      text,
      private: true,
    } satisfies ServerMessage)

    for (const conn of this.getConnections<ConnState>()) {
      const id = (conn.state as ConnState | null)?.playerId
      if (!id) continue
      const other = s.players[id]
      if (other?.guessed || id === s.drawerId) conn.send(payload)
    }
  }

  // --- pausing -----------------------------------------------------------

  /** Voters still at the table, in a stable order. */
  #pauseVoters() {
    const s = this.#state
    return s.pauseVotes.filter(id => s.players[id]?.connected)
  }

  /**
   * Cast or withdraw a vote.
   *
   * Not while the drawer's grace window runs: that timer already holds the
   * round, and two freezes over one countdown would fight over it.
   */
  async #votePause(playerId: string, want: unknown) {
    const s = this.#state
    if (!PAUSABLE_PHASES.includes(s.phase) || s.alarmKind === 'grace') return

    const has = s.pauseVotes.includes(playerId)
    if (want === true && !has) s.pauseVotes.push(playerId)
    else if (want === false && has) s.pauseVotes = s.pauseVotes.filter(id => id !== playerId)
    else return

    await this.#checkPauseVotes()
    await this.#save()
    this.#broadcastState()
  }

  /** Flip the pause if the votes are there. The caller saves and broadcasts. */
  async #checkPauseVotes() {
    const s = this.#state
    const connected = s.order.filter(id => s.players[id]?.connected).length
    const votes = this.#pauseVoters().length
    if (votes === 0 || votes < votesNeeded(connected, s.pause !== null)) return

    s.pauseVotes = []
    if (s.pause) await this.#resumeCountdown()
    else await this.#pauseCountdown()
  }

  async #pauseCountdown() {
    const s = this.#state
    if (!s.alarmKind || !PAUSABLE_PHASES.includes(s.phase)) return

    s.pause = {
      kind: s.alarmKind,
      remainingMs: Math.max(0, (s.endsAt ?? Date.now()) - Date.now()),
    }
    s.endsAt = null
    s.alarmKind = null
    await this.ctx.storage.deleteAlarm()
    this.#log('info', 'paused')
  }

  async #resumeCountdown() {
    const s = this.#state
    const pause = s.pause
    if (!pause) return
    s.pause = null
    this.#log('info', 'resumed')

    // The drawer left while the room was frozen: now their grace window runs.
    const drawer = s.drawerId ? s.players[s.drawerId] : null
    if (s.phase === 'drawing' && drawer && !drawer.connected) {
      s.pausedMs = pause.remainingMs
      await this.#setAlarm('grace', DRAWER_GRACE_MS)
      this.#log('warning', 'drawerDropped', { name: drawer.name })
      return
    }

    s.endsAt = Date.now() + pause.remainingMs
    await this.#setAlarm(pause.kind, pause.remainingMs)

    // Guessers may have left while frozen, leaving only players who got it.
    if (s.phase === 'drawing') await this.#endRoundIfEveryoneGuessed()
  }

  // --- round flow --------------------------------------------------------

  async #setAlarm(kind: AlarmKind, ms: number) {
    this.#state.alarmKind = kind
    await this.ctx.storage.setAlarm(Date.now() + ms)
  }

  async #startGame() {
    const s = this.#state
    s.round = 0
    s.turnIndex = -1
    s.usedWords = []
    s.pauseVotes = []
    s.pause = null
    for (const p of Object.values(s.players)) p.points = 0
    await this.#startTurn()
  }

  /** The next connected player in turn order, or null if nobody can draw. */
  #nextDrawerIndex(): number | null {
    const s = this.#state
    for (let step = 1; step <= s.order.length; step++) {
      const index = (s.turnIndex + step) % s.order.length
      const id = s.order[index]
      if (id && s.players[id]?.connected) return index
    }
    return null
  }

  async #startTurn() {
    const s = this.#state

    const connected = s.order.filter(id => s.players[id]?.connected)
    if (connected.length < 2) {
      s.phase = 'lobby'
      s.drawerId = null
      s.word = null
      s.endsAt = null
      s.alarmKind = null
      s.pauseVotes = []
      await this.#save()
      this.#log('info', 'waitingForPlayers')
      this.#broadcastState()
      return
    }

    const next = this.#nextDrawerIndex()
    if (next === null) return

    // Wrapping past the end of the order completes a round.
    if (next <= s.turnIndex || s.turnIndex === -1) s.round += 1

    if (s.round > s.totalRounds) {
      await this.#finishGame()
      return
    }

    s.turnIndex = next
    s.drawerId = s.order[next]!
    s.phase = 'drawing'
    s.word = pickWord(s.language, s.usedWords)
    s.usedWords.push(s.word)
    this.#canvas = ''
    this.#saveCanvas()
    s.pausedMs = null
    s.endsAt = Date.now() + ROUND_MS

    for (const p of Object.values(s.players)) p.guessed = false

    await this.#setAlarm('round', ROUND_MS)
    await this.#save()

    // Everyone gets the masked hint; only the drawer gets the word itself.
    const hint = maskWord(s.word)
    this.#broadcast({ t: 'canvas', svg: '' })
    this.#broadcast(
      { t: 'turn', drawerId: s.drawerId, round: s.round, endsAt: s.endsAt, hint },
      this.#connectionsOf(s.drawerId).map(c => c.id),
    )
    for (const conn of this.#connectionsOf(s.drawerId)) {
      this.#send(conn, {
        t: 'turn',
        drawerId: s.drawerId,
        round: s.round,
        endsAt: s.endsAt,
        hint,
        word: s.word,
      })
    }

    this.#log('info', 'drawing', { name: s.players[s.drawerId]?.name ?? '' })
    this.#broadcastState()
  }

  async #endRoundIfEveryoneGuessed() {
    const s = this.#state
    if (s.phase !== 'drawing') return

    const guessers = s.order
      .map(id => s.players[id])
      .filter(p => p && p.connected && p.id !== s.drawerId)

    if (guessers.length > 0 && guessers.every(p => p!.guessed))
      await this.#endRound()
  }

  async #endRound() {
    const s = this.#state
    const word = s.word ?? ''

    s.phase = 'intermission'
    s.endsAt = Date.now() + INTERMISSION_MS
    s.word = null
    s.drawerId = null
    s.pausedMs = null

    await this.#setAlarm('intermission', INTERMISSION_MS)
    await this.#save()

    this.#broadcast({ t: 'roundEnd', word, state: this.#publicState() })
  }

  async #finishGame() {
    const s = this.#state
    s.phase = 'finished'
    s.drawerId = null
    s.word = null
    s.endsAt = null
    s.alarmKind = null
    s.pauseVotes = []
    await this.ctx.storage.deleteAlarm()
    await this.#save()

    const winner = s.order
      .map(id => s.players[id])
      .filter((p): p is StoredPlayer => Boolean(p))
      .sort((a, b) => b.points - a.points)[0]

    if (winner) this.#log('success', 'winner', { name: winner.name, points: winner.points })
    else this.#log('success', 'gameOver')
    this.#broadcastState()
  }

  async onAlarm() {
    const s = this.#state
    const kind = s.alarmKind
    s.alarmKind = null

    switch (kind) {
      case 'round':
        this.#log('warning', 'timeUp')
        await this.#endRound()
        break
      case 'grace':
        // The drawer never came back.
        this.#log('warning', 'drawerGone')
        await this.#endRound()
        break
      case 'intermission':
        await this.#startTurn()
        break
      default:
        await this.#save()
    }
  }
}
