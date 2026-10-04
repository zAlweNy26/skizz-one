import type { GameState, ServerMessage } from '#shared/utils/protocol'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { KICKED_CLOSE_CODE, OUTDATED_CLOSE_CODE, PROTOCOL_VERSION, ROOM_FULL_CLOSE_CODE } from '#shared/utils/protocol'

const sockets = vi.hoisted(() => [] as {
  options: { query: () => Record<string, string>, room: string, party: string }
  sent: string[]
  closed: boolean
  readyState: number
  emit: (type: string, event: object) => void
}[])

vi.mock('partysocket', () => ({
  default: class {
    readyState = 1
    sent: string[] = []
    closed = false
    #listeners = new Map<string, ((event: object) => void)[]>()

    constructor(readonly options: never) {
      sockets.push(this as never)
    }

    addEventListener(type: string, listener: (event: object) => void) {
      this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener])
    }

    emit(type: string, event: object) {
      for (const listener of this.#listeners.get(type) ?? []) listener(event)
    }

    send(data: string) {
      this.sent.push(data)
    }

    close() {
      this.closed = true
    }

    reconnect() {}
  },
}))

const mounted: { unmount: () => void }[] = []

async function setup() {
  let game!: ReturnType<typeof useGameSocket>
  const wrapper = await mountSuspended(defineComponent({
    setup() {
      game = useGameSocket('abcd1234')
      return () => h('div')
    },
  }))
  mounted.push(wrapper)
  const socket = sockets.at(-1)!
  const receive = (msg: ServerMessage) => socket.emit('message', { data: JSON.stringify(msg) })
  return { game, socket, receive }
}

function roomState(extra: Partial<GameState> = {}): GameState {
  return {
    id: 'abcd1234',
    phase: 'lobby',
    round: 0,
    totalRounds: 3,
    language: 'en',
    drawTime: 80,
    hints: 2,
    customWordCount: 0,
    hostId: null,
    drawerId: null,
    endsAt: null,
    hint: '',
    players: [],
    paused: false,
    pauseVotes: [],
    remainingMs: null,
    reactions: {},
    kickVotes: {},
    awards: [],
    public: false,
    noUndo: false,
    noEraser: false,
    colorLimit: 0,
    chaos: false,
    rules: { noUndo: false, noEraser: false, colors: [] },
    ...extra,
  }
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  sockets.length = 0
})

describe('useGameSocket', () => {
  it('opens the room\'s socket with the protocol version, token and name', async () => {
    useNickname().value = 'Alice'
    const { socket } = await setup()
    expect(socket.options).toMatchObject({ party: 'game-room', room: 'abcd1234' })
    const query = socket.options.query()
    expect(query).toMatchObject({ v: String(PROTOCOL_VERSION), name: 'Alice' })
    expect(query.token).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('takes the welcome, then follows the room', async () => {
    const { game, receive } = await setup()
    receive({ t: 'welcome', you: 'me', state: roomState({ hostId: 'me' }) })
    expect(game.you.value).toBe('me')
    expect(game.isHost.value).toBe(true)

    receive({ t: 'state', state: roomState({ phase: 'drawing', drawerId: 'me', hint: '___', endsAt: 5 }) })
    expect(game.isDrawer.value).toBe(true)
    expect(game.hint.value).toBe('___')
    expect(game.endsAt.value).toBe(5)
  })

  it('keeps the word for the drawer only until the turn ends', async () => {
    const { game, receive } = await setup()
    receive({ t: 'turn', drawerId: 'me', round: 1, endsAt: 9, hint: '___', word: 'cat' })
    expect(game.word.value).toBe('cat')

    receive({ t: 'roundEnd', word: 'cat', state: roomState({ phase: 'intermission' }) })
    expect(game.word.value).toBeNull()
    expect(game.hint.value).toBe('cat')
    expect(game.chat.value.at(-1)).toEqual({ system: true, level: 'info', key: 'wordWas', params: { word: 'cat' } })
  })

  it('collects chat lines, announcements, choices and custom words', async () => {
    const { game, receive } = await setup()
    receive({ t: 'chat', sender: 'Bob', text: 'hi' })
    receive({ t: 'chat', sender: 'Bob', text: 'psst', private: true })
    receive({ t: 'log', level: 'success', key: 'guessed', params: { name: 'Bob' } })
    receive({ t: 'choices', words: ['a', 'b', 'c'], canReroll: true })
    receive({ t: 'customWords', words: ['zeppelin'] })

    expect(game.chat.value).toEqual([
      { system: false, sender: 'Bob', text: 'hi', private: false },
      { system: false, sender: 'Bob', text: 'psst', private: true },
      { system: true, level: 'success', key: 'guessed', params: { name: 'Bob' } },
    ])
    expect(game.choices.value).toEqual(['a', 'b', 'c'])
    expect(game.canReroll.value).toBe(true)
    expect(game.customWords.value).toEqual(['zeppelin'])
  })

  it('hands every message to its listeners and ignores frames it can\'t read', async () => {
    const { game, socket, receive } = await setup()
    const heard: string[] = []
    game.onMessage(msg => heard.push(msg.t))
    socket.emit('message', { data: 'not json' })
    receive({ t: 'pong' })
    expect(heard).toEqual(['pong'])
  })

  it('sends only while the socket is open', async () => {
    const { game, socket } = await setup()
    game.send({ t: 'guess', text: 'cat' })
    socket.readyState = 3
    game.send({ t: 'guess', text: 'dog' })
    expect(socket.sent).toEqual([JSON.stringify({ t: 'guess', text: 'cat' })])
  })

  it.each([
    ['kicked', KICKED_CLOSE_CODE],
    ['full', ROOM_FULL_CLOSE_CODE],
    ['outdated', OUTDATED_CLOSE_CODE],
  ] as const)('stays closed once %s', async (flag, code) => {
    const { game, socket } = await setup()
    socket.emit('open', {})
    expect(game.connected.value).toBe(true)
    socket.emit('close', { code })
    expect(game[flag].value).toBe(true)
    expect(game.connected.value).toBe(false)
    expect(socket.closed).toBe(true)
  })

  it('stays closed when told so in a message too', async () => {
    const { game, socket, receive } = await setup()
    receive({ t: 'outdated' })
    expect(game.outdated.value).toBe(true)
    expect(socket.closed).toBe(true)
  })
})
