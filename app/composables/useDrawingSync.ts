import type { UseDrauuReturn } from '@vueuse/integrations/useDrauu'
import type { Brush, Point } from 'drauu'
import type { ServerMessage, WireBrush } from '#shared/utils/protocol'
import type { TimedPoint } from '~/utils/drawing'
import {
  dequantize,
  DRAW_FLUSH_MS,
  DRAW_FLUSH_POINTS,
  isFreehand,
  isOpaque,
  POINT_STRIDE,
  quantize,
} from '#shared/utils/protocol'
import { sanitizeSvg } from '#shared/utils/svg'
import {
  ChunkedDrawPath,
  MAX_PLAYBACK_DELAY_MS,
  PLAYBACK_DELAY_MS,
  StrokePlayback,
} from '~/utils/drawing'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Marks nodes this composable manages. */
const SYNC_ATTR = 'data-sync-id'

function toWireBrush(brush: Brush): WireBrush {
  return {
    mode: brush.mode ?? 'draw',
    color: brush.color,
    size: brush.size,
    opacity: brush.opacity,
    dasharray: brush.dasharray,
    arrowEnd: brush.arrowEnd,
    cornerRadius: brush.cornerRadius,
    fill: brush.fill,
  }
}

/** A group styled the way drauu styles this brush's path. */
function createStrokeGroup(brush: WireBrush): SVGGElement {
  const el = document.createElementNS(SVG_NS, 'g')
  el.setAttribute('fill', brush.fill ?? 'transparent')
  el.setAttribute('stroke', brush.color)
  el.setAttribute('stroke-width', String(brush.size))
  el.setAttribute('stroke-linecap', 'round')
  if (brush.mode === 'highlighter') {
    el.setAttribute('stroke-linecap', 'butt')
    el.setAttribute('stroke-linejoin', 'round')
    el.setAttribute('opacity', String(brush.opacity ?? 0.4))
  } else if (brush.opacity != null && brush.opacity !== 1)
    el.setAttribute('opacity', String(brush.opacity))

  if (brush.dasharray) el.setAttribute('stroke-dasharray', brush.dasharray)
  return el
}

/** Parse one serialised SVG element back into a node. */
function parseSvgElement(markup: string): SVGElement | null {
  const clean = sanitizeSvg(markup)
  if (clean === null) return null
  const host = document.createElementNS(SVG_NS, 'svg')
  host.innerHTML = clean
  return host.firstElementChild as SVGElement | null
}

/** Streams the drawing between the drawer and everyone watching. */
export function useDrawingSync(
  drauu: UseDrauuReturn,
  game: Pick<ReturnType<typeof useGameSocket>, 'send' | 'onMessage' | 'isDrawer'>,
) {
  const { drauuInstance, brush, onStart, onChanged, onCommitted, onCanceled, dump, load } = drauu

  // --- drawer ------------------------------------------------------------

  let strokeId: string | null = null
  let strokeBrush: WireBrush | null = null
  /** Wire-ready numbers not yet sent, `POINT_STRIDE` per point. */
  let pending: number[] = []
  let lastPoint: Point | null = null
  /** Event timestamp of the stroke's first point. */
  let strokeT0: number | null = null

  /** The node drauu is currently building, i.e. the last one it appended. */
  function currentNode(): SVGElement | null {
    const el = drauuInstance.value?.el
    return (el?.lastElementChild as SVGElement | null) ?? null
  }

  const { start: startFlushTimer, stop: stopFlushTimer, isPending: flushPending }
    = useTimeoutFn(flush, DRAW_FLUSH_MS, { immediate: false })

  function flush() {
    stopFlushTimer()
    if (!strokeId || !strokeBrush || !game.isDrawer.value) return

    if (isFreehand(strokeBrush.mode)) {
      if (!pending.length) return
      game.send({ t: 'draw', id: strokeId, pts: pending })
      pending = []
      return
    }

    const node = currentNode()
    if (node) game.send({ t: 'preview', id: strokeId, svg: node.outerHTML })
  }

  /** Record the point drauu just handled. */
  function capturePoint() {
    const model = drauuInstance.value?.model
    const point = model?.point
    if (!point || point === lastPoint) return
    lastPoint = point

    const time = model.event?.timeStamp ?? performance.now()
    strokeT0 ??= time
    pending.push(quantize(point.x), quantize(point.y), Math.round(time - strokeT0))
  }

  onStart(() => {
    if (!game.isDrawer.value) return

    const wire = toWireBrush(brush.value)
    strokeBrush = wire
    pending = []
    lastPoint = null
    strokeT0 = null

    if (isOpaque(wire.mode)) {
      strokeId = null
      return
    }

    strokeId = crypto.randomUUID()
    game.send({ t: 'strokeStart', id: strokeId, brush: wire })
  })

  onChanged(() => {
    if (!game.isDrawer.value || !strokeId || !strokeBrush) return
    if (isFreehand(strokeBrush.mode)) capturePoint()
    if (pending.length / POINT_STRIDE >= DRAW_FLUSH_POINTS) flush()
    else if (!flushPending.value) startFlushTimer()
  })

  onCommitted(() => {
    if (!game.isDrawer.value) return

    const wire = strokeBrush
    const id = strokeId

    if (!wire || isOpaque(wire.mode)) {
      endStroke()
      syncCanvas()
      return
    }

    if (isFreehand(wire.mode)) flush()
    endStroke()

    const node = currentNode()
    if (id && node) game.send({ t: 'commit', id, svg: node.outerHTML })
  })

  onCanceled(() => {
    if (!game.isDrawer.value || !strokeId) return
    endStroke()
    syncCanvas()
  })

  function endStroke() {
    stopFlushTimer()
    strokeId = null
    strokeBrush = null
    pending = []
  }

  /** Push the whole canvas. Used for undo, redo, clear, erase and bucket. */
  function syncCanvas() {
    if (!game.isDrawer.value) return
    game.send({ t: 'canvas', svg: dump() ?? '' })
  }

  // --- watcher -----------------------------------------------------------

  interface RemoteStroke {
    brush: WireBrush
    /** The group the preview draws into, once it has something to show. */
    node: SVGElement | null
    /** Freehand strokes only; shapes arrive as whole previews instead. */
    playback: StrokePlayback | null
    path: ChunkedDrawPath | null
    /** The live chunk, rewritten every frame. Sealed chunks sit before it. */
    live: SVGPathElement | null
    /** The authoritative node, held until the replay has caught up. */
    commit: string | null
  }

  const strokes = new Map<string, RemoteStroke>()

  /** How far behind the drawer the replay runs, shared across strokes. */
  let delay = PLAYBACK_DELAY_MS
  let raf: number | null = null

  function canvasEl() {
    return drauuInstance.value?.el ?? null
  }

  function clearPreviews() {
    for (const stroke of strokes.values()) stroke.node?.remove()
    strokes.clear()
    if (raf != null) cancelAnimationFrame(raf)
    raf = null
  }

  function ensureNode(id: string, stroke: RemoteStroke) {
    if (stroke.node) return stroke.node
    const node = createStrokeGroup(stroke.brush)
    node.setAttribute(SYNC_ATTR, id)
    canvasEl()?.appendChild(node)
    stroke.node = node
    return node
  }

  function renderStroke(id: string, stroke: RemoteStroke, now: number) {
    if (!stroke.playback || !stroke.path) return
    const { count, head } = stroke.playback.frame(now)
    if (!count) return

    const { sealed, live } = stroke.path.update(stroke.playback.points, count, head)
    const group = ensureNode(id, stroke)
    if (!stroke.live) {
      stroke.live = document.createElementNS(SVG_NS, 'path')
      group.appendChild(stroke.live)
    }
    for (const d of sealed) {
      const chunk = document.createElementNS(SVG_NS, 'path')
      chunk.setAttribute('d', d)
      stroke.live.before(chunk)
    }
    stroke.live.setAttribute('d', live)
  }

  /** Swap the preview for the real node, keeping its place in the stack. */
  function finishStroke(id: string, stroke: RemoteStroke) {
    strokes.delete(id)
    const node = stroke.commit != null ? parseSvgElement(stroke.commit) : null
    if (stroke.node && node) stroke.node.replaceWith(node)
    else if (node) canvasEl()?.appendChild(node)
    else stroke.node?.remove()
  }

  function tick() {
    raf = null
    const now = performance.now()
    let busy = false
    for (const [id, stroke] of strokes) {
      renderStroke(id, stroke, now)
      const done = stroke.playback?.done ?? true
      if (done && stroke.commit != null) finishStroke(id, stroke)
      else if (!done) busy = true
    }
    if (busy) schedule()
  }

  function schedule() {
    raf ??= requestAnimationFrame(tick)
  }

  function startRemoteStroke(msg: Extract<ServerMessage, { t: 'strokeStart' }>) {
    const freehand = isFreehand(msg.brush.mode)
    strokes.set(msg.id, {
      brush: msg.brush,
      node: null,
      playback: freehand ? new StrokePlayback() : null,
      path: freehand
        ? new ChunkedDrawPath(msg.brush.dasharray ? Infinity : undefined)
        : null,
      live: null,
      commit: null,
    })
    delay = Math.max(PLAYBACK_DELAY_MS, delay * 0.9)
  }

  function queueRemotePoints(msg: Extract<ServerMessage, { t: 'draw' }>) {
    const stroke = strokes.get(msg.id)
    if (!stroke?.playback) return
    const batch: TimedPoint[] = []
    for (let i = 0; i + POINT_STRIDE - 1 < msg.pts.length; i += POINT_STRIDE) {
      batch.push({
        x: dequantize(msg.pts[i]!),
        y: dequantize(msg.pts[i + 1]!),
        t: msg.pts[i + 2]!,
      })
    }
    const late = stroke.playback.push(batch, performance.now(), delay)
    delay = Math.min(MAX_PLAYBACK_DELAY_MS, delay + late)
    schedule()
  }

  function showRemotePreview(msg: Extract<ServerMessage, { t: 'preview' }>) {
    const node = parseSvgElement(msg.svg)
    const stroke = strokes.get(msg.id)
    if (!node || !stroke) return
    node.setAttribute(SYNC_ATTR, msg.id)
    if (stroke.node) stroke.node.replaceWith(node)
    else canvasEl()?.appendChild(node)
    stroke.node = node
  }

  function commitRemoteStroke(msg: Extract<ServerMessage, { t: 'commit' }>) {
    const stroke = strokes.get(msg.id)
    if (!stroke) {
      const node = parseSvgElement(msg.svg)
      if (node) canvasEl()?.appendChild(node)
      return
    }
    stroke.commit = msg.svg
    if (stroke.playback?.done ?? true) finishStroke(msg.id, stroke)
    else schedule()
  }

  function applyRemote(msg: ServerMessage) {
    if (!canvasEl()) return

    switch (msg.t) {
      case 'strokeStart':
        return startRemoteStroke(msg)
      case 'draw':
        return queueRemotePoints(msg)
      case 'preview':
        return showRemotePreview(msg)
      case 'commit':
        return commitRemoteStroke(msg)
      case 'canvas': {
        const svg = sanitizeSvg(msg.svg)
        if (svg === null) return
        clearPreviews()
        load(svg)
        break
      }
      case 'roundEnd':
        clearPreviews()
        break
    }
  }

  /** Drop drauu's undo history while keeping the drawing's nodes as they are. */
  function resetHistory() {
    const instance = drauuInstance.value
    const el = instance?.el
    if (!el) return
    const range = document.createRange()
    range.selectNodeContents(el)
    const drawing = range.extractContents()
    instance.clear()
    el.append(drawing)
  }

  watch(game.isDrawer, () => {
    endStroke()
    clearPreviews()
    resetHistory()
  })

  game.onMessage((msg) => {
    if (game.isDrawer.value && msg.t !== 'canvas' && msg.t !== 'roundEnd') return
    applyRemote(msg)
  })

  return { syncCanvas, clearPreviews }
}
