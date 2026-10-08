import type { Connection, WSMessage } from 'partyserver'
import type { Room } from '#realtime/room/context'
import type { StoredPlayer } from '#realtime/room/state'
import type { ClientMessage, DrawingMessage, RoomSettings, ServerMessage } from '#shared/utils/protocol'
import { voteKick } from '#realtime/room/kick'
import { votePause } from '#realtime/room/pause'
import { sendCustomWords } from '#realtime/room/presence'
import { chooseWord, endRoundIfEveryoneGuessed, reroll, startGame } from '#realtime/room/round'
import { drawMs, isActive, playerIdOf, remainingMs } from '#realtime/room/state'
import { drawerShare, guessPoints } from '#realtime/scoring'
import {
  clampSetting,
  cleanCustomWords,
  DRAW_TIME,
  editDistance,
  HINTS,
  isColorLimit,
  isDrawingMessage,
  isLanguage,
  LANGUAGES,
  normalizeGuess,
  ROUNDS,
} from '#shared/utils/protocol'
import { sanitizeSvg } from '#shared/utils/svg'

/** Edit distance at which a guess earns a private "you're close" nudge. */
const NEAR_MISS_DISTANCE = 2

/** Longest cached canvas, in characters; storage caps a value at 2 MB. */
const MAX_CANVAS_LENGTH = 1_000_000

type Handler<T extends ClientMessage['t']>
  = (room: Room, connection: Connection, playerId: string, msg: Extract<ClientMessage, { t: T }>) => unknown

type Handlers = { [T in ClientMessage['t']]?: Handler<T> }

/** Messages a player can only send so often, and which limit each one draws on. */
const LIMITS: Partial<Record<ClientMessage['t'], 'text' | 'action'>> = {
  guess: 'text',
  chat: 'text',
  start: 'action',
  settings: 'action',
  pause: 'action',
  react: 'action',
  kick: 'action',
}

const HANDLERS: Handlers = {
  start: (room, _, playerId) => canConfigure(room, playerId) && startGame(room),
  settings: (room, _, playerId, msg) => configure(room, playerId, msg.settings),
  pause: (room, _, playerId, msg) => votePause(room, playerId, msg.want),
  choose: (room, _, playerId, msg) => chooseWord(room, playerId, msg.index),
  reroll: (room, _, playerId) => reroll(room, playerId),
  react: (room, _, playerId, msg) => react(room, playerId, msg.reaction),
  kick: (room, _, playerId, msg) => voteKick(room, playerId, msg.target, msg.want),
  guess: (room, connection, playerId, msg) => handleGuess(room, connection, playerId, msg.text),
  chat: (room, _, playerId, msg) => handleChat(room, playerId, msg.text),
}

function parse(message: WSMessage): ClientMessage | null {
  try {
    const msg: unknown = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message))
    return typeof msg === 'object' && msg !== null ? msg as ClientMessage : null
  } catch {
    return null
  }
}

export async function handleMessage(room: Room, connection: Connection, message: WSMessage) {
  const playerId = playerIdOf(connection)
  const msg = playerId && parse(message)
  if (!playerId || !msg) return

  if (isDrawingMessage(msg)) {
    const s = room.state
    if (playerId === s.drawerId && s.phase === 'drawing' && !s.pause) handleDrawing(room, connection, msg)
    return
  }

  const limit = LIMITS[msg.t]
  if (limit && !room.allow(limit, playerId)) {
    if (limit === 'text') room.send(connection, { t: 'log', level: 'warning', key: 'slowDown' })
    return
  }

  const handler = HANDLERS[msg.t] as Handler<ClientMessage['t']> | undefined
  await handler?.(room, connection, playerId, msg)
}

function handleDrawing(room: Room, connection: Connection, raw: DrawingMessage) {
  let msg = raw
  if (msg.t === 'preview' || msg.t === 'commit' || msg.t === 'canvas') {
    const svg = sanitizeSvg(msg.svg)
    if (svg === null) return
    msg = { ...msg, svg }
  }

  if (msg.t === 'commit' || msg.t === 'canvas') {
    const canvas = msg.t === 'commit' ? room.canvas + msg.svg : msg.svg
    if (canvas.length > MAX_CANVAS_LENGTH) {
      room.broadcast({ t: 'canvas', svg: room.canvas })
      room.send(connection, { t: 'log', level: 'warning', key: 'canvasFull' })
      return
    }
    room.canvas = canvas
    room.saveCanvas()
  }
  room.broadcast(msg, [connection.id])
}

function canConfigure(room: Room, playerId: string) {
  const s = room.state
  return playerId === s.hostId && (s.phase === 'lobby' || s.phase === 'finished')
}

async function configure(room: Room, playerId: string, settings: Partial<RoomSettings> | undefined) {
  const s = room.state
  if (!canConfigure(room, playerId) || typeof settings !== 'object' || settings === null) return

  const languageChanged = isLanguage(settings.language) && settings.language !== s.language
  if (languageChanged) s.language = settings.language!
  s.drawTime = clampSetting(settings.drawTime, DRAW_TIME) ?? s.drawTime
  s.totalRounds = clampSetting(settings.totalRounds, ROUNDS) ?? s.totalRounds
  s.hints = clampSetting(settings.hints, HINTS) ?? s.hints
  if (Array.isArray(settings.customWords)) s.customWords = cleanCustomWords(settings.customWords)
  for (const key of ['public', 'noUndo', 'noEraser', 'chaos'] as const) {
    const value = settings[key]
    if (typeof value === 'boolean') s[key] = value
  }
  if (isColorLimit(settings.colorLimit)) s.colorLimit = settings.colorLimit

  await room.save()
  if (languageChanged) room.log('info', 'languageChanged', { language: LANGUAGES[s.language] })
  room.broadcastState()
  sendCustomWords(room)
}

/** Credit a correct guess to the guesser and the drawer. */
function scoreGuess(room: Room, player: StoredPlayer) {
  const s = room.state
  const others = Object.values(s.players).filter(p => p.id !== s.drawerId)
  const rank = others.filter(p => p.guessed).length
  const guessers = others.filter(p => isActive(p)).length
  player.guessed = true

  const remaining = remainingMs(s)
  const points = guessPoints(remaining, drawMs(s), rank)
  player.points += points

  const drawer = s.drawerId ? s.players[s.drawerId] : null
  if (drawer) {
    drawer.points += drawerShare(points, rank, guessers)
    s.stats.guessedOn[drawer.id] = (s.stats.guessedOn[drawer.id] ?? 0) + 1
  }

  const ms = drawMs(s) - remaining
  if (!s.stats.fastest || ms < s.stats.fastest.ms) s.stats.fastest = { playerId: player.id, ms }
}

/** Share a wrong guess, nudging its author privately when it was close. */
async function missGuess(room: Room, connection: Connection, player: StoredPlayer, text: string, answer: string) {
  const s = room.state
  room.broadcast({ t: 'chat', sender: player.name, text })
  if (!answer || editDistance(normalizeGuess(text), answer, NEAR_MISS_DISTANCE) > NEAR_MISS_DISTANCE) return

  room.send(connection, { t: 'log', level: 'warning', key: 'close', params: { text } })
  s.stats.closeGuesses[player.id] = (s.stats.closeGuesses[player.id] ?? 0) + 1
  await room.save()
}

async function handleGuess(room: Room, connection: Connection, playerId: string, rawText: unknown) {
  const s = room.state
  const player = s.players[playerId]
  const text = typeof rawText === 'string' ? rawText.slice(0, 120).trim() : ''
  if (!player || !text) return

  if (s.phase !== 'drawing' || playerId === s.drawerId || player.guessed) return handleChat(room, playerId, text)

  const answer = normalizeGuess(s.word ?? '')
  const correct = Boolean(answer) && normalizeGuess(text) === answer

  if (s.pause) {
    if (correct) room.send(connection, { t: 'log', level: 'warning', key: 'guessOnHold' })
    else room.broadcast({ t: 'chat', sender: player.name, text })
    return
  }

  if (!correct) return missGuess(room, connection, player, text, answer)

  scoreGuess(room, player)
  room.log('success', 'guessed', { name: player.name })
  await room.save()
  room.broadcastState()
  await endRoundIfEveryoneGuessed(room)
}

function handleChat(room: Room, playerId: string, rawText: unknown) {
  const s = room.state
  const player = s.players[playerId]
  const text = typeof rawText === 'string' ? rawText.slice(0, 200).trim() : ''
  if (!player || !text) return

  if (s.phase !== 'drawing') {
    room.broadcast({ t: 'chat', sender: player.name, text })
    return
  }

  const payload = JSON.stringify({ t: 'chat', sender: player.name, text, private: true } satisfies ServerMessage)
  for (const conn of room.connections()) {
    const id = playerIdOf(conn)
    if (id && (s.players[id]?.guessed || id === s.drawerId)) conn.send(payload)
  }
}

async function react(room: Room, playerId: string, reaction: unknown) {
  const s = room.state
  const voting = s.phase === 'drawing' || s.phase === 'intermission'
  if (!voting || !s.reactionsFor || playerId === s.reactionsFor || !s.players[playerId]) return

  if (reaction === 'like' || reaction === 'dislike') s.reactions[playerId] = reaction
  else if (reaction === null) delete s.reactions[playerId]
  else return

  await room.save()
  room.broadcastState()
}
