import type { PublicRoom } from '../../shared/utils/protocol'
import { describe, expect, it } from 'vitest'
import { pickQuickPlayRoom } from '../../app/utils/quickPlay'
import { PUBLIC_ROOM_CAP } from '../../shared/utils/protocol'

function room(id: string, extra: Partial<PublicRoom> = {}): PublicRoom {
  return { id, hostName: id, players: 2, language: 'en', phase: 'lobby', round: 0, totalRounds: 3, ...extra }
}

describe('pickQuickPlayRoom', () => {
  it('prefers a room that has not started', () => {
    const picked = pickQuickPlayRoom([room('playing', { phase: 'drawing', players: 6 }), room('waiting')])
    expect(picked?.id).toBe('waiting')
  })

  it('prefers the fullest of equal rooms', () => {
    expect(pickQuickPlayRoom([room('a', { players: 2 }), room('b', { players: 5 })])?.id).toBe('b')
  })

  it('prefers your language among rooms still waiting', () => {
    const picked = pickQuickPlayRoom([room('en', { players: 6 }), room('it', { language: 'it' })], 'it')
    expect(picked?.id).toBe('it')
  })

  it('skips full and finished rooms', () => {
    const rooms = [room('full', { players: PUBLIC_ROOM_CAP }), room('done', { phase: 'finished' })]
    expect(pickQuickPlayRoom(rooms)).toBeNull()
  })
})
