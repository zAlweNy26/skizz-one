import type { ClientMessage, GameState, LogKey, LogLevel, LogParams, ServerMessage } from '#shared/utils/protocol'
import { createEventHook, useDocumentVisibility, useIntervalFn, useLocalStorage, useTimeoutFn } from '@vueuse/core'
import PartySocket from 'partysocket'
import { randomUUID } from 'uncrypto'
import { KICKED_CLOSE_CODE, ROOM_FULL_CLOSE_CODE } from '#shared/utils/protocol'

/** A line in the chat panel. System lines keep their i18n key rather than text. */
export type ChatEntry
  = | { system: false, sender: string, text: string, private: boolean }
    | { system: true, level: LogLevel, key: LogKey | 'wordWas', params?: LogParams }

const PING_INTERVAL_MS = 25_000

/** How long a socket that looks open gets to answer after the page comes back before it's replaced. */
const WAKE_PROBE_MS = 3_000

export function useGameSocket(roomId: MaybeRefOrGetter<string>) {
  /** A player id that outlives the connection. */
  const playerId = useLocalStorage('playerId', () => randomUUID())
  const nickname = useNickname()
  /** Set by quick play: the room is created public if it doesn't exist yet. */
  const createPublic = useRoute().query.public === '1'

  const socket = shallowRef<PartySocket>()
  const connected = ref(false)
  const you = ref('')
  const state = ref<GameState | null>(null)
  const chat = ref<ChatEntry[]>([])
  /** The room voted you out; the socket stays closed. */
  const kicked = ref(false)
  /** A public room with no seat left turned you away; the socket stays closed. */
  const full = ref(false)

  /** The word — only ever populated when you are the drawer. */
  const word = ref<string | null>(null)
  const hint = ref('')
  const endsAt = ref<number | null>(null)
  /** Only the host is sent these; everyone else just sees a count. */
  const customWords = ref<string[]>([])
  /** Words on offer while you are the drawer choosing one. */
  const choices = ref<string[]>([])
  const canReroll = ref(false)

  const messageHook = createEventHook<ServerMessage>()

  const isDrawer = computed(() => Boolean(you.value) && state.value?.drawerId === you.value)
  const isHost = computed(() => Boolean(you.value) && state.value?.hostId === you.value)
  const players = computed(() => state.value?.players ?? [])
  const leaderboard = computed(() => players.value.toSorted((a, b) => a.rank - b.rank))
  /** Out of the guessing this turn. */
  const hasGuessed = computed(() => players.value.some(p => p.id === you.value && p.guessed))
  const paused = computed(() => state.value?.paused ?? false)
  const votedPause = computed(() => state.value?.pauseVotes.includes(you.value) ?? false)

  function send(msg: ClientMessage) {
    if (socket.value?.readyState === WebSocket.OPEN) socket.value.send(JSON.stringify(msg))
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
        if (msg.state.phase === 'drawing') hint.value = msg.state.hint
        break
      case 'state':
        state.value = msg.state
        endsAt.value = msg.state.endsAt
        if (msg.state.phase === 'drawing') hint.value = msg.state.hint
        if (msg.state.phase === 'choosing') {
          word.value = null
          hint.value = ''
        } else
          choices.value = []
        break
      case 'choices':
        choices.value = msg.words
        canReroll.value = msg.canReroll
        break
      case 'customWords':
        customWords.value = msg.words
        break
      case 'turn':
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
      case 'kicked':
        leave()
        break
      case 'roomFull':
        turnAway()
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

  const ping = useIntervalFn(() => send({ t: 'ping' }), PING_INTERVAL_MS, { immediate: false })

  const wakeProbe = useTimeoutFn(() => socket.value?.reconnect(), WAKE_PROBE_MS, { immediate: false })
  const visibility = useDocumentVisibility()
  watch(visibility, (now) => {
    const ws = socket.value
    if (now !== 'visible' || !ws) return
    if (ws.readyState !== WebSocket.OPEN) {
      ws.reconnect()
      return
    }
    send({ t: 'ping' })
    wakeProbe.start()
  })

  function open() {
    const room = toValue(roomId)
    if (!room) return

    const ws = new PartySocket({
      host: realtimeHost || window.location.host,
      protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
      party: 'game-room',
      room,
      query: () => ({ playerId: playerId.value, name: nickname.value, ...(createPublic ? { public: '1' } : {}) }),
    })

    ws.addEventListener('open', () => {
      connected.value = true
    })
    ws.addEventListener('close', (event: CloseEvent) => {
      connected.value = false
      if (event.code === KICKED_CLOSE_CODE) leave()
      else if (event.code === ROOM_FULL_CLOSE_CODE) turnAway()
    })
    ws.addEventListener('message', (event: MessageEvent) => {
      wakeProbe.stop()
      try {
        handle(JSON.parse(event.data as string) as ServerMessage)
      } catch {
        // Ignore unparseable frames.
      }
    })

    socket.value = ws
    ping.resume()
  }

  function leave() {
    kicked.value = true
    close()
  }

  function turnAway() {
    full.value = true
    close()
  }

  function close() {
    ping.pause()
    wakeProbe.stop()
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
    kicked,
    full,
    word,
    hint,
    endsAt,
    customWords,
    choices,
    canReroll,
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
