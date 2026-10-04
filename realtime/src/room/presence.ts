import type { Connection } from 'partyserver'
import type { Room } from '#realtime/room/context'
import type { StoredPlayer } from '#realtime/room/state'
import type { RoundPhase } from '#shared/utils/protocol'
import { checkPauseVotes } from '#realtime/room/pause'
import { armRound, endRoundIfEveryoneGuessed, finishGame, sendChoices, setAlarm } from '#realtime/room/round'
import {
  drawMs,
  isActive,
  playerIdOf,
  pruneDeparted,
  publicState,
  remainingMs,
  seated,
  setPlayerId,
} from '#realtime/room/state'
import { maskProfanity } from '#shared/utils/profanity'
import {
  AWAY_GRACE_MS,
  DRAWER_GRACE_MS,
  isLanguage,
  KICKED_CLOSE_CODE,
  maskWord,
  MAX_AVATAR_LENGTH,
  MAX_NAME_LENGTH,
  OUTDATED_CLOSE_CODE,
  PROTOCOL_VERSION,
  PUBLIC_ROOM_CAP,
  ROOM_FULL_CLOSE_CODE,
} from '#shared/utils/protocol'

/** Longest secret a client may identify itself with. */
const MAX_TOKEN_LENGTH = 64

/** Hex characters of a player's public id. */
const PLAYER_ID_LENGTH = 32

const IN_GAME_PHASES: readonly RoundPhase[] = ['choosing', 'drawing', 'intermission']

/** The public id for a client's secret token in room `room`: the only id anyone else ever sees. */
export async function playerIdFor(room: string, url: URL) {
  const token = url.searchParams.get('token')
  if (!token || token.length > MAX_TOKEN_LENGTH) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${room}:${token}`))
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, PLAYER_ID_LENGTH)
}

/** Who a connecting socket says it is, or null without a token or a name. */
async function identify(room: string, url: URL) {
  const id = await playerIdFor(room, url)
  const name = maskProfanity((url.searchParams.get('name') ?? '').trim().slice(0, MAX_NAME_LENGTH).trim())
  const avatar = (url.searchParams.get('avatar') ?? '').trim().slice(0, MAX_AVATAR_LENGTH) || name
  return id && name ? { id, name, avatar } : null
}

export function closeKicked(room: Room, connection: Connection) {
  room.send(connection, { t: 'kicked' })
  connection.close(KICKED_CLOSE_CODE, 'kicked')
}

export function sendCustomWords(room: Room) {
  const s = room.state
  if (!s.hostId) return
  for (const conn of room.connectionsOf(s.hostId))
    room.send(conn, { t: 'customWords', words: s.customWords })
}

/** Give a newcomer a seat, or a returning player theirs back. True when they were already seated. */
function seat(room: Room, visitor: Pick<StoredPlayer, 'id' | 'name' | 'avatar'>, url: URL) {
  const s = room.state
  const existing = s.players[visitor.id]
  if (existing) {
    existing.connected = true
    existing.name = visitor.name
    existing.avatar = visitor.avatar
    delete existing.awaySince
  } else {
    if (s.order.length === 0) {
      if (url.searchParams.get('public') === '1') s.public = true
      const language = url.searchParams.get('lang')
      if (isLanguage(language)) s.language = language
    }
    s.players[visitor.id] = { ...visitor, points: 0, guessed: false, connected: true }
    s.order.push(visitor.id)
    room.log('info', 'joined', { name: visitor.name })
  }
  s.hostId ??= visitor.id
  s.emptySince = null
  return Boolean(existing)
}

/** Restart the turn of a drawer who made it back within their grace. */
async function resumeDrawer(room: Room, player: StoredPlayer) {
  const s = room.state
  if (s.drawerId !== player.id || s.alarmKind !== 'grace') return
  s.endsAt = Date.now() + (s.pausedMs ?? drawMs(s))
  s.pausedMs = null
  await armRound(room)
  room.log('success', 'reconnected', { name: player.name })
}

/** Send a freshly seated player what they missed: the room, the drawing and anything only they may see. */
function catchUp(room: Room, connection: Connection, playerId: string) {
  const s = room.state
  room.send(connection, { t: 'welcome', you: playerId, state: publicState(s, room.name) })
  if (room.canvas) room.send(connection, { t: 'canvas', svg: room.canvas })
  if (s.hostId === playerId) room.send(connection, { t: 'customWords', words: s.customWords })
  if (s.drawerId !== playerId) return

  if (s.word && s.phase === 'drawing') {
    room.send(connection, {
      t: 'turn',
      drawerId: playerId,
      round: s.round,
      endsAt: s.endsAt ?? Date.now(),
      hint: maskWord(s.word, s.revealed),
      word: s.word,
    })
  }
  if (s.phase === 'choosing') sendChoices(room, connection)
}

export async function connect(room: Room, connection: Connection, url: URL) {
  if (url.searchParams.get('v') !== String(PROTOCOL_VERSION)) {
    room.send(connection, { t: 'outdated' })
    connection.close(OUTDATED_CLOSE_CODE, 'outdated client')
    return
  }

  const visitor = await identify(room.name, url)
  if (!visitor) {
    connection.close(1008, 'token and name are required')
    return
  }

  const s = room.state
  if (s.banned.includes(visitor.id)) return closeKicked(room, connection)

  setPlayerId(connection, visitor.id)

  if (s.public && !s.players[visitor.id]?.connected && seated(s).length >= PUBLIC_ROOM_CAP) {
    room.send(connection, { t: 'roomFull' })
    connection.close(ROOM_FULL_CLOSE_CODE, 'room is full')
    return
  }

  if (seat(room, visitor, url)) await resumeDrawer(room, s.players[visitor.id]!)

  await room.scheduleAlarm()
  await room.save()
  catchUp(room, connection, visitor.id)
  room.broadcastState()
}

/** A socket closed: mark its player away once their last one is gone. */
export async function disconnect(room: Room, connection: Connection) {
  const playerId = playerIdOf(connection)
  if (!playerId) return

  const s = room.state
  const player = s.players[playerId]
  if (!player?.connected || player.awaySince !== undefined) return

  const stillOpen = room.connectionsOf(playerId)
    .some(c => c !== connection && c.readyState === WebSocket.OPEN)
  if (stillOpen) return

  player.awaySince = Date.now()
  s.pauseVotes = s.pauseVotes.filter(id => id !== playerId)

  if (!s.pause && s.phase === 'drawing') {
    if (s.drawerId === playerId) {
      s.pausedMs = remainingMs(s)
      s.endsAt = null
      await setAlarm(room, 'grace', DRAWER_GRACE_MS)
      room.log('warning', 'drawerDropped', { name: player.name })
    } else
      await endRoundIfEveryoneGuessed(room)
  }

  await checkPauseVotes(room)
  await room.scheduleAlarm()
  await room.save()
  room.broadcastState()
}

function handOverHost(room: Room, leaving: StoredPlayer, kicked: boolean) {
  const s = room.state
  const nextHost = s.order.find(id => isActive(s.players[id])) ?? seated(s)[0]
  s.hostId = nextHost ?? null
  if (!nextHost) return
  const host = s.players[nextHost]!.name
  if (kicked) room.log('info', 'newHost', { name: host })
  else room.log('warning', 'hostLeft', { name: leaving.name, host })
  sendCustomWords(room)
}

/** Free a player's seat once their away grace runs out or they are kicked. The caller saves and broadcasts. */
export async function leave(room: Room, player: StoredPlayer, kicked = false) {
  const s = room.state
  player.connected = false
  delete player.awaySince
  delete s.kickVotes[player.id]
  s.pauseVotes = s.pauseVotes.filter(id => id !== player.id)
  room.forgetLimits(player.id)

  if (kicked) room.log('warning', 'kicked', { name: player.name })

  if (s.hostId === player.id) handOverHost(room, player, kicked)
  else if (!kicked) room.log('info', 'disconnected', { name: player.name })

  if (!seated(s).length) s.emptySince = Date.now()
  if (s.phase === 'lobby') pruneDeparted(s)

  if (IN_GAME_PHASES.includes(s.phase) && seated(s).length < 2) {
    await finishGame(room, false)
    return
  }

  await checkPauseVotes(room)
}

/** Free the seats of players whose away grace has run out. */
export async function expireAway(room: Room) {
  const now = Date.now()
  const expired = Object.values(room.state.players)
    .filter(p => p.awaySince !== undefined && now >= p.awaySince + AWAY_GRACE_MS)
  for (const player of expired) await leave(room, player)
  if (!expired.length) return
  await room.save()
  room.broadcastState()
}
