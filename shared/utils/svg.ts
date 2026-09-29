const ELEMENTS = new Set(['g', 'path', 'line', 'rect', 'ellipse', 'defs', 'marker', 'mask'])

const ATTRIBUTES = new Set([
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'rx',
  'ry',
  'width',
  'height',
  'viewBox',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'mask',
  'maskUnits',
  'marker-end',
  'id',
  'refX',
  'refY',
  'markerWidth',
  'markerHeight',
  'orient',
  'data-sync-id',
  'data-drauu-fill',
  'data-drauu-eraser',
  'data-drauu_index',
])

/** Attributes that may point at another node on the canvas, as `url(#id)`. */
const REFERENCE_ATTRIBUTES = new Set(['fill', 'stroke', 'mask', 'marker-end'])

const TAG = /\s*<(\/?)([a-z]+)((?:\s+[a-z][\w-]*="[^"<>&]*")*)\s*(\/?)>/iy
const ATTRIBUTE = /([a-z][\w-]*)="([^"]*)"/gi
const REFERENCE = /^url\(#[\w-]+\)$/
const IDENTIFIER = /^[\w-]+$/

function isSafeAttribute(name: string, value: string) {
  if (!ATTRIBUTES.has(name)) return false
  if (name === 'id') return IDENTIFIER.test(value)
  if (/url\(/i.test(value)) return REFERENCE_ATTRIBUTES.has(name) && REFERENCE.test(value)
  return true
}

/** One tag rebuilt, or null if it is not allowed or does not close what is open. */
function cleanTag([, closing, name = '', attributes = '', selfClosing]: RegExpExecArray, open: string[]) {
  if (!ELEMENTS.has(name)) return null
  if (closing) return attributes || selfClosing || open.pop() !== name ? null : `</${name}>`

  for (const [, attribute = '', value = ''] of attributes.matchAll(ATTRIBUTE))
    if (!isSafeAttribute(attribute, value)) return null

  if (!selfClosing) open.push(name)
  return `<${name}${attributes}${selfClosing ? '/' : ''}>`
}

/**
 * Rebuild drawing markup from the elements and attributes drauu produces, or
 * return null if it holds anything else (scripts, handlers, links, text).
 */
export function sanitizeSvg(markup: unknown): string | null {
  if (typeof markup !== 'string') return null
  const source = markup.trim()
  const open: string[] = []
  let clean = ''

  TAG.lastIndex = 0
  while (TAG.lastIndex < source.length) {
    const match = TAG.exec(source)
    const tag = match && cleanTag(match, open)
    if (tag === null) return null
    clean += tag
  }

  return open.length ? null : clean
}
