import type { Connection } from 'partyserver'
import type { Room } from '#realtime/room/context'
import type { AlarmKind } from '#realtime/room/state'
import type { TurnEnd } from '#shared/utils/stats'
import { activeCount, drawMs, emptyStats, isActive, listed, pruneDeparted, publicState, remainingMs, seated } from '#realtime/room/state'
import { standings } from '#realtime/scoring'
import { pickWords } from '#realtime/words'
import { drawTurnRules, hintBudget, hintRevealAt, maskWord, NO_RULES, WORD_CHOICES } from '#shared/utils/protocol'

/** Pause between the word reveal and the next turn. */
const INTERMISSION_MS = 5_000

/** How long the drawer has to pick a word before one is picked for them. */
const CHOOSE_MS = 15_000

const CHAOS_LOGS = { noUndo: 'chaosNoUndo', noEraser: 'chaosNoEraser', colors: 'chaosColors' } as const

export async function setAlarm(room: Room, kind: AlarmKind, ms: number) {
  room.state.alarmKind = kind
  room.state.alarmAt = Date.now() + ms
  await room.scheduleAlarm()
}

export async function clearAlarm(room: Room) {
  room.state.alarmKind = null
  room.state.alarmAt = null
  await room.scheduleAlarm()
}

/** Arm the drawing countdown for whichever comes first: the next hint or the end of the turn. */
export async function armRound(room: Room) {
  const s = room.state
  const total = drawMs(s)
  const remaining = remainingMs(s)
  const budget = s.word ? hintBudget(s.word, s.hints) : 0

  let wait = remaining
  if (s.revealed.length < budget) {
    const elapsed = total - remaining
    wait = Math.min(remaining, Math.max(0, hintRevealAt(s.revealed.length + 1, total, budget) - elapsed))
  }
  await setAlarm(room, 'round', wait)
}

/** Reveal a random hidden letter for every hint that has come due. */
function revealDueHints(room: Room) {
  const s = room.state
  if (!s.word) return false
  const total = drawMs(s)
  const elapsed = total - remainingMs(s)
  const budget = hintBudget(s.word, s.hints)

  let revealedAny = false
  while (s.revealed.length < budget && elapsed >= hintRevealAt(s.revealed.length + 1, total, budget)) {
    const hidden = [...s.word].flatMap((c, i) => (/\s/.test(c) || s.revealed.includes(i) ? [] : [i]))
    s.revealed.push(hidden[Math.floor(Math.random() * hidden.length)]!)
    revealedAny = true
  }
  return revealedAny
}

export async function startGame(room: Room) {
  const s = room.state
  const rematch = s.phase === 'finished'
  s.round = 0
  s.turnIndex = -1
  s.usedWords = []
  s.pauseVotes = []
  s.pause = null
  pruneDeparted(s)
  for (const p of Object.values(s.players)) p.points = 0
  s.stats = emptyStats()
  await startTurn(room)
  if (s.phase !== 'choosing') return

  s.gameStartedAt = Date.now()
  await room.save()
  room.track({
    event: 'game_started',
    language: s.language,
    public: s.public,
    rematch,
    players: activeCount(s),
    rounds: s.totalRounds,
    drawTime: s.drawTime,
  })
}

function nextDrawerIndex(room: Room): number | null {
  const s = room.state
  for (let step = 1; step <= s.order.length; step++) {
    const index = (s.turnIndex + step) % s.order.length
    const id = s.order[index]
    if (id && s.players[id]?.connected) return index
  }
  return null
}

async function waitForPlayers(room: Room) {
  const s = room.state
  s.phase = 'lobby'
  s.drawerId = null
  s.word = null
  s.choices = []
  s.endsAt = null
  await clearAlarm(room)
  s.pauseVotes = []
  await room.save()
  room.log('info', 'waitingForPlayers')
  room.broadcastState()
}

export async function startTurn(room: Room) {
  const s = room.state
  if (seated(s).length < 2) return waitForPlayers(room)

  const next = nextDrawerIndex(room)
  if (next === null) return

  const round = next <= s.turnIndex || s.turnIndex === -1 ? s.round + 1 : s.round
  if (round > s.totalRounds) return finishGame(room, true)

  s.round = round
  s.turnIndex = next
  s.drawerId = s.order[next]!
  s.phase = 'choosing'
  s.word = null
  s.choices = pickWords(s.language, WORD_CHOICES, s.usedWords, s.customWords)
  s.rerolled = false
  s.revealed = []
  s.rules = NO_RULES
  s.reactions = {}
  room.canvas = ''
  room.saveCanvas()
  s.pausedMs = null
  s.endsAt = Date.now() + CHOOSE_MS

  for (const p of Object.values(s.players)) p.guessed = false

  await setAlarm(room, 'choose', CHOOSE_MS)
  await room.save()

  room.broadcast({ t: 'canvas', svg: '' })
  for (const conn of room.connectionsOf(s.drawerId)) sendChoices(room, conn)

  room.log('info', 'choosing', { name: s.players[s.drawerId]?.name ?? '' })
  room.broadcastState()
}

export function sendChoices(room: Room, connection: Connection) {
  const s = room.state
  room.send(connection, { t: 'choices', words: s.choices, canReroll: !s.rerolled })
}

export async function reroll(room: Room, playerId: string) {
  const s = room.state
  if (s.phase !== 'choosing' || playerId !== s.drawerId || s.rerolled || s.pause) return

  s.choices = pickWords(s.language, WORD_CHOICES, [...s.usedWords, ...s.choices], s.customWords)
  s.rerolled = true
  await room.save()
  for (const conn of room.connectionsOf(playerId)) sendChoices(room, conn)
}

export async function chooseWord(room: Room, playerId: string, index: unknown) {
  const s = room.state
  if (s.phase !== 'choosing' || playerId !== s.drawerId || typeof index !== 'number') return
  const word = s.choices[index]
  if (word) await beginDrawing(room, word)
}

async function beginDrawing(room: Room, word: string) {
  const s = room.state
  if (!s.drawerId) return

  s.phase = 'drawing'
  s.word = word
  s.choices = []
  s.revealed = []
  const { rules, chaos } = drawTurnRules(s)
  s.rules = rules
  s.usedWords.push(word)
  s.endsAt = Date.now() + drawMs(s)

  await armRound(room)
  await room.save()

  const turn = { t: 'turn', drawerId: s.drawerId, round: s.round, endsAt: s.endsAt, hint: maskWord(word) } as const
  const drawerConnections = room.connectionsOf(s.drawerId)
  room.broadcast(turn, drawerConnections.map(c => c.id))
  for (const conn of drawerConnections) room.send(conn, { ...turn, word })

  room.log('info', 'drawing', { name: s.players[s.drawerId]?.name ?? '' })
  if (chaos) room.log('warning', CHAOS_LOGS[chaos], { n: rules.colors.length })
  room.broadcastState()
}

export async function endRoundIfEveryoneGuessed(room: Room) {
  const s = room.state
  if (s.phase !== 'drawing') return

  const guessers = s.order
    .map(id => s.players[id])
    .filter(p => isActive(p) && p!.id !== s.drawerId)

  if (guessers.length > 0 && guessers.every(p => p!.guessed))
    await endRound(room, 'guessed')
}

export async function endRound(room: Room, reason: TurnEnd) {
  const s = room.state
  const word = s.word ?? ''
  const remaining = s.endsAt === null ? (s.pausedMs ?? 0) : Math.max(0, s.endsAt - Date.now())
  room.track({
    event: 'turn_ended',
    language: s.language,
    reason,
    word,
    guessers: s.order.filter(id => id !== s.drawerId && s.players[id]?.connected).length,
    correct: Object.values(s.players).filter(p => p.guessed).length,
    ms: drawMs(s) - remaining,
  })
  const likes = Object.values(s.reactions).filter(r => r === 'like').length
  if (s.drawerId && likes > (s.stats.mostLiked?.likes ?? 0))
    s.stats.mostLiked = { playerId: s.drawerId, likes }

  s.phase = 'intermission'
  s.endsAt = Date.now() + INTERMISSION_MS
  s.word = null
  s.revealed = []
  s.drawerId = null
  s.pausedMs = null

  await setAlarm(room, 'intermission', INTERMISSION_MS)
  await room.save()

  room.broadcast({ t: 'roundEnd', word, state: publicState(s, room.name) })
}

export async function finishGame(room: Room, completed: boolean) {
  const s = room.state
  if (s.gameStartedAt !== null) {
    room.track({
      event: 'game_finished',
      language: s.language,
      completed,
      players: activeCount(s),
      rounds: completed ? s.totalRounds : s.round,
      ms: Date.now() - s.gameStartedAt,
    })
  }
  s.gameStartedAt = null
  s.phase = 'finished'
  s.drawerId = null
  s.word = null
  s.choices = []
  s.endsAt = null
  s.pauseVotes = []
  s.pause = null
  s.pausedMs = null
  await clearAlarm(room)
  await room.save()

  const [winner, runnerUp] = standings(listed(s))
  const points = Math.round(winner?.points ?? 0)
  if (winner && runnerUp && Math.round(runnerUp.points) === points)
    room.log('success', 'winnerByAHair', { name: winner.name, points, other: runnerUp.name })
  else if (winner)
    room.log('success', 'winner', { name: winner.name, points })
  else
    room.log('success', 'gameOver')
  room.broadcastState()
}

const COUNTDOWNS: Record<AlarmKind, (room: Room) => Promise<void>> = {
  async choose(room) {
    const s = room.state
    const drawer = s.drawerId ? s.players[s.drawerId] : null
    if (isActive(drawer) && s.choices.length) {
      await beginDrawing(room, s.choices[Math.floor(Math.random() * s.choices.length)]!)
      return
    }
    room.log('warning', 'drawerGone')
    await startTurn(room)
  },
  async round(room) {
    const s = room.state
    if (s.endsAt && s.endsAt > Date.now()) {
      const revealed = revealDueHints(room)
      await armRound(room)
      await room.save()
      if (revealed) room.broadcastState()
      return
    }
    room.log('warning', 'timeUp')
    await endRound(room, 'timeUp')
  },
  async grace(room) {
    room.log('warning', 'drawerGone')
    await endRound(room, 'drawerGone')
  },
  intermission: startTurn,
}

/** Run the game countdown if it is due. */
export async function runCountdown(room: Room) {
  const s = room.state
  if (!s.alarmKind || (s.alarmAt ?? 0) > Date.now()) return
  const kind = s.alarmKind
  s.alarmKind = null
  s.alarmAt = null
  await COUNTDOWNS[kind](room)
}
