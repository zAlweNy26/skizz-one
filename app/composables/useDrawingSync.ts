import type { UseDrauuReturn } from '@vueuse/integrations/useDrauu'
import type { Brush, Point } from 'drauu'
import type { ClientMessage, ServerMessage, WireBrush } from '#shared/utils/protocol'
import type { TimedPoint } from '~/utils/strokePlayback'
import {
  dequantize,
  DRAW_FLUSH_MS,
  DRAW_FLUSH_POINTS,
  isFreehand,
  isOpaque,
  POINT_STRIDE,
  quantize,
} from '#shared/utils/protocol'
import {
  ChunkedDrawPath,
  MAX_PLAYBACK_DELAY_MS,
  PLAYBACK_DELAY_MS,
  StrokePlayback,
} from '~/utils/strokePlayback'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Marks nodes this composable manages, so previews can be found and removed. */
const SYNC_ATTR = 'data-sync-id'

interface GameBridge {
  send: (msg: ClientMessage) => void
  onMessage: (fn: (msg: ServerMessage) => void) => void
  isDrawer: Ref<boolean>
}

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

/**
 * A group styled the way drauu styles this brush's path.
 *
 * The preview is drawn as several path chunks, so the style lives on the
 * group they inherit it from. Opacity on a group composites the chunks
 * first, so a highlighter shows no darker dots where chunks meet.
 */
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
  }
  else if (brush.opacity != null && brush.opacity !== 1)
    el.setAttribute('opacity', String(brush.opacity))

  if (brush.dasharray) el.setAttribute('stroke-dasharray', brush.dasharray)
  return el
}

/** Parse one serialised SVG element back into a node. */
function parseSvgElement(markup: string): SVGElement | null {
  const host = document.createElementNS(SVG_NS, 'svg')
  host.innerHTML = markup
  return (host.firstElementChild as SVGElement | null) ?? null
}

/**
 * Streams the drawing between the drawer and everyone watching.
 *
 * While a stroke is in flight the drawer sends timestamped points in small
 * batches, and watchers replay them at the pace they were drawn, rebuilding
 * the path with drauu's own geometry. When the stroke finishes, the drawer
 * sends the real node; once the replay reaches the end it replaces the
 * preview, leaving every canvas a byte-exact copy of the drawer's.
 */
export function useDrawingSync(drauu: UseDrauuReturn, game: GameBridge) {
  const { drauuInstance, brush, onStart, onChanged, onCommitted, onCanceled, dump, load } = drauu

  // --- drawer ------------------------------------------------------------

  let strokeId: string | null = null
  let strokeBrush: WireBrush | null = null
  let flushTimer: number | null = null
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

  function stopFlushTimer() {
    if (flushTimer != null) clearTimeout(flushTimer)
    flushTimer = null
  }

  function flush() {
    stopFlushTimer()
    if (!strokeId || !strokeBrush || !game.isDrawer.value) return

    if (isFreehand(strokeBrush.mode)) {
      if (!pending.length) return
      game.send({ t: 'draw', id: strokeId, pts: pending })
      pending = []
      return
    }

    // A shape is a single fixed-size element; shipping it whole is cheaper
    // than describing it, and it is transient so it never hits the cache.
    const node = currentNode()
    if (node) game.send({ t: 'preview', id: strokeId, svg: node.outerHTML })
  }

  /**
   * Record the point drauu just handled.
   *
   * This reads `model.point`, never `model.points`, so it doesn't depend on
   * how a model stores its stroke. drauu's draw model used to replace that
   * array with a simplified copy every few moves, and an index into it
   * silently skipped and re-sent points.
   */
  function capturePoint() {
    const model = drauuInstance.value?.model
    const point = model?.point
    // A modifier key re-runs the move with the same point; skip the repeat.
    if (!point || point === lastPoint) return
    lastPoint = point

    const time = model.event?.timeStamp ?? performance.now()
    strokeT0 ??= time
    pending.push(quantize(point.x), quantize(point.y), Math.round(time - strokeT0))
  }

  /**
   * Coalesce pointer events.
   *
   * Cloudflare's guidance for high-frequency Durable Object traffic is to
   * flush on whichever of a time window or a message count comes first.
   */
  function scheduleFlush() {
    if (pending.length / POINT_STRIDE >= DRAW_FLUSH_POINTS) {
      flush()
      return
    }
    flushTimer ??= window.setTimeout(flush, DRAW_FLUSH_MS)
  }

  onStart(() => {
    if (!game.isDrawer.value) return

    const wire = toWireBrush(brush.value)
    strokeBrush = wire
    pending = []
    lastPoint = null
    strokeT0 = null

    // Erase and bucket rewrite existing nodes and masks rather than adding
    // one, so there is nothing meaningful to preview. They sync on commit.
    if (isOpaque(wire.mode)) {
      strokeId = null
      return
    }

    strokeId = crypto.randomUUID()
    game.send({ t: 'strokeStart', id: strokeId, brush: wire })
  })

  // Fires on every pointer move. Buffer here and let the flush decide when
  // it is worth a message — one message per pointer event would be 120/s.
  onChanged(() => {
    if (!game.isDrawer.value || !strokeId || !strokeBrush) return
    if (isFreehand(strokeBrush.mode)) capturePoint()
    scheduleFlush()
  })

  onCommitted(() => {
    if (!game.isDrawer.value) return

    const wire = strokeBrush
    const id = strokeId

    // Whole-canvas resync: the cheapest correct answer for operations that
    // mutate nodes already on the canvas.
    if (!wire || isOpaque(wire.mode)) {
      endStroke()
      syncCanvas()
      return
    }

    // Send the points the last window didn't carry, so the watcher's replay
    // reaches the end of the stroke before the real node replaces it.
    if (isFreehand(wire.mode)) flush()
    endStroke()

    const node = currentNode()
    if (id && node) game.send({ t: 'commit', id, svg: node.outerHTML })
  })

  // drauu dropped the stroke without committing it. Nothing will ever
  // replace the watchers' preview, so resync them to what is really there.
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

  /**
   * How far behind the drawer the replay runs. Shared across strokes, it
   * grows when batches arrive late and eases back down stroke by stroke.
   */
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

  function applyRemote(msg: ServerMessage) {
    if (!canvasEl()) return

    switch (msg.t) {
      case 'strokeStart': {
        const freehand = isFreehand(msg.brush.mode)
        strokes.set(msg.id, {
          brush: msg.brush,
          node: null,
          playback: freehand ? new StrokePlayback() : null,
          path: freehand
            // Chunks restart the dash pattern, so dashed strokes stay whole.
            ? new ChunkedDrawPath(msg.brush.dasharray ? Infinity : undefined)
            : null,
          live: null,
          commit: null,
        })
        delay = Math.max(PLAYBACK_DELAY_MS, delay * 0.9)
        break
      }

      case 'draw': {
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
        break
      }

      case 'preview': {
        const node = parseSvgElement(msg.svg)
        const stroke = strokes.get(msg.id)
        if (!node || !stroke) return
        node.setAttribute(SYNC_ATTR, msg.id)
        if (stroke.node) stroke.node.replaceWith(node)
        else canvasEl()?.appendChild(node)
        stroke.node = node
        break
      }

      case 'commit': {
        const stroke = strokes.get(msg.id)
        if (!stroke) {
          // No preview to replace, e.g. we joined mid-stroke.
          const node = parseSvgElement(msg.svg)
          if (node) canvasEl()?.appendChild(node)
          return
        }
        stroke.commit = msg.svg
        if (stroke.playback?.done ?? true) finishStroke(msg.id, stroke)
        else schedule()
        break
      }

      case 'canvas':
        clearPreviews()
        load(msg.svg)
        break

      case 'roundEnd':
        clearPreviews()
        break
    }
  }

  game.onMessage((msg) => {
    // The drawer's own strokes are already on screen; the server never
    // echoes them back, but guard anyway so a reconnect can't double-draw.
    if (game.isDrawer.value && msg.t !== 'canvas' && msg.t !== 'roundEnd') return
    applyRemote(msg)
  })

  return { syncCanvas, clearPreviews }
}
