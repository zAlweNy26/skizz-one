import type { useDrauu } from '@vueuse/integrations/useDrauu'
import type { Brush } from 'drauu'
import type { TurnRules } from '#shared/utils/protocol'
import { PALETTE } from '#shared/utils/protocol'

const MODE_TOOLS = [
  { key: 'B', mode: 'draw', icon: 'i-lucide-paintbrush', label: 'canvas.tools.draw', cursor: 'cursor-pencil' },
  { key: 'F', mode: 'bucket', icon: 'i-lucide-paint-bucket', label: 'canvas.tools.bucket', cursor: 'cursor-bucket' },
  { key: 'E', mode: 'eraseLine', icon: 'i-lucide-eraser', label: 'canvas.tools.eraseLine', cursor: 'cursor-eraser' },
] as const

export type ToolMode = typeof MODE_TOOLS[number]['mode']

/** The drawer's palette, tools and shortcuts for this turn, with the turn's rules applied. */
export function useDrawingTools(
  drauu: ReturnType<typeof useDrauu>,
  sync: { syncCanvas: () => void },
  canDraw: Ref<boolean>,
  rules: Ref<TurnRules>,
) {
  const { undo, redo, clear, canUndo, canRedo, brush } = drauu
  const noUndo = computed(() => rules.value.noUndo)
  const noEraser = computed(() => rules.value.noEraser)
  const colors = computed<readonly string[]>(() => (rules.value.colors.length ? rules.value.colors : PALETTE))

  watch([canDraw, colors, noEraser], () => {
    if (!canDraw.value) return
    if (!colors.value.includes(brush.value.color)) brush.value.color = colors.value[0]!
    if (noEraser.value && brush.value.mode === 'eraseLine') brush.value.mode = 'draw'
  }, { immediate: true })

  function selectMode(mode: ToolMode) {
    if (!canDraw.value || (mode === 'eraseLine' && noEraser.value)) return
    brush.value.mode = mode
    if (mode === 'eraseLine') brush.value.eraseMode = 'partial'
  }

  /** Run a canvas-wide edit and resync watchers, if this turn allows it. */
  function edit(run: () => void, allowed: boolean) {
    if (!canDraw.value || noUndo.value || !allowed) return
    run()
    sync.syncCanvas()
  }

  const modes = computed(() => (noEraser.value ? MODE_TOOLS.filter(tool => tool.mode !== 'eraseLine') : MODE_TOOLS))
  const cursor = computed(() => MODE_TOOLS.find(tool => tool.mode === brush.value.mode)?.cursor ?? 'cursor-pencil')

  const actions = computed(() => noUndo.value
    ? []
    : [
        { key: 'U', icon: 'i-lucide-undo-2', label: 'canvas.tools.undo', color: 'neutral', disabled: !canUndo.value, run: () => edit(undo, canUndo.value) },
        { key: 'R', icon: 'i-lucide-redo-2', label: 'canvas.tools.redo', color: 'neutral', disabled: !canRedo.value, run: () => edit(redo, canRedo.value) },
        { key: 'D', icon: 'i-lucide-trash-2', label: 'canvas.tools.clear', color: 'error', disabled: false, run: () => edit(clear, true) },
      ] as const)

  defineShortcuts({
    b: () => selectMode('draw'),
    f: () => selectMode('bucket'),
    e: () => selectMode('eraseLine'),
    u: () => edit(undo, canUndo.value),
    r: () => edit(redo, canRedo.value),
    d: () => edit(clear, true),
  })

  return { brush: brush as Ref<Brush>, colors, modes, actions, cursor, selectMode }
}
