import { CANVAS_HEIGHT, CANVAS_WIDTH } from '#shared/utils/protocol'

/** A standalone SVG document for the canvas's inner markup, on white paper. */
export function drawingSvg(inner: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" `
    + `width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"><rect width="100%" height="100%" fill="#fff"/>${inner}</svg>`
}

/** A file name for a drawing, e.g. `skizzone-ice-cream.svg`. */
export function drawingFileName(word: string) {
  const slug = word.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `skizzone-${slug.replace(/^-|-$/g, '') || 'drawing'}.svg`
}
