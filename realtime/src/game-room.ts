import type { Connection, ConnectionContext, WSMessage } from 'partyserver'
import type {
  Award,
  ClientMessage,
  DrawingMessage,
  GamePlayer,
  GameState,
  Language,
  LogKey,
  LogLevel,
  LogParams,
  PublicRoom,
  Reaction,
  RoomSettings,
  RoundPhase,
  ServerMessage,
} from '#shared/utils/protocol'
import { getServerByName, Server } from 'partyserver'
import { RateLimiter } from '#realtime/rate-limit'
import { drawerShare, guessPoints, standings } from '#realtime/scoring'
import { pickWords } from '#realtime/words'
import {
  AWAY_GRACE_MS,
  clampSetting,
  cleanCustomWords,
  DEFAULT_LANGUAGE,
  DRAW_TIME,
  DRAWER_GRACE_MS,
  editDistance,
  hintBudget,
  hintRevealAt,
  HINTS,
  isDrawingMessage,
  isLanguage,
  KICKED_CLOSE_CODE,
  kickVotesNeeded,
  LANGUAGES,
  maskWord,
  MAX_AVATAR_LENGTH,
  MAX_NAME_LENGTH,
  MIN_PLAYERS_TO_VOTE_KICK,
  normalizeGuess,
  PAUSABLE_PHASES,
  PUBLIC_ROOM_CAP,
  ROOM_FULL_CLOSE_CODE,
  ROUNDS,
  votesNeeded,
  WORD_CHOICES,
} from '#shared/utils/protocol'
import { sanitizeSvg } from '#shared/utils/svg'

/** Pause between the word reveal and the next turn. */
const INTERMISSION_MS = 5_000

/** How long the drawer has to pick a word before one is picked for them. */
const CHOOSE_MS = 15_000

/** Edit distance at which a guess earns a private "you're close" nudge. */
const NEAR_MISS_DISTANCE = 2

/** How long an empty room keeps its state before it is wiped. */
const ROOM_RETENTION_MS = 15 * 60_000

/** Canvas writes are batched this long. */
const CANVAS_SAVE_MS = 1_000

/** Longest cached canvas, in characters; storage caps a value at 2 MB. */
const MAX_CANVAS_LENGTH = 1_000_000

/** Longest secret a client may identify itself with. */
const MAX_TOKEN_LENGTH = 64

/** Hex characters of a player's public id. */
const PLAYER_ID_LENGTH = 32

/** Guesses and chat lines a player can send at once, then one per refill. */
const TEXT_BURST = 5
const TEXT_REFILL_MS = 1_000

/** Votes, reactions and host commands a player can send at once, then one per refill. */
const ACTION_BURST = 5
const ACTION_REFILL_MS = 500

const ACTIONS: ReadonlySet<ClientMessage['t']> = new Set(['start', 'settings', 'pause', 'react', 'kick'])

const IN_GAME_PHASES: readonly RoundPhase[] = ['choosing', 'drawing', 'intermission']

type AlarmKind = 'choose' | 'round' | 'intermission' | 'grace'

interface StoredPlayer {
  id: string
  name: string
  avatar: string
  points: number
  guessed: boolean
  connected: boolean
  /** When the player's last connection dropped, while they still have a seat. */
  awaySince?: number
}

interface RoomState {
  phase: RoundPhase
  round: number
  totalRounds: number
  language: Language
  /** Seconds per turn. */
  drawTime: number
  hints: number
  customWords: string[]
  public: boolean
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
  /** Voters against each target, by target id. */
  kickVotes: Record<string, string[]>
  /** Players kicked from the room, who can't rejoin it. */
  banned: string[]
  stats: GameStats
  /** When the last seat was freed; null while anyone is connected. */
  emptySince: number | null
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

function emptyStats(): GameStats {
  return { fastest: null, closeGuesses: {}, mostLiked: null, guessedOn: {} }
}

/** The player with the highest positive count; the earliest of a tie. */
function topCount(counts: Record<string, number>) {
  let best: [string, number] | null = null
  for (const entry of Object.entries(counts))
    if (entry[1] > 0 && entry[1] > (best?.[1] ?? 0)) best = entry
  return best
}

interface ConnState {
  playerId: string
}

function initialState(): RoomState {
  return {
    phase: 'lobby',
    round: 0,
    totalRounds: ROUNDS.default,
    language: DEFAULT_LANGUAGE,
    drawTime: DRAW_TIME.default,
    hints: HINTS.default,
    customWords: [],
    public: false,
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
    kickVotes: {},
    banned: [],
    stats: emptyStats(),
    emptySince: null,
  }
}

export class GameRoom extends Server<Env> {
  static options = { hibernate: true }

  #state: RoomState = initialState()

  /** Cached SVG innerHTML for late joiners. */
  #canvas = ''

  #canvasTimer: ReturnType<typeof setTimeout> | null = null

  /** The last listing sent to the lobby, as JSON. */
  #reported: string | null = null

  #textLimit = new RateLimiter(TEXT_BURST, TEXT_REFILL_MS)
  #actionLimit = new RateLimiter(ACTION_BURST, ACTION_REFILL_MS)

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(
      JSON.stringify({ t: 'ping' } satisfies ClientMessage),
      JSON.stringify({ t: 'pong' } satisfies ServerMessage),
    ))
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<RoomState | string>(['state', 'canvas'])
      this.#state = { ...initialState(), ...(stored.get('state') as RoomState | undefined) }
      this.#canvas = (stored.get('canvas') as string | undefined) ?? ''
    })
  }

  #save() {
    return this.ctx.storage.put('state', this.#state)
  }

  #saveCanvas() {
    this.#canvasTimer ??= setTimeout(() => {
      this.#canvasTimer = null
      void this.ctx.storage.put('canvas', this.#canvas)
    }, CANVAS_SAVE_MS)
  }

  async #wipe() {
    if (this.#canvasTimer) clearTimeout(this.#canvasTimer)
    this.#canvasTimer = null
    this.#state = initialState()
    this.#canvas = ''
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }

  /** Forget players whose seat has been freed. */
  #pruneDeparted() {
    const s = this.#state
    s.order = s.order.filter(id => s.players[id]?.connected)
    for (const player of Object.values(s.players))
      if (!player.connected) delete s.players[player.id]
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

  #connectionsOf(playerId: string) {
    return [...this.getConnections<ConnState>(playerId)]
  }

  #playerIdOf(connection: Connection): string | null {
    return (connection.state as ConnState | null)?.playerId ?? null
  }

  /** Everyone with a place on the scoreboard, in join order. */
  #listed() {
    const s = this.#state
    return s.order
      .filter(id => !s.banned.includes(id))
      .map(id => s.players[id])
      .filter((p): p is StoredPlayer => Boolean(p))
  }

  /** The room as everyone is allowed to see it. */
  #publicState(): GameState {
    const s = this.#state
    const listed = this.#listed()
    const ranks = new Map(standings(listed).map((p, index) => [p.id, index + 1]))
    return {
      id: this.name,
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
      players: listed.map<GamePlayer>(p => ({
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
      pauseVotes: this.#pauseVoters(),
      remainingMs: s.pause?.remainingMs ?? null,
      reactions: s.reactions,
      kickVotes: Object.fromEntries(Object.keys(s.kickVotes).flatMap((target) => {
        const voters = this.#kickVoters(target)
        return voters.length ? [[target, voters]] : []
      })),
      awards: s.phase === 'finished' ? this.#awards() : [],
      public: s.public,
    }
  }

  #awards() {
    const s = this.#state
    const { fastest, closeGuesses, mostLiked, guessedOn } = s.stats
    const close = topCount(closeGuesses)
    const picasso = topCount(guessedOn)
    const awards: Award[] = [
      ...(fastest ? [{ key: 'fastest' as const, playerId: fastest.playerId, value: fastest.ms }] : []),
      ...(mostLiked ? [{ key: 'mostLiked' as const, playerId: mostLiked.playerId, value: mostLiked.likes }] : []),
      ...(close ? [{ key: 'almostHadIt' as const, playerId: close[0], value: close[1] }] : []),
      ...(picasso ? [{ key: 'picasso' as const, playerId: picasso[0], value: picasso[1] }] : []),
    ]
    return awards.filter(a => s.players[a.playerId] && !s.banned.includes(a.playerId))
  }

  #broadcastState() {
    this.#broadcast({ t: 'state', state: this.#publicState() })
    this.#reportToLobby()
  }

  /** The room as the lobby lists it, or null to stay unlisted. Called by the lobby to confirm a stale listing. */
  listing(): PublicRoom | null {
    const s = this.#state
    const players = this.#activeCount()
    const host = s.hostId ? s.players[s.hostId] : null
    if (!s.public || players === 0 || !host) return null
    return {
      id: this.name,
      hostName: host.name,
      players,
      language: s.language,
      phase: s.phase,
      round: s.round,
      totalRounds: s.totalRounds,
    }
  }

  #reportToLobby() {
    const room = this.listing()
    const report = JSON.stringify(room)
    if (report === this.#reported || (this.#reported === null && room === null)) return
    this.#reported = report
    this.ctx.waitUntil(getServerByName(this.env.Lobby, 'global')
      .then(lobby => lobby.update(this.name, room))
      .catch(() => {
        this.#reported = null
      }))
  }

  #sendCustomWords() {
    const s = this.#state
    if (!s.hostId) return
    for (const conn of this.#connectionsOf(s.hostId))
      this.#send(conn, { t: 'customWords', words: s.customWords })
  }

  #drawMs() {
    return this.#state.drawTime * 1000
  }

  #isActive(player: StoredPlayer | null | undefined) {
    return Boolean(player?.connected && player.awaySince === undefined)
  }

  /** Connected players, away ones included. */
  #seated() {
    const s = this.#state
    return s.order.filter(id => s.players[id]?.connected)
  }

  #activeCount() {
    const s = this.#state
    return s.order.filter(id => this.#isActive(s.players[id])).length
  }

  // --- connection lifecycle ----------------------------------------------

  /** The public id for a client's secret token: the only id anyone else ever sees. */
  async #playerIdFor(url: URL) {
    const token = url.searchParams.get('token')
    if (!token || token.length > MAX_TOKEN_LENGTH) return null
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${this.name}:${token}`))
    return [...new Uint8Array(digest)]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, PLAYER_ID_LENGTH)
  }

  async getConnectionTags(_connection: Connection, ctx: ConnectionContext) {
    const playerId = await this.#playerIdFor(new URL(ctx.request.url))
    return playerId ? [playerId] : []
  }

  async onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url)
    const playerId = await this.#playerIdFor(url)
    const name = (url.searchParams.get('name') ?? '').trim().slice(0, MAX_NAME_LENGTH).trim()
    const avatar = (url.searchParams.get('avatar') ?? '').trim().slice(0, MAX_AVATAR_LENGTH) || name

    if (!playerId || !name) {
      connection.close(1008, 'token and name are required')
      return
    }

    const s = this.#state
    if (s.banned.includes(playerId)) {
      this.#closeKicked(connection)
      return
    }

    ;(connection as Connection<ConnState>).setState({ playerId })

    const existing = s.players[playerId]
    if (s.public && !existing?.connected && this.#seated().length >= PUBLIC_ROOM_CAP) {
      this.#send(connection, { t: 'roomFull' })
      connection.close(ROOM_FULL_CLOSE_CODE, 'room is full')
      return
    }

    if (existing) {
      existing.connected = true
      existing.name = name
      existing.avatar = avatar
      delete existing.awaySince
    } else {
      if (s.order.length === 0 && url.searchParams.get('public') === '1') s.public = true
      s.players[playerId] = {
        id: playerId,
        name,
        avatar,
        points: 0,
        guessed: false,
        connected: true,
      }
      s.order.push(playerId)
      this.#log('info', 'joined', { name })
    }

    s.hostId ??= playerId
    s.emptySince = null

    if (existing && s.drawerId === playerId && s.alarmKind === 'grace') {
      const remaining = s.pausedMs ?? this.#drawMs()
      s.pausedMs = null
      s.endsAt = Date.now() + remaining
      await this.#armRound()
      this.#log('success', 'reconnected', { name })
    }

    await this.#scheduleAlarm()
    await this.#save()

    this.#send(connection, { t: 'welcome', you: playerId, state: this.#publicState() })
    if (this.#canvas) this.#send(connection, { t: 'canvas', svg: this.#canvas })
    if (s.hostId === playerId) this.#send(connection, { t: 'customWords', words: s.customWords })

    if (s.drawerId === playerId && s.word && s.phase === 'drawing') {
      this.#send(connection, {
        t: 'turn',
        drawerId: playerId,
        round: s.round,
        endsAt: s.endsAt ?? Date.now(),
        hint: maskWord(s.word, s.revealed),
        word: s.word,
      })
    }

    if (s.drawerId === playerId && s.phase === 'choosing')
      this.#sendChoices(connection)

    this.#broadcastState()
  }

  async onClose(connection: Connection) {
    const playerId = this.#playerIdOf(connection)
    if (!playerId) return

    const s = this.#state
    const player = s.players[playerId]
    if (!player?.connected || player.awaySince !== undefined) return

    const stillOpen = this.#connectionsOf(playerId)
      .some(c => c !== connection && c.readyState === WebSocket.OPEN)
    if (stillOpen) return

    player.awaySince = Date.now()
    s.pauseVotes = s.pauseVotes.filter(id => id !== playerId)

    if (s.pause) {
      // Deferred until resume.
    } else if (s.phase === 'drawing' && s.drawerId === playerId) {
      s.pausedMs = Math.max(0, (s.endsAt ?? Date.now()) - Date.now())
      s.endsAt = null
      await this.#setAlarm('grace', DRAWER_GRACE_MS)
      this.#log('warning', 'drawerDropped', { name: player.name })
    } else if (s.phase === 'drawing')
      await this.#endRoundIfEveryoneGuessed()

    await this.#checkPauseVotes()

    await this.#scheduleAlarm()
    await this.#save()
    this.#broadcastState()
  }

  /** Free a player's seat once their away grace runs out or they are kicked. The caller saves and broadcasts. */
  async #leave(player: StoredPlayer, kicked = false) {
    const s = this.#state
    player.connected = false
    delete player.awaySince
    delete s.kickVotes[player.id]
    s.pauseVotes = s.pauseVotes.filter(id => id !== player.id)
    this.#textLimit.forget(player.id)
    this.#actionLimit.forget(player.id)

    if (kicked) this.#log('warning', 'kicked', { name: player.name })

    if (s.hostId === player.id) {
      const nextHost = s.order.find(id => this.#isActive(s.players[id])) ?? this.#seated()[0]
      s.hostId = nextHost ?? null
      if (nextHost) {
        const host = s.players[nextHost]!.name
        if (kicked) this.#log('info', 'newHost', { name: host })
        else this.#log('warning', 'hostLeft', { name: player.name, host })
        this.#sendCustomWords()
      }
    } else if (!kicked)
      this.#log('info', 'disconnected', { name: player.name })

    if (!this.#seated().length) s.emptySince = Date.now()
    if (s.phase === 'lobby') this.#pruneDeparted()

    if (IN_GAME_PHASES.includes(s.phase) && this.#seated().length < 2) {
      await this.#finishGame()
      return
    }

    await this.#checkPauseVotes()
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
    if (typeof msg !== 'object' || msg === null) return

    const s = this.#state

    if (isDrawingMessage(msg)) {
      if (playerId !== s.drawerId || s.phase !== 'drawing' || s.pause) return
      this.#handleDrawing(connection, msg)
      return
    }

    if (msg.t === 'guess' || msg.t === 'chat') {
      if (!this.#textLimit.take(playerId)) {
        this.#send(connection, { t: 'log', level: 'warning', key: 'slowDown' })
        return
      }
    } else if (ACTIONS.has(msg.t) && !this.#actionLimit.take(playerId))
      return

    switch (msg.t) {
      case 'start':
        if (this.#canConfigure(playerId)) await this.#startGame()

        break
      case 'settings':
        await this.#configure(playerId, msg.settings)
        break
      case 'pause':
        await this.#votePause(playerId, msg.want)
        break
      case 'choose':
        await this.#chooseWord(playerId, msg.index)
        break
      case 'reroll':
        await this.#reroll(playerId)
        break
      case 'react':
        await this.#react(playerId, msg.reaction)
        break
      case 'kick':
        await this.#voteKick(playerId, msg.target, msg.want)
        break
      case 'guess':
        await this.#handleGuess(connection, playerId, msg.text)
        break
      case 'chat':
        this.#handleChat(playerId, msg.text)
        break
    }
  }

  #handleDrawing(connection: Connection, raw: DrawingMessage) {
    let msg = raw
    if (msg.t === 'preview' || msg.t === 'commit' || msg.t === 'canvas') {
      const svg = sanitizeSvg(msg.svg)
      if (svg === null) return
      msg = { ...msg, svg }
    }

    if (msg.t === 'commit' || msg.t === 'canvas') {
      const canvas = msg.t === 'commit' ? this.#canvas + msg.svg : msg.svg
      if (canvas.length > MAX_CANVAS_LENGTH) {
        this.#broadcast({ t: 'canvas', svg: this.#canvas })
        this.#send(connection, { t: 'log', level: 'warning', key: 'canvasFull' })
        return
      }
      this.#canvas = canvas
      this.#saveCanvas()
    }
    this.#broadcast(msg, [connection.id])
  }

  #canConfigure(playerId: string) {
    const s = this.#state
    return playerId === s.hostId && (s.phase === 'lobby' || s.phase === 'finished')
  }

  async #configure(playerId: string, settings: Partial<RoomSettings> | undefined) {
    const s = this.#state
    if (!this.#canConfigure(playerId) || typeof settings !== 'object' || settings === null) return

    const languageChanged = isLanguage(settings.language) && settings.language !== s.language
    if (languageChanged) s.language = settings.language!
    s.drawTime = clampSetting(settings.drawTime, DRAW_TIME) ?? s.drawTime
    s.totalRounds = clampSetting(settings.totalRounds, ROUNDS) ?? s.totalRounds
    s.hints = clampSetting(settings.hints, HINTS) ?? s.hints
    if (Array.isArray(settings.customWords)) s.customWords = cleanCustomWords(settings.customWords)
    if (typeof settings.public === 'boolean') s.public = settings.public

    await this.#save()
    if (languageChanged) this.#log('info', 'languageChanged', { language: LANGUAGES[s.language] })
    this.#broadcastState()
    this.#sendCustomWords()
  }

  async #handleGuess(connection: Connection, playerId: string, rawText: string) {
    const s = this.#state
    const player = s.players[playerId]
    if (!player || typeof rawText !== 'string') return

    const text = rawText.slice(0, 120).trim()
    if (!text) return

    if (s.phase !== 'drawing' || playerId === s.drawerId || player.guessed) {
      this.#handleChat(playerId, text)
      return
    }

    const guess = normalizeGuess(text)
    const answer = normalizeGuess(s.word ?? '')

    if (s.pause) {
      if (answer && guess === answer)
        this.#send(connection, { t: 'log', level: 'warning', key: 'guessOnHold' })
      else
        this.#broadcast({ t: 'chat', sender: player.name, text })
      return
    }

    if (!answer || guess !== answer) {
      this.#broadcast({ t: 'chat', sender: player.name, text })

      if (answer && editDistance(guess, answer, NEAR_MISS_DISTANCE) <= NEAR_MISS_DISTANCE) {
        this.#send(connection, { t: 'log', level: 'warning', key: 'close', params: { text } })
        s.stats.closeGuesses[playerId] = (s.stats.closeGuesses[playerId] ?? 0) + 1
        await this.#save()
      }

      return
    }

    const others = Object.values(s.players).filter(p => p.id !== s.drawerId)
    const rank = others.filter(p => p.guessed).length
    const guessers = others.filter(p => this.#isActive(p)).length
    player.guessed = true

    const remaining = Math.max(0, (s.endsAt ?? Date.now()) - Date.now())
    const points = guessPoints(remaining, this.#drawMs(), rank)
    player.points += points

    const drawer = s.drawerId ? s.players[s.drawerId] : null
    if (drawer) {
      drawer.points += drawerShare(points, rank, guessers)
      s.stats.guessedOn[drawer.id] = (s.stats.guessedOn[drawer.id] ?? 0) + 1
    }

    const ms = this.#drawMs() - remaining
    if (!s.stats.fastest || ms < s.stats.fastest.ms) s.stats.fastest = { playerId, ms }

    this.#log('success', 'guessed', { name: player.name })
    await this.#save()
    this.#broadcastState()

    await this.#endRoundIfEveryoneGuessed()
  }

  #handleChat(playerId: string, rawText: string) {
    const s = this.#state
    const player = s.players[playerId]
    if (!player || typeof rawText !== 'string') return

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

  async #react(playerId: string, reaction: unknown) {
    const s = this.#state
    if (s.phase !== 'drawing' || playerId === s.drawerId || !s.players[playerId]) return

    if (reaction === 'like' || reaction === 'dislike') s.reactions[playerId] = reaction
    else if (reaction === null) delete s.reactions[playerId]
    else return

    await this.#save()
    this.#broadcastState()
  }

  // --- kicking -----------------------------------------------------------

  #kickVoters(target: string) {
    const s = this.#state
    return (s.kickVotes[target] ?? []).filter(id => id !== target && this.#isActive(s.players[id]))
  }

  async #voteKick(playerId: string, target: unknown, want: unknown) {
    const s = this.#state
    const player = s.players[target as string]
    if (typeof target !== 'string' || target === playerId || !player?.connected || !this.#isActive(s.players[playerId]))
      return

    if (this.#activeCount() < MIN_PLAYERS_TO_VOTE_KICK) return

    const votes = s.kickVotes[target] ?? []
    const has = votes.includes(playerId)
    if (want === true && !has) s.kickVotes[target] = [...votes, playerId]
    else if (want === false && has) s.kickVotes[target] = votes.filter(id => id !== playerId)
    else return

    const tally = this.#kickVoters(target).length
    const needed = kickVotesNeeded(this.#activeCount())
    if (want === true && tally >= needed) await this.#kick(player)
    else if (want === true) {
      this.#log('warning', 'kickRequested', {
        name: s.players[playerId]?.name ?? '',
        target: player.name,
        votes: tally,
        needed,
      })
    }

    await this.#scheduleAlarm()
    await this.#save()
    this.#broadcastState()
  }

  #closeKicked(connection: Connection) {
    this.#send(connection, { t: 'kicked' })
    connection.close(KICKED_CLOSE_CODE, 'kicked')
  }

  /** Remove a player for good. The caller saves and broadcasts. */
  async #kick(player: StoredPlayer) {
    const s = this.#state
    s.banned.push(player.id)
    delete s.reactions[player.id]
    for (const [target, voters] of Object.entries(s.kickVotes))
      s.kickVotes[target] = voters.filter(id => id !== player.id)
    for (const conn of this.#connectionsOf(player.id)) this.#closeKicked(conn)

    const wasDrawer = s.drawerId === player.id
    await this.#leave(player, true)
    if (s.phase === 'finished' || s.phase === 'lobby') return

    if (wasDrawer) {
      s.pause = null
      s.pauseVotes = []
      if (s.phase === 'choosing') await this.#startTurn()
      else if (s.phase === 'drawing') await this.#endRound()
    } else if (s.phase === 'drawing')
      await this.#endRoundIfEveryoneGuessed()
  }

  // --- pausing -----------------------------------------------------------

  #pauseVoters() {
    const s = this.#state
    return s.pauseVotes.filter(id => this.#isActive(s.players[id]))
  }

  async #votePause(playerId: string, want: unknown) {
    const s = this.#state
    if (!PAUSABLE_PHASES.includes(s.phase) || s.alarmKind === 'grace') return

    const has = s.pauseVotes.includes(playerId)
    if (want === true && !has) s.pauseVotes.push(playerId)
    else if (want === false && has) s.pauseVotes = s.pauseVotes.filter(id => id !== playerId)
    else return

    const wasPaused = s.pause !== null
    await this.#checkPauseVotes()
    if (want === true && (s.pause !== null) === wasPaused) {
      this.#log('warning', wasPaused ? 'resumeRequested' : 'pauseRequested', {
        name: s.players[playerId]?.name ?? '',
        votes: this.#pauseVoters().length,
        needed: votesNeeded(this.#activeCount(), wasPaused),
      })
    }
    await this.#save()
    this.#broadcastState()
  }

  /** Flip the pause if the votes are there. The caller saves and broadcasts. */
  async #checkPauseVotes() {
    const s = this.#state
    const votes = this.#pauseVoters().length
    if (votes === 0 || votes < votesNeeded(this.#activeCount(), s.pause !== null)) return

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
    await this.#clearAlarm()
    this.#log('warning', 'paused')
  }

  async #resumeCountdown() {
    const s = this.#state
    const pause = s.pause
    if (!pause) return
    s.pause = null
    this.#log('warning', 'resumed')

    const drawer = s.drawerId ? s.players[s.drawerId] : null
    if (s.phase === 'drawing' && drawer && !this.#isActive(drawer)) {
      s.pausedMs = pause.remainingMs
      await this.#setAlarm('grace', DRAWER_GRACE_MS)
      this.#log('warning', 'drawerDropped', { name: drawer.name })
      return
    }

    s.endsAt = Date.now() + pause.remainingMs
    if (pause.kind === 'round') await this.#armRound()
    else await this.#setAlarm(pause.kind, pause.remainingMs)

    if (s.phase === 'drawing') await this.#endRoundIfEveryoneGuessed()
  }

  // --- round flow --------------------------------------------------------

  async #setAlarm(kind: AlarmKind, ms: number) {
    this.#state.alarmKind = kind
    this.#state.alarmAt = Date.now() + ms
    await this.#scheduleAlarm()
  }

  async #clearAlarm() {
    this.#state.alarmKind = null
    this.#state.alarmAt = null
    await this.#scheduleAlarm()
  }

  /** Point the storage alarm at whichever is due first: the game countdown or an away player's deadline. */
  async #scheduleAlarm() {
    const s = this.#state
    const due = Object.values(s.players).flatMap(p => (p.awaySince === undefined ? [] : [p.awaySince + AWAY_GRACE_MS]))
    if (s.alarmKind && s.alarmAt !== null) due.push(s.alarmAt)
    if (s.emptySince !== null) due.push(s.emptySince + ROOM_RETENTION_MS)
    if (due.length) await this.ctx.storage.setAlarm(Math.min(...due))
    else await this.ctx.storage.deleteAlarm()
  }

  /** Arm the drawing countdown for whichever comes first: the next hint or the end of the turn. */
  async #armRound() {
    const s = this.#state
    const drawMs = this.#drawMs()
    const remaining = Math.max(0, (s.endsAt ?? Date.now()) - Date.now())
    const budget = s.word ? hintBudget(s.word, s.hints) : 0

    let wait = remaining
    if (s.revealed.length < budget) {
      const elapsed = drawMs - remaining
      wait = Math.min(remaining, Math.max(0, hintRevealAt(s.revealed.length + 1, drawMs, budget) - elapsed))
    }
    await this.#setAlarm('round', wait)
  }

  /** Reveal a random hidden letter for every hint that has come due. */
  #revealDueHints() {
    const s = this.#state
    if (!s.word) return false
    const drawMs = this.#drawMs()
    const elapsed = drawMs - Math.max(0, (s.endsAt ?? Date.now()) - Date.now())
    const budget = hintBudget(s.word, s.hints)

    let revealedAny = false
    while (s.revealed.length < budget && elapsed >= hintRevealAt(s.revealed.length + 1, drawMs, budget)) {
      const hidden = [...s.word].flatMap((c, i) => (/\s/.test(c) || s.revealed.includes(i) ? [] : [i]))
      s.revealed.push(hidden[Math.floor(Math.random() * hidden.length)]!)
      revealedAny = true
    }
    return revealedAny
  }

  async #startGame() {
    const s = this.#state
    s.round = 0
    s.turnIndex = -1
    s.usedWords = []
    s.pauseVotes = []
    s.pause = null
    this.#pruneDeparted()
    for (const p of Object.values(s.players)) p.points = 0
    s.stats = emptyStats()
    await this.#startTurn()
  }

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

    if (this.#seated().length < 2) {
      s.phase = 'lobby'
      s.drawerId = null
      s.word = null
      s.choices = []
      s.endsAt = null
      await this.#clearAlarm()
      s.pauseVotes = []
      await this.#save()
      this.#log('info', 'waitingForPlayers')
      this.#broadcastState()
      return
    }

    const next = this.#nextDrawerIndex()
    if (next === null) return

    const round = next <= s.turnIndex || s.turnIndex === -1 ? s.round + 1 : s.round
    if (round > s.totalRounds) {
      await this.#finishGame()
      return
    }

    s.round = round
    s.turnIndex = next
    s.drawerId = s.order[next]!
    s.phase = 'choosing'
    s.word = null
    s.choices = pickWords(s.language, WORD_CHOICES, s.usedWords, s.customWords)
    s.rerolled = false
    s.revealed = []
    s.reactions = {}
    this.#canvas = ''
    this.#saveCanvas()
    s.pausedMs = null
    s.endsAt = Date.now() + CHOOSE_MS

    for (const p of Object.values(s.players)) p.guessed = false

    await this.#setAlarm('choose', CHOOSE_MS)
    await this.#save()

    this.#broadcast({ t: 'canvas', svg: '' })
    for (const conn of this.#connectionsOf(s.drawerId)) this.#sendChoices(conn)

    this.#log('info', 'choosing', { name: s.players[s.drawerId]?.name ?? '' })
    this.#broadcastState()
  }

  #sendChoices(connection: Connection) {
    const s = this.#state
    this.#send(connection, { t: 'choices', words: s.choices, canReroll: !s.rerolled })
  }

  async #reroll(playerId: string) {
    const s = this.#state
    if (s.phase !== 'choosing' || playerId !== s.drawerId || s.rerolled || s.pause) return

    s.choices = pickWords(s.language, WORD_CHOICES, [...s.usedWords, ...s.choices], s.customWords)
    s.rerolled = true
    await this.#save()
    for (const conn of this.#connectionsOf(playerId)) this.#sendChoices(conn)
  }

  async #chooseWord(playerId: string, index: unknown) {
    const s = this.#state
    if (s.phase !== 'choosing' || playerId !== s.drawerId || typeof index !== 'number') return
    const word = s.choices[index]
    if (word) await this.#beginDrawing(word)
  }

  async #beginDrawing(word: string) {
    const s = this.#state
    if (!s.drawerId) return

    s.phase = 'drawing'
    s.word = word
    s.choices = []
    s.revealed = []
    s.usedWords.push(word)
    s.endsAt = Date.now() + this.#drawMs()

    await this.#armRound()
    await this.#save()

    const hint = maskWord(word)
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
        word,
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
      .filter(p => this.#isActive(p) && p!.id !== s.drawerId)

    if (guessers.length > 0 && guessers.every(p => p!.guessed))
      await this.#endRound()
  }

  async #endRound() {
    const s = this.#state
    const word = s.word ?? ''
    const likes = Object.values(s.reactions).filter(r => r === 'like').length
    if (s.drawerId && likes > (s.stats.mostLiked?.likes ?? 0))
      s.stats.mostLiked = { playerId: s.drawerId, likes }

    s.phase = 'intermission'
    s.endsAt = Date.now() + INTERMISSION_MS
    s.word = null
    s.revealed = []
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
    s.choices = []
    s.endsAt = null
    s.pauseVotes = []
    s.pause = null
    s.pausedMs = null
    await this.#clearAlarm()
    await this.#save()

    const [winner, runnerUp] = standings(this.#listed())
    const points = Math.round(winner?.points ?? 0)
    if (winner && runnerUp && Math.round(runnerUp.points) === points)
      this.#log('success', 'winnerByAHair', { name: winner.name, points, other: runnerUp.name })
    else if (winner)
      this.#log('success', 'winner', { name: winner.name, points })
    else
      this.#log('success', 'gameOver')
    this.#broadcastState()
  }

  async onAlarm() {
    const s = this.#state
    const now = Date.now()

    if (s.emptySince !== null && now >= s.emptySince + ROOM_RETENTION_MS) {
      await this.#wipe()
      return
    }

    const expired = Object.values(s.players)
      .filter(p => p.awaySince !== undefined && now >= p.awaySince + AWAY_GRACE_MS)
    for (const player of expired) await this.#leave(player)
    if (expired.length) {
      await this.#save()
      this.#broadcastState()
    }

    if (!s.alarmKind || (s.alarmAt ?? 0) > now) {
      await this.#scheduleAlarm()
      return
    }
    const kind = s.alarmKind
    s.alarmKind = null
    s.alarmAt = null

    switch (kind) {
      case 'choose': {
        const drawer = s.drawerId ? s.players[s.drawerId] : null
        if (this.#isActive(drawer) && s.choices.length) {
          await this.#beginDrawing(s.choices[Math.floor(Math.random() * s.choices.length)]!)
          break
        }
        this.#log('warning', 'drawerGone')
        await this.#startTurn()
        break
      }
      case 'round':
        if (s.endsAt && s.endsAt > Date.now()) {
          const revealed = this.#revealDueHints()
          await this.#armRound()
          await this.#save()
          if (revealed) this.#broadcastState()
          break
        }
        this.#log('warning', 'timeUp')
        await this.#endRound()
        break
      case 'grace':
        this.#log('warning', 'drawerGone')
        await this.#endRound()
        break
      case 'intermission':
        await this.#startTurn()
        break
      default:
        await this.#save()
    }
    await this.#scheduleAlarm()
  }
}
