/** Longest error or CSP report body the app accepts, in bytes. */
export const MAX_REPORT_BYTES = 8_192

/** A page path or URL reduced to its path, with the room code taken out, e.g. `/room/:code`. */
export function reportPath(url: string) {
  let path = url
  try {
    path = new URL(url, 'https://skizz.app').pathname
  } catch {}
  return path.replace(/^\/room\/[^/]+/, '/room/:code')
}

/** `value` if it is a string, cut to `max` characters; otherwise undefined. */
export function clip(value: unknown, max: number) {
  return typeof value === 'string' ? value.slice(0, max) : undefined
}
