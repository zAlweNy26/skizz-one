import type { H3Event } from 'h3'
import { MAX_REPORT_BYTES } from '#shared/utils/reports'

/** The request's JSON body, or null if it is missing, too big or not JSON. */
export async function readReport(event: H3Event): Promise<unknown> {
  if (Number(getRequestHeader(event, 'content-length') ?? 0) > MAX_REPORT_BYTES) return null
  const raw = await readRawBody(event, 'utf8')
  if (!raw || raw.length > MAX_REPORT_BYTES) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
