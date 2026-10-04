import type { Brush } from 'drauu'
import type { TurnRules } from '#shared/utils/protocol'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { PALETTE } from '#shared/utils/protocol'

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

async function setup(turn: Partial<TurnRules> = {}, drawing = true) {
  const drauu = {
    brush: ref<Brush>({ mode: 'draw', color: '#000000', size: 16 }),
    canUndo: ref(true),
    canRedo: ref(false),
    undo: vi.fn(),
    redo: vi.fn(),
    clear: vi.fn(),
  }
  const sync = { syncCanvas: vi.fn() }
  const canDraw = ref(drawing)
  const rules = ref<TurnRules>({ noUndo: false, noEraser: false, colors: [], ...turn })
  let tools!: ReturnType<typeof useDrawingTools>
  const wrapper = await mountSuspended(defineComponent({
    setup() {
      tools = useDrawingTools(drauu as never, sync, canDraw, rules)
      return () => h('div')
    },
  }))
  mounted.push(wrapper)
  return { tools, drauu, sync, canDraw, rules }
}

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

describe('useDrawingTools', () => {
  it('offers the whole palette and every tool on a turn without rules', async () => {
    const { tools } = await setup()
    expect(tools.colors.value).toEqual(PALETTE)
    expect(tools.modes.value.map(t => t.mode)).toEqual(['draw', 'bucket', 'eraseLine'])
    expect(tools.actions.value.map(a => a.key)).toEqual(['U', 'R', 'D'])
    expect(tools.cursor.value).toBe('cursor-pencil')
  })

  it('limits the palette and moves the brush onto it', async () => {
    const { tools, drauu } = await setup({ colors: ['#ef130b', '#00cc00'] })
    expect(tools.colors.value).toEqual(['#ef130b', '#00cc00'])
    expect(drauu.brush.value.color).toBe('#ef130b')
  })

  it('takes the eraser away, and the brush off it, when the turn bans it', async () => {
    const { tools, drauu, rules } = await setup()
    tools.selectMode('eraseLine')
    expect(drauu.brush.value).toMatchObject({ mode: 'eraseLine', eraseMode: 'partial' })
    expect(tools.cursor.value).toBe('cursor-eraser')

    rules.value = { ...rules.value, noEraser: true }
    await nextTick()
    expect(drauu.brush.value.mode).toBe('draw')
    expect(tools.modes.value.map(t => t.mode)).toEqual(['draw', 'bucket'])
    tools.selectMode('eraseLine')
    expect(drauu.brush.value.mode).toBe('draw')
  })

  it('undoes and resyncs the canvas, but only when it can', async () => {
    const { tools, drauu, sync } = await setup()
    tools.actions.value[0]!.run()
    expect(drauu.undo).toHaveBeenCalledOnce()
    expect(sync.syncCanvas).toHaveBeenCalledOnce()

    tools.actions.value[1]!.run()
    expect(drauu.redo).not.toHaveBeenCalled()
    expect(tools.actions.value[1]!.disabled).toBe(true)
  })

  it('has no undo, redo or clear on a no-undo turn', async () => {
    const { tools, drauu } = await setup({ noUndo: true })
    expect(tools.actions.value).toEqual([])
    press('d')
    expect(drauu.clear).not.toHaveBeenCalled()
  })

  it('answers the keyboard shortcuts only while drawing', async () => {
    const { drauu, sync, canDraw } = await setup()
    press('f')
    expect(drauu.brush.value.mode).toBe('bucket')
    press('d')
    expect(drauu.clear).toHaveBeenCalledOnce()
    expect(sync.syncCanvas).toHaveBeenCalledOnce()

    canDraw.value = false
    press('b')
    press('u')
    expect(drauu.brush.value.mode).toBe('bucket')
    expect(drauu.undo).not.toHaveBeenCalled()
  })
})
