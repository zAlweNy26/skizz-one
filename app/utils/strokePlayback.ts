import type { Point } from 'drauu'
import { DrawModel } from 'drauu'

/** A stroke point as a watcher replays it: position plus the drawer's clock. */
export interface TimedPoint {
  x: number
  y: number
  /** Ms since the stroke's first point, on the drawer's clock. */
  t: number
}

/** How far behind the drawer a watcher replays, in ms. */
export const PLAYBACK_DELAY_MS = 80
export const MAX_PLAYBACK_DELAY_MS = 300

/** Replays one stroke at the pace it was drawn. */
export class StrokePlayback {
  readonly points: TimedPoint[] = []
  /** Local time minus drawer time. Null until the first point arrives. */
  #offset: number | null = null
  #revealed = 0

  /** Queue a batch. Returns how many ms late it arrived for its schedule. */
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

  /** Advance the replay to `now`: `count` points are due, `head` sits between the last due one and the next. */
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

/** Builds a draw-mode path incrementally, in chunks. */
export class ChunkedDrawPath {
  #live = ''
  /** Index of the last segment folded into `#live`; -1 before the first point. */
  #settled = -1
  #inChunk = 0

  constructor(readonly chunkSize = PATH_CHUNK_SEGMENTS) {}

  /** Render the first `count` of `points`, plus an optional moving `head`. */
  update(points: readonly Point[], count: number, head: Point | null = null) {
    const sealed: string[] = []
    if (count === 0) return { sealed, live: '' }

    if (this.#settled < 0) {
      this.#live = move(points[0]!)
      this.#settled = 0
    }

    for (let i = this.#settled + 1; i <= count - 2; i++) {
      this.#live += ` ${DrawModel.bezierCommand(points[i]!, i, points as Point[])}`
      this.#settled = i
      if (++this.#inChunk >= this.chunkSize) {
        sealed.push(this.#live)
        this.#live = move(points[i]!)
        this.#inChunk = 0
      }
    }

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
