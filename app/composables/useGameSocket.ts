import type { ClientMessage, GameState, LogKey, LogLevel, LogParams, ServerMessage } from '#shared/utils/protocol'
import { createEventHook, useLocalStorage } from '@vueuse/core'
import PartySocket from 'partysocket'
import { randomUUID } from 'uncrypto'

/**
 * A line in the chat panel.
 *
 * System lines keep their key rather than text, so they render in the
 * viewer's own UI language, and re-render if it changes.
 */
export type ChatEntry
  = | { system: false, sender: string, text: string, private: boolean }
    | { system: true, level: LogLevel, key: LogKey | 'wordWas', params?: LogParams }

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
  const nickname = useNickname()

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
  /** Out of the guessing this turn, so chat goes to the private channel. */
  const hasGuessed = computed(() => players.value.some(p => p.id === you.value && p.guessed))
  const paused = computed(() => state.value?.paused ?? false)
  const votedPause = computed(() => state.value?.pauseVotes.includes(you.value) ?? false)

  function send(msg: ClientMessage) {
    const ws = socket.value
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(msg))
  }

  function pushSystem(level: LogLevel, key: LogKey | 'wordWas', params?: LogParams) {
    chat.value.push({ system: true, level, key, params })
  }

  function handle(msg: ServerMessage) {
    switch (msg.t) {
      case 'welcome':
        you.value = msg.you
        state.value = msg.state
        endsAt.value = msg.state.endsAt
        break
      case 'state':
        state.value = msg.state
        // A pause freezes the countdown and a resume moves it, both without
        // a new turn, so the state is what keeps the timer honest.
        endsAt.value = msg.state.endsAt
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
        pushSystem('info', 'wordWas', { word: msg.word })
        break
      case 'log':
        pushSystem(msg.level, msg.key, msg.params)
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

  const realtimeHost = useRuntimeConfig().public.realtimeHost as string

  let pingTimer: ReturnType<typeof setInterval> | undefined

  function open() {
    const room = toValue(roomId)
    if (!room) return

    const ws = new PartySocket({
      // Same origin in production: the Nuxt worker proxies /parties/* to
      // skizz-realtime through a service binding. In dev there is no such
      // proxy, so `realtimeHost` points at the local `wrangler dev` instead.
      host: realtimeHost || window.location.host,
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
      } catch {
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
    hasGuessed,
    paused,
    votedPause,
    send,
    onMessage: messageHook.on,
    close,
  }
}
