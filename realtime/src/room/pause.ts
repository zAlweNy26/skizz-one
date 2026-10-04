import type { Room } from '#realtime/room/context'
import { armRound, clearAlarm, endRoundIfEveryoneGuessed, setAlarm } from '#realtime/room/round'
import { activeCount, isActive, pauseVoters, remainingMs } from '#realtime/room/state'
import { DRAWER_GRACE_MS, PAUSABLE_PHASES, votesNeeded } from '#shared/utils/protocol'

export async function votePause(room: Room, playerId: string, want: unknown) {
  const s = room.state
  if (!PAUSABLE_PHASES.includes(s.phase) || s.alarmKind === 'grace') return

  const has = s.pauseVotes.includes(playerId)
  if (want === true && !has) s.pauseVotes.push(playerId)
  else if (want === false && has) s.pauseVotes = s.pauseVotes.filter(id => id !== playerId)
  else return

  const wasPaused = s.pause !== null
  await checkPauseVotes(room)
  if (want === true && (s.pause !== null) === wasPaused) {
    room.log('warning', wasPaused ? 'resumeRequested' : 'pauseRequested', {
      name: s.players[playerId]?.name ?? '',
      votes: pauseVoters(s).length,
      needed: votesNeeded(activeCount(s), wasPaused),
    })
  }
  await room.save()
  room.broadcastState()
}

/** Flip the pause if the votes are there. The caller saves and broadcasts. */
export async function checkPauseVotes(room: Room) {
  const s = room.state
  const votes = pauseVoters(s).length
  if (votes === 0 || votes < votesNeeded(activeCount(s), s.pause !== null)) return

  s.pauseVotes = []
  if (s.pause) await resumeCountdown(room)
  else await pauseCountdown(room)
}

async function pauseCountdown(room: Room) {
  const s = room.state
  if (!s.alarmKind || !PAUSABLE_PHASES.includes(s.phase)) return

  s.pause = { kind: s.alarmKind, remainingMs: remainingMs(s) }
  s.endsAt = null
  await clearAlarm(room)
  room.log('warning', 'paused')
}

async function resumeCountdown(room: Room) {
  const s = room.state
  const pause = s.pause
  if (!pause) return
  s.pause = null
  room.log('warning', 'resumed')

  const drawer = s.drawerId ? s.players[s.drawerId] : null
  if (s.phase === 'drawing' && drawer && !isActive(drawer)) {
    s.pausedMs = pause.remainingMs
    await setAlarm(room, 'grace', DRAWER_GRACE_MS)
    room.log('warning', 'drawerDropped', { name: drawer.name })
    return
  }

  s.endsAt = Date.now() + pause.remainingMs
  if (pause.kind === 'round') await armRound(room)
  else await setAlarm(room, pause.kind, pause.remainingMs)

  if (s.phase === 'drawing') await endRoundIfEveryoneGuessed(room)
}
