import type { Point } from 'drauu'
import { DrawModel } from 'drauu'

/** A stroke point as a watcher replays it: position plus the drawer's clock. */
export interface TimedPoint {
  x: number
  y: number
  /** Ms since the stroke's first point, on the drawer's clock. */
  t: number
}

/**
 * How far behind the drawer a watcher replays, in ms.
 *
 * It has to cover one flush window plus network jitter, or the replay runs
 * dry and stalls. It starts here and grows whenever a batch arrives late.
 */
export const PLAYBACK_DELAY_MS = 80
export const MAX_PLAYBACK_DELAY_MS = 300

/**
 * Replays one stroke at the pace it was drawn.
 *
 * Points arrive in bursts, one per flush. Showing each burst as it lands
 * makes the line lurch forward ~30 times a second; instead every point is
 * scheduled at its drawer timestamp plus a fixed delay, and each animation
 * frame reveals whatever is due, interpolating toward the next point.
 */
export class StrokePlayback {
  readonly points: TimedPoint[] = []
  /** Local time minus drawer time. Null until the first point arrives. */
  #offset: number | null = null
  #revealed = 0

  /**
   * Queue a batch. Returns how many ms late it arrived for its schedule.
   *
   * A late batch pushes the schedule back rather than having its points
   * shown all at once: a brief pause reads far smoother than a jump.
   */
  push(batch: TimedPoint[], now: number, delay: number): number {
    const first = batch[0]
    if (!first) return 0

    let late = 0
    if (this.#offset == null)
      this.#offset = now - first.t + delay

    else {
      late = Math.max(0, now - (first.t + this.#offset))
      this.#offset += late
    }

    for (const p of batch) this.points.push(p)
    return late
  }

  /**
   * Advance the replay to `now`.
   *
   * `count` points are fully due; `head`, when present, sits between the
   * last due point and the next one, so the line moves every frame.
   */
  frame(now: number): { count: number, head: Point | null } {
    if (this.#offset == null) return { count: 0, head: null }

    const target = now - this.#offset
    const pts = this.points
    while (this.#revealed < pts.length && pts[this.#revealed]!.t <= target)
      this.#revealed++

    const a = pts[this.#revealed - 1]
    const b = pts[this.#revealed]
    if (!a || !b) return { count: this.#revealed, head: null }

    const span = b.t - a.t
    const f = span > 0 ? Math.min(1, Math.max(0, (target - a.t) / span)) : 0
    return {
      count: this.#revealed,
      head: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, pressure: 0.5 },
    }
  }

  /** Every point received so far has been shown. */
  get done() {
    return this.#revealed === this.points.length
  }
}

/** Segments per path element before it is sealed and a new one begun. */
export const PATH_CHUNK_SEGMENTS = 64

/**
 * Builds a draw-mode path incrementally, in chunks.
 *
 * Re-rendering the whole `d` every frame costs O(points) in string building
 * and, worse, in the browser re-parsing the path. But a Bézier segment only
 * depends on the two points before it and the one after, so once its next
 * point exists it never changes. Settled segments are appended once, and
 * every `chunkSize` of them the path element is sealed and a new one begun,
 * so the element being rewritten each frame stays small.
 *
 * Joined back together, the chunks describe exactly the curve
 * `DrawModel.toSvgData` would for the same points.
 */
export class ChunkedDrawPath {
  #live = ''
  /** Index of the last segment folded into `#live`; -1 before the first point. */
  #settled = -1
  #inChunk = 0

  constructor(readonly chunkSize = PATH_CHUNK_SEGMENTS) {}

  /**
   * Render the first `count` of `points`, plus an optional moving `head`.
   *
   * Returns the chunks sealed by this call, in order, and the `d` of the
   * chunk still being drawn.
   */
  update(points: readonly Point[], count: number, head: Point | null = null) {
    const sealed: string[] = []
    if (count === 0) return { sealed, live: '' }

    if (this.#settled < 0) {
      this.#live = move(points[0]!)
      this.#settled = 0
    }

    // Segment i is final once point i + 1 is due.
    for (let i = this.#settled + 1; i <= count - 2; i++) {
      this.#live += ` ${DrawModel.bezierCommand(points[i]!, i, points as Point[])}`
      this.#settled = i
      if (++this.#inChunk >= this.chunkSize) {
        sealed.push(this.#live)
        this.#live = move(points[i]!)
        this.#inChunk = 0
      }
    }

    // The unsettled tail is recomputed every frame. Only its neighbours are
    // copied, so this stays O(tail) however long the stroke gets.
    const base = Math.max(0, this.#settled - 1)
    const win = points.slice(base, count) as Point[]
    if (head) win.push(head)
    let tail = ''
    for (let j = this.#settled + 1 - base; j < win.length; j++)
      tail += ` ${DrawModel.bezierCommand(win[j]!, j, win)}`

    return { sealed, live: this.#live + tail }
  }
}

function move(p: Point) {
  return `M ${p.x.toFixed(2)},${p.y.toFixed(2)}`
}
