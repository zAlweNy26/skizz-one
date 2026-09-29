import type { PublicRoom } from '#shared/utils/protocol'
import { PUBLIC_ROOM_CAP } from '#shared/utils/protocol'

/** The room quick play drops you into: one still in its lobby first, then the fullest that has space. */
export function pickQuickPlayRoom(rooms: readonly PublicRoom[], language?: string) {
  const open = rooms.filter(r => r.players < PUBLIC_ROOM_CAP && r.phase !== 'finished')
  const score = (r: PublicRoom) => (r.phase === 'lobby' ? 2 : 0) + (r.language === language ? 1 : 0)
  return open.toSorted((a, b) => score(b) - score(a) || b.players - a.players)[0] ?? null
}
