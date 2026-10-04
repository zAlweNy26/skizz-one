import type { Room } from '#realtime/room/context'
import type { StoredPlayer } from '#realtime/room/state'
import { closeKicked, leave } from '#realtime/room/presence'
import { endRound, endRoundIfEveryoneGuessed, startTurn } from '#realtime/room/round'
import { activeCount, isActive, kickVoters } from '#realtime/room/state'
import { kickVotesNeeded, MIN_PLAYERS_TO_VOTE_KICK } from '#shared/utils/protocol'

export async function voteKick(room: Room, playerId: string, target: unknown, want: unknown) {
  const s = room.state
  const player = s.players[target as string]
  if (typeof target !== 'string' || target === playerId || !player?.connected || !isActive(s.players[playerId]))
    return
  if (activeCount(s) < MIN_PLAYERS_TO_VOTE_KICK) return

  const votes = s.kickVotes[target] ?? []
  const has = votes.includes(playerId)
  if (want === true && !has) s.kickVotes[target] = [...votes, playerId]
  else if (want === false && has) s.kickVotes[target] = votes.filter(id => id !== playerId)
  else return

  const tally = kickVoters(s, target).length
  const needed = kickVotesNeeded(activeCount(s))
  if (want === true && tally >= needed) await kick(room, player)
  else if (want === true) {
    room.log('warning', 'kickRequested', {
      name: s.players[playerId]?.name ?? '',
      target: player.name,
      votes: tally,
      needed,
    })
  }

  await room.scheduleAlarm()
  await room.save()
  room.broadcastState()
}

/** Remove a player for good. The caller saves and broadcasts. */
async function kick(room: Room, player: StoredPlayer) {
  const s = room.state
  s.banned.push(player.id)
  delete s.reactions[player.id]
  for (const [target, voters] of Object.entries(s.kickVotes))
    s.kickVotes[target] = voters.filter(id => id !== player.id)
  for (const conn of room.connectionsOf(player.id)) closeKicked(room, conn)

  const wasDrawer = s.drawerId === player.id
  await leave(room, player, true)
  if (s.phase === 'finished' || s.phase === 'lobby') return

  if (wasDrawer) {
    s.pause = null
    s.pauseVotes = []
    if (s.phase === 'choosing') await startTurn(room)
    else if (s.phase === 'drawing') await endRound(room, 'drawerKicked')
  } else if (s.phase === 'drawing')
    await endRoundIfEveryoneGuessed(room)
}
