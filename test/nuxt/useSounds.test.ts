import type { GameState, ServerMessage } from '#shared/utils/protocol'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createEventHook } from '@vueuse/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

let played: { url: string, volume: number }[] = []
let contexts: FakeAudioContext[] = []
const mounted: { unmount: () => void }[] = []

class FakeAudioContext {
  state = 'suspended'
  destination = {}
  closed = false

  constructor() {
    contexts.push(this)
  }

  async resume() {
    this.state = 'running'
  }

  async close() {
    this.closed = true
  }

  async decodeAudioData(data: { url: string }) {
    return data
  }

  createGain() {
    return { gain: { value: 1 }, connect: () => {} }
  }

  createBufferSource() {
    const source = {
      buffer: null as { url: string } | null,
      gain: 1,
      connect: (gain: { gain: { value: number } }) => { source.gain = gain.gain.value },
      start: () => played.push({ url: source.buffer!.url, volume: source.gain }),
    }
    return source
  }
}

function state(extra: Partial<GameState>): GameState {
  return {
    id: 'r', phase: 'lobby', round: 1, totalRounds: 3, language: 'en', drawTime: 80, hints: 2, customWordCount: 0,
    hostId: null, drawerId: null, endsAt: null, hint: '', players: [], paused: false, pauseVotes: [],
    remainingMs: null, reactions: {}, kickVotes: {}, awards: [], public: false, noUndo: false, noEraser: false,
    colorLimit: 0, chaos: false, rules: { noUndo: false, noEraser: false, colors: [] }, ...extra,
  }
}

async function setup() {
  const messages = createEventHook<ServerMessage>()
  const room = ref<GameState | null>(null)
  const secondsLeft = ref<number | null>(null)
  let sounds!: ReturnType<typeof useSounds>
  const wrapper = await mountSuspended(defineComponent({
    setup() {
      sounds = useSounds({ onMessage: messages.on, you: ref('me'), state: room, secondsLeft })
      return () => h('div')
    },
  }))
  mounted.push(wrapper)
  const receive = async (msg: ServerMessage) => {
    await messages.trigger(msg)
    await flushPromises()
  }
  return { sounds, room, secondsLeft, receive, wrapper }
}

async function interact() {
  document.dispatchEvent(new Event('pointerdown'))
  await flushPromises()
}

beforeEach(() => {
  played = []
  contexts = []
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('fetch', async (url: string) => ({ arrayBuffer: async () => ({ url }) }))
  localStorage.removeItem('muted')
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.unstubAllGlobals()
})

describe('useSounds', () => {
  it('stays silent until the player first interacts with the page', async () => {
    const { receive } = await setup()
    await receive({ t: 'welcome', you: 'me', state: state({}) })
    await receive({ t: 'state', state: state({ phase: 'choosing', drawerId: 'me' }) })
    expect(played).toEqual([])
    expect(contexts).toHaveLength(0)
  })

  it('plays the cue for the room\'s change once audio is unlocked', async () => {
    const { receive } = await setup()
    await interact()
    expect(contexts[0]!.state).toBe('running')

    await receive({ t: 'welcome', you: 'me', state: state({}) })
    await receive({ t: 'state', state: state({ phase: 'choosing', drawerId: 'me' }) })
    expect(played).toEqual([{ url: '/sounds/your-turn.mp3', volume: 0.5 }])
  })

  it('plays nothing while muted', async () => {
    const { sounds, receive } = await setup()
    await interact()
    sounds.muted.value = true
    await receive({ t: 'welcome', you: 'me', state: state({}) })
    await receive({ t: 'state', state: state({ phase: 'choosing', drawerId: 'me' }) })
    expect(played).toEqual([])
  })

  it('ticks, quietly, through the last five seconds of a running turn', async () => {
    const { room, secondsLeft } = await setup()
    await interact()
    room.value = state({ phase: 'drawing' })
    for (const s of [7, 6, 5, 4]) {
      secondsLeft.value = s
      await nextTick()
      await flushPromises()
    }
    expect(played).toEqual([
      { url: '/sounds/tick.mp3', volume: 0.3 },
      { url: '/sounds/tick.mp3', volume: 0.3 },
    ])

    room.value = state({ phase: 'drawing', paused: true })
    secondsLeft.value = 3
    await nextTick()
    await flushPromises()
    expect(played).toHaveLength(2)
  })

  it('closes its audio when the room goes away', async () => {
    const { wrapper } = await setup()
    await interact()
    mounted.splice(mounted.indexOf(wrapper), 1)
    wrapper.unmount()
    expect(contexts[0]!.closed).toBe(true)
  })
})
