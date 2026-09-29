import type { LobbyMessage, PublicRoom } from '#shared/utils/protocol'
import PartySocket from 'partysocket'

/** The live list of public rooms. */
export function useLobby() {
  const rooms = ref<PublicRoom[]>([])
  const ready = ref(false)
  const realtimeHost = useRuntimeConfig().public.realtimeHost as string

  let socket: PartySocket | undefined

  onMounted(() => {
    socket = new PartySocket({
      host: realtimeHost || window.location.host,
      protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
      party: 'lobby',
      room: 'global',
    })
    socket.addEventListener('message', (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as LobbyMessage
        if (msg.t !== 'rooms') return
        rooms.value = msg.rooms
        ready.value = true
      } catch {
        // Ignore unparseable frames.
      }
    })
  })

  onScopeDispose(() => socket?.close())

  return { rooms, ready }
}
