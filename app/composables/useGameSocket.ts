import type { ClientMessage, GameState, LogLevel, ServerMessage } from '#shared/utils/protocol'
import { createEventHook, useLocalStorage } from '@vueuse/core'
import PartySocket from 'partysocket'
import { pascalCase } from 'scule'
import { randomUUID } from 'uncrypto'
import { adjectives, animals, colors, uniqueNamesGenerator } from 'unique-names-generator'

export interface ChatEntry {
  sender: string
  text: string
  level?: LogLevel
  system: boolean
  private: boolean
}

/** Keep the socket alive through idle proxies. */
const PING_INTERVAL_MS = 25_000

/**
 * The room connection.
 *
 * `partysocket` ships a React binding only, so the class is wrapped here.
 * It brings its own reconnect with backoff, which is why the old VueUse
 * `useWebSocket` heartbeat is gone.
 */
export function useGameSocket(roomId: MaybeRefOrGetter<string>) {
  /**
   * A player id that outlives the connection.
   *
   * `peer.id` used to be the identity, but it is regenerated per connection,
   * so a refresh mid-round lost your score and your turn. This does not.
   */
  const playerId = useLocalStorage('playerId', () => randomUUID())
  const nickname = useLocalStorage('nickname', () => pascalCase(uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: '-',
    length: 2,
  })))

  const socket = shallowRef<PartySocket>()
  const connected = ref(false)
  const you = ref('')
  const state = ref<GameState | null>(null)
  const chat = ref<ChatEntry[]>([])

  /** The word — only ever populated when you are the drawer. */
  const word = ref<string | null>(null)
  const hint = ref('')
  const endsAt = ref<number | null>(null)

  /** Raw stream, consumed by the drawing bridge. */
  const messageHook = createEventHook<ServerMessage>()

  const isDrawer = computed(() => Boolean(you.value) && state.value?.drawerId === you.value)
  const isHost = computed(() => Boolean(you.value) && state.value?.hostId === you.value)
  const players = computed(() => state.value?.players ?? [])
  const leaderboard = computed(() => players.value.toSorted((a, b) => b.points - a.points))

  function send(msg: ClientMessage) {
    const ws = socket.value
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(msg))
  }

  function pushSystem(level: LogLevel, text: string) {
    chat.value.push({ sender: 'system', text, level, system: true, private: false })
  }

  function handle(msg: ServerMessage) {
    switch (msg.t) {
      case 'welcome':
        you.value = msg.you
        state.value = msg.state
        break
      case 'state':
        state.value = msg.state
        break
      case 'turn':
        // `word` is present only in the drawer's copy.
        word.value = msg.word ?? null
        hint.value = msg.hint
        endsAt.value = msg.endsAt
        break
      case 'roundEnd':
        state.value = msg.state
        word.value = null
        hint.value = msg.word
        endsAt.value = msg.state.endsAt
        pushSystem('info', `The word was "${msg.word}"`)
        break
      case 'log':
        pushSystem(msg.level, msg.message)
        break
      case 'chat':
        chat.value.push({
          sender: msg.sender,
          text: msg.text,
          system: false,
          private: msg.private ?? false,
        })
        break
    }

    messageHook.trigger(msg)
  }

  let pingTimer: ReturnType<typeof setInterval> | undefined

  function open() {
    const room = toValue(roomId)
    if (!room) return

    const ws = new PartySocket({
      // Same origin: the Nuxt worker proxies /parties/* to skizz-realtime
      // through a service binding, so there is no cross-origin handshake.
      host: window.location.host,
      protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
      party: 'game-room',
      room,
      query: () => ({ playerId: playerId.value, name: nickname.value }),
    })

    ws.addEventListener('open', () => {
      connected.value = true
    })
    ws.addEventListener('close', () => {
      connected.value = false
    })
    ws.addEventListener('message', (event: MessageEvent) => {
      try {
        handle(JSON.parse(event.data as string) as ServerMessage)
      }
      catch {
        // A frame we can't parse is not worth tearing the room down for.
      }
    })

    socket.value = ws
    pingTimer = setInterval(send, PING_INTERVAL_MS, { t: 'ping' })
  }

  function close() {
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = undefined
    socket.value?.close()
    socket.value = undefined
    connected.value = false
  }

  onMounted(open)
  onScopeDispose(close)

  return {
    socket,
    connected,
    playerId,
    nickname,
    you,
    state,
    chat,
    word,
    hint,
    endsAt,
    players,
    leaderboard,
    isDrawer,
    isHost,
    send,
    onMessage: messageHook.on,
    close,
  }
}
