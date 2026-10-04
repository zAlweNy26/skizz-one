import type { PublicRoom } from '#shared/utils/protocol'
import { describe, expect, it, vi } from 'vitest'
import { PUBLIC_ROOM_CAP } from '#shared/utils/protocol'
import { pickQuickPlayRoom } from '~/utils/game'

function room(id: string, extra: Partial<PublicRoom> = {}): PublicRoom {
  return { id, hostName: id, players: 2, language: 'en', phase: 'lobby', round: 0, totalRounds: 3, ...extra }
}

describe('pickQuickPlayRoom', () => {
  it('picks any open room at random', () => {
    const rooms = [room('waiting'), room('playing', { phase: 'drawing' })]
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99)
    expect(pickQuickPlayRoom(rooms)?.id).toBe('waiting')
    expect(pickQuickPlayRoom(rooms)?.id).toBe('playing')
  })

  it('skips full and finished rooms', () => {
    const rooms = [room('full', { players: PUBLIC_ROOM_CAP }), room('done', { phase: 'finished' })]
    expect(pickQuickPlayRoom(rooms)).toBeNull()
  })
})
