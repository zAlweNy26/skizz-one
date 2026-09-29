import { describe, expect, it } from 'vitest'
import { drawingFileName, drawingSvg } from '../../app/utils/drawingFile'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../shared/utils/protocol'

describe('drawingSvg', () => {
  it('wraps the canvas markup in the canvas\'s own user space, on white', () => {
    const svg = drawingSvg('<path d="M 1,2 L 3,4"></path>')
    expect(svg).toContain(`viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}"`)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg.indexOf('fill="#fff"')).toBeLessThan(svg.indexOf('<path'))
    expect(svg.endsWith('<path d="M 1,2 L 3,4"></path></svg>')).toBe(true)
  })
})

describe('drawingFileName', () => {
  it('slugs the word', () => {
    expect(drawingFileName('ice cream')).toBe('skizzone-ice-cream.svg')
    expect(drawingFileName('Caffè Latte')).toBe('skizzone-caffe-latte.svg')
  })

  it('falls back when nothing is left of the word', () => {
    expect(drawingFileName('!!!')).toBe('skizzone-drawing.svg')
  })
})
