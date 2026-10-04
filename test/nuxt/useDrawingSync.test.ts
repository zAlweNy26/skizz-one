import type { Brush } from 'drauu'
import type { ClientMessage, ServerMessage } from '#shared/utils/protocol'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createEventHook } from '@vueuse/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { DRAW_FLUSH_MS, DRAW_FLUSH_POINTS } from '#shared/utils/protocol'

const SVG_NS = 'http://www.w3.org/2000/svg'
const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.useRealTimers()
})

async function setup(drawer: boolean, mode: Brush['mode'] = 'draw') {
  const el = document.createElementNS(SVG_NS, 'svg')
  const model = { point: null as { x: number, y: number } | null, event: { timeStamp: 0 } }
  const hooks = {
    start: createEventHook<void>(),
    changed: createEventHook<void>(),
    committed: createEventHook<void>(),
    canceled: createEventHook<void>(),
  }
  const drauu = {
    drauuInstance: ref({ el, model }),
    brush: ref<Brush>({ mode, color: '#ef130b', size: 16 }),
    onStart: hooks.start.on,
    onChanged: hooks.changed.on,
    onCommitted: hooks.committed.on,
    onCanceled: hooks.canceled.on,
    dump: () => el.innerHTML,
    load: vi.fn((svg: string) => { el.innerHTML = svg }),
  }
  const sent: ClientMessage[] = []
  const messages = createEventHook<ServerMessage>()
  const isDrawer = ref(drawer)
  let sync!: ReturnType<typeof useDrawingSync>
  mounted.push(await mountSuspended(defineComponent({
    setup() {
      sync = useDrawingSync(drauu as never, { send: msg => sent.push(msg), onMessage: messages.on, isDrawer: computed(() => isDrawer.value) })
      return () => h('div')
    },
  })))

  /** drauu moves its pen to a point. */
  function move(x: number, y: number, t: number) {
    model.point = { x, y }
    model.event = { timeStamp: t }
    hooks.changed.trigger()
  }

  /** drauu finishes a stroke, leaving its node on the canvas. */
  function commit(markup = '<path d="M 1,2 L 3,4"></path>') {
    el.insertAdjacentHTML('beforeend', markup)
    hooks.committed.trigger()
  }

  return { el, drauu, sync, sent, isDrawer, move, commit, hooks, receive: messages.trigger }
}

describe('useDrawingSync for the drawer', () => {
  it('streams a freehand stroke: start, quantised points in batches, then the finished node', async () => {
    vi.useFakeTimers()
    const { sent, move, commit, hooks } = await setup(true)
    hooks.start.trigger()
    const id = (sent[0] as Extract<ClientMessage, { t: 'strokeStart' }>).id
    expect(sent[0]).toEqual({ t: 'strokeStart', id, brush: expect.objectContaining({ mode: 'draw', color: '#ef130b', size: 16 }) })

    move(10, 20, 1000)
    move(10.55, 20.04, 1016)
    vi.advanceTimersByTime(DRAW_FLUSH_MS)
    expect(sent[1]).toEqual({ t: 'draw', id, pts: [100, 200, 0, 106, 200, 16] })

    move(12, 22, 1040)
    commit()
    expect(sent.slice(2)).toEqual([
      { t: 'draw', id, pts: [120, 220, 40] },
      { t: 'commit', id, svg: '<path d="M 1,2 L 3,4"></path>' },
    ])
  })

  it('flushes at once when a batch fills up', async () => {
    const { sent, move, hooks } = await setup(true)
    hooks.start.trigger()
    for (let i = 0; i < DRAW_FLUSH_POINTS; i++) move(i, i, i)
    expect(sent.filter(m => m.t === 'draw')).toHaveLength(1)
  })

  it('sends the whole canvas for erasing and filling instead of streaming', async () => {
    const { sent, commit, hooks } = await setup(true, 'bucket')
    hooks.start.trigger()
    commit('<path d="M0 0Z" fill="#000"></path>')
    expect(sent).toEqual([{ t: 'canvas', svg: '<path d="M0 0Z" fill="#000"></path>' }])
  })

  it('resyncs the canvas when a stroke is cancelled, and on request', async () => {
    const { sent, sync, hooks } = await setup(true)
    hooks.start.trigger()
    hooks.canceled.trigger()
    sync.syncCanvas()
    expect(sent.slice(1)).toEqual([{ t: 'canvas', svg: '' }, { t: 'canvas', svg: '' }])
  })

  it('sends nothing for someone who isn\'t drawing', async () => {
    const { sent, sync, move, commit, hooks } = await setup(false)
    hooks.start.trigger()
    move(1, 1, 1)
    commit()
    sync.syncCanvas()
    expect(sent).toEqual([])
  })
})

describe('useDrawingSync for a watcher', () => {
  const line = { mode: 'line', color: '#000000', size: 8 } as const

  it('shows a shape\'s previews, then swaps in the finished node', async () => {
    const { el, receive } = await setup(false)
    await receive({ t: 'strokeStart', id: 's1', brush: line })
    await receive({ t: 'preview', id: 's1', svg: '<line x1="0" y1="0" x2="5" y2="5"></line>' })
    await receive({ t: 'preview', id: 's1', svg: '<line x1="0" y1="0" x2="9" y2="9"></line>' })
    expect(el.innerHTML).toBe('<line x1="0" y1="0" x2="9" y2="9" data-sync-id="s1"></line>')

    await receive({ t: 'commit', id: 's1', svg: '<line x1="0" y1="0" x2="9" y2="9"></line>' })
    expect(el.innerHTML).toBe('<line x1="0" y1="0" x2="9" y2="9"></line>')
  })

  it('replays a freehand stroke at the drawer\'s pace, then settles on the finished node', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const { el, receive } = await setup(false)
    await receive({ t: 'strokeStart', id: 's1', brush: { mode: 'draw', color: '#000000', size: 8 } })
    await receive({ t: 'draw', id: 's1', pts: [100, 100, 0, 200, 200, 50, 300, 100, 100] })
    await receive({ t: 'commit', id: 's1', svg: '<path d="M 10,10 L 30,10"></path>' })
    expect(el.innerHTML).toBe('')

    vi.advanceTimersByTime(150)
    expect(el.querySelector('[data-sync-id="s1"] path')).not.toBeNull()

    vi.advanceTimersByTime(1000)
    expect(el.innerHTML).toBe('<path d="M 10,10 L 30,10"></path>')
  })

  it('adds a finished stroke it never saw start, but never unsafe markup', async () => {
    const { el, receive } = await setup(false)
    await receive({ t: 'commit', id: 'late', svg: '<path d="M 1,1"></path>' })
    await receive({ t: 'commit', id: 'evil', svg: '<image href="x" onerror="alert(1)"></image>' })
    expect(el.innerHTML).toBe('<path d="M 1,1"></path>')
  })

  it('loads a full canvas, dropping half-drawn previews', async () => {
    const { el, drauu, receive } = await setup(false)
    await receive({ t: 'strokeStart', id: 's1', brush: line })
    await receive({ t: 'preview', id: 's1', svg: '<line x1="0" y1="0" x2="5" y2="5"></line>' })
    await receive({ t: 'canvas', svg: '<path d="M 7,7"></path>' })
    expect(drauu.load).toHaveBeenCalledWith('<path d="M 7,7"></path>')
    expect(el.innerHTML).toBe('<path d="M 7,7"></path>')
  })

  it('applies only full canvases while it is the one drawing', async () => {
    const { el, drauu, receive } = await setup(true)
    await receive({ t: 'commit', id: 'other', svg: '<path d="M 1,1"></path>' })
    expect(el.innerHTML).toBe('')
    await receive({ t: 'canvas', svg: '' })
    expect(drauu.load).toHaveBeenCalledWith('')
  })
})
