import type { UseDrauuReturn } from '@vueuse/integrations/useDrauu'
import type { Brush, Point } from 'drauu'
import type { ClientMessage, ServerMessage, WireBrush } from '#shared/utils/protocol'
import { DrawModel, StylusModel } from 'drauu'
import {
  dequantize,
  DRAW_FLUSH_MS,
  DRAW_FLUSH_POINTS,
  isFreehand,
  isOpaque,
  quantize,
  strideFor,
} from '#shared/utils/protocol'

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

/** Rebuild the element drauu would have made for this brush. */
function createStrokeElement(brush: WireBrush): SVGPathElement {
  const el = document.createElementNS(SVG_NS, 'path')
  el.setAttribute('fill', brush.fill ?? 'transparent')
  el.setAttribute('stroke', brush.color)
  el.setAttribute('stroke-width', String(brush.size))
  el.setAttribute('stroke-linecap', 'round')
  if (brush.opacity != null && brush.opacity !== 1)
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
 * While a stroke is in flight the drawer sends only the points added since the
 * last frame, and watchers rebuild the path with drauu's own geometry — the
 * same code that produced it. When the stroke finishes, the drawer sends the
 * real node, which snaps every watcher to a byte-exact copy and heals any
 * drift the cheap preview introduced.
 */
export function useDrawingSync(drauu: UseDrauuReturn, game: GameBridge) {
  const { drauuInstance, brush, onStart, onChanged, onCommitted, dump, load } = drauu

  // --- drawer ------------------------------------------------------------

  let strokeId: string | null = null
  let strokeBrush: WireBrush | null = null
  let sentPoints = 0
  let frame: number | null = null
  let bufferedPoints = 0

  function currentPoints(): Point[] | null {
    const model = drauuInstance.value?.model as { points?: Point[] } | undefined
    return model?.points ?? null
  }

  /** The node drauu is currently building, i.e. the last one it appended. */
  function currentNode(): SVGElement | null {
    const el = drauuInstance.value?.el
    return (el?.lastElementChild as SVGElement | null) ?? null
  }

  function flush() {
    frame = null
    bufferedPoints = 0
    if (!strokeId || !strokeBrush || !game.isDrawer.value) return

    if (isFreehand(strokeBrush.mode)) {
      const points = currentPoints()
      if (!points || points.length <= sentPoints) return

      const stride = strideFor(strokeBrush.mode)
      const pts: number[] = []
      for (let i = sentPoints; i < points.length; i++) {
        const p = points[i]!
        pts.push(quantize(p.x), quantize(p.y))
        // Pressure only matters to the stylus renderer.
        if (stride === 3) pts.push(Math.round((p.pressure ?? 0.5) * 100))
      }
      sentPoints = points.length
      game.send({ t: 'draw', id: strokeId, pts })
      return
    }

    // A shape is a single fixed-size element; shipping it whole is cheaper
    // than describing it, and it is transient so it never hits the cache.
    const node = currentNode()
    if (node) game.send({ t: 'preview', id: strokeId, svg: node.outerHTML })
  }

  /**
   * Coalesce pointer events.
   *
   * Cloudflare's guidance for high-frequency Durable Object traffic is to
   * flush on whichever of a time window or a message count comes first.
   */
  function scheduleFlush() {
    bufferedPoints++
    if (bufferedPoints >= DRAW_FLUSH_POINTS) {
      if (frame != null) clearTimeout(frame)
      flush()
      return
    }
    if (frame != null) return
    frame = window.setTimeout(requestAnimationFrame, DRAW_FLUSH_MS, flush)
  }

  onStart(() => {
    if (!game.isDrawer.value) return

    const wire = toWireBrush(brush.value)
    strokeBrush = wire
    sentPoints = 0
    bufferedPoints = 0

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
    if (!game.isDrawer.value || !strokeId) return
    scheduleFlush()
  })

  onCommitted(() => {
    if (!game.isDrawer.value) return
    if (frame != null) {
      clearTimeout(frame)
      frame = null
    }

    const wire = strokeBrush
    strokeBrush = null
    const id = strokeId
    strokeId = null

    // Whole-canvas resync: the cheapest correct answer for operations that
    // mutate nodes already on the canvas.
    if (!wire || isOpaque(wire.mode)) {
      syncCanvas()
      return
    }

    // Send any points the last frame didn't carry, then the real node.
    if (id && isFreehand(wire.mode)) {
      sentPoints = 0
      strokeId = id
      strokeBrush = wire
      flush()
      strokeId = null
      strokeBrush = null
    }

    const node = currentNode()
    if (id && node) game.send({ t: 'commit', id, svg: node.outerHTML })
  })

  /** Push the whole canvas. Used for undo, redo, clear, erase and bucket. */
  function syncCanvas() {
    if (!game.isDrawer.value) return
    game.send({ t: 'canvas', svg: dump() ?? '' })
  }

  // --- watcher -----------------------------------------------------------

  const brushes = new Map<string, WireBrush>()
  const points = new Map<string, Point[]>()
  const nodes = new Map<string, SVGElement>()

  function canvasEl() {
    return drauuInstance.value?.el ?? null
  }

  function dropPreview(id: string) {
    nodes.get(id)?.remove()
    nodes.delete(id)
    points.delete(id)
    brushes.delete(id)
  }

  function clearPreviews() {
    for (const id of [...nodes.keys()]) dropPreview(id)
  }

  function renderPreview(id: string) {
    const el = canvasEl()
    const wire = brushes.get(id)
    const pts = points.get(id)
    if (!el || !wire || !pts?.length) return

    let node = nodes.get(id)
    if (!node) {
      node = createStrokeElement(wire)
      node.setAttribute(SYNC_ATTR, id)
      el.appendChild(node)
      nodes.set(id, node)
    }

    const d = wire.mode === 'stylus'
      ? StylusModel.getSvgData(pts, wire as Brush)
      : DrawModel.toSvgData(pts)
    node.setAttribute('d', d)

    // perfect-freehand returns a filled outline rather than a stroked line.
    if (wire.mode === 'stylus') {
      node.setAttribute('fill', wire.color)
      node.setAttribute('stroke', 'none')
    }
  }

  function applyRemote(msg: ServerMessage) {
    const el = canvasEl()
    if (!el) return

    switch (msg.t) {
      case 'strokeStart':
        brushes.set(msg.id, msg.brush)
        points.set(msg.id, [])
        break

      case 'draw': {
        const wire = brushes.get(msg.id)
        if (!wire) return
        const stride = strideFor(wire.mode)
        const list = points.get(msg.id) ?? []
        for (let i = 0; i + stride - 1 < msg.pts.length; i += stride) {
          list.push({
            x: dequantize(msg.pts[i]!),
            y: dequantize(msg.pts[i + 1]!),
            pressure: stride === 3 ? msg.pts[i + 2]! / 100 : 0.5,
          })
        }
        points.set(msg.id, list)
        renderPreview(msg.id)
        break
      }

      case 'preview': {
        const node = parseSvgElement(msg.svg)
        if (!node) return
        node.setAttribute(SYNC_ATTR, msg.id)
        const existing = nodes.get(msg.id)
        if (existing) existing.replaceWith(node)
        else el.appendChild(node)
        nodes.set(msg.id, node)
        break
      }

      case 'commit': {
        // The authoritative node replaces whatever the preview guessed.
        dropPreview(msg.id)
        const node = parseSvgElement(msg.svg)
        if (node) el.appendChild(node)
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
