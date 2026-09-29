import type { Point } from 'drauu'
import type { TimedPoint } from '~/utils/drawing'
import { DrawModel } from 'drauu'
import { describe, expect, it } from 'vitest'
import { ChunkedDrawPath, StrokePlayback } from '~/utils/drawing'

/** A wobbly line, one point every 8ms, as a 120Hz pointer would give. */
function stroke(n: number): TimedPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    x: 100 + i * 9,
    y: 450 + 120 * Math.sin(i / 7),
    t: i * 8,
  }))
}

describe('stroke playback', () => {
  it('shows nothing until the delay has passed', () => {
    const p = new StrokePlayback()
    p.push(stroke(5), 1000, 80)
    expect(p.frame(1000).count).toBe(0)
    expect(p.frame(1079).count).toBe(0)
    expect(p.frame(1080).count).toBe(1)
  })

  it('reveals points at the pace they were drawn, not as they arrived', () => {
    const p = new StrokePlayback()
    p.push(stroke(10), 1000, 80)
    expect(p.frame(1080 + 8 * 3).count).toBe(4)
    expect(p.frame(1080 + 8 * 6).count).toBe(7)
  })

  it('interpolates a head between due points so the line moves every frame', () => {
    const p = new StrokePlayback()
    const pts = stroke(3)
    p.push(pts, 1000, 80)
    const { count, head } = p.frame(1080 + 4)
    expect(count).toBe(1)
    expect(head!.x).toBeCloseTo((pts[0]!.x + pts[1]!.x) / 2)
  })

  it('stretches the schedule for a late batch instead of jumping', () => {
    const p = new StrokePlayback()
    const pts = stroke(20)
    p.push(pts.slice(0, 10), 1000, 80)
    const late = p.push(pts.slice(10), 1200, 80)
    expect(late).toBe(40)
    expect(p.frame(1200).count).toBe(11)
    expect(p.frame(1200 + 8 * 4).count).toBe(15)
  })

  it('is done once every received point has been shown', () => {
    const p = new StrokePlayback()
    expect(p.done).toBe(true)
    p.push(stroke(4), 1000, 80)
    expect(p.done).toBe(false)
    p.frame(1080 + 24)
    expect(p.done).toBe(true)
  })
})

describe('chunked draw path', () => {
  const points: Point[] = stroke(300).map(({ x, y }) => ({ x, y, pressure: 0.5 }))

  /** Rejoin chunks by dropping each later chunk's leading move. */
  function join(chunks: string[]) {
    return chunks.map((d, i) => (i === 0 ? d : d.replace(/^M \S+/, ''))).join('')
  }

  it('draws exactly the curve drauu would, fed all at once', () => {
    const path = new ChunkedDrawPath(Infinity)
    const { sealed, live } = path.update(points, points.length)
    expect(sealed).toEqual([])
    expect(live).toBe(DrawModel.toSvgData(points))
  })

  it('draws the same curve when fed a point at a time', () => {
    const path = new ChunkedDrawPath(Infinity)
    let live = ''
    for (let n = 1; n <= points.length; n++) live = path.update(points, n).live
    expect(live).toBe(DrawModel.toSvgData(points))
  })

  it('splits into chunks that join back into the same curve', () => {
    const path = new ChunkedDrawPath(16)
    const chunks: string[] = []
    let live = ''
    for (let n = 1; n <= points.length; n++) {
      const out = path.update(points, n)
      chunks.push(...out.sealed)
      live = out.live
    }
    expect(chunks.length).toBeGreaterThan(10)
    expect(join([...chunks, live])).toBe(DrawModel.toSvgData(points))
  })

  it('keeps the rewritten chunk small however long the stroke gets', () => {
    const path = new ChunkedDrawPath(16)
    let live = ''
    for (let n = 1; n <= points.length; n++) live = path.update(points, n).live
    const segments = live.split(' C ').length - 1
    expect(segments).toBeLessThanOrEqual(17)
  })

  it('extends the tail to a moving head without settling it', () => {
    const path = new ChunkedDrawPath(Infinity)
    const head = { x: 123, y: 456, pressure: 0.5 }
    const withHead = path.update(points, 10, head).live
    expect(withHead).toBe(DrawModel.toSvgData([...points.slice(0, 10), head]))
    expect(path.update(points, 11).live).toBe(DrawModel.toSvgData(points.slice(0, 11)))
  })
})
