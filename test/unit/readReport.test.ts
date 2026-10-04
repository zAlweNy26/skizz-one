import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRecord, readReport } from '~~/server/utils/report'
import { MAX_REPORT_BYTES } from '#shared/utils/reports'

const event = {} as H3Event

function request(body: string | undefined, length = body?.length) {
  vi.stubGlobal('getRequestHeader', () => (length === undefined ? undefined : String(length)))
  vi.stubGlobal('readRawBody', async () => body)
}

afterEach(() => vi.unstubAllGlobals())

describe('readReport', () => {
  it('parses a JSON body', async () => {
    request('{"message":"boom"}')
    expect(await readReport(event)).toEqual({ message: 'boom' })
  })

  it('drops a body that says or turns out to be too big', async () => {
    request('{}', MAX_REPORT_BYTES + 1)
    expect(await readReport(event)).toBeNull()
    request(`"${'x'.repeat(MAX_REPORT_BYTES)}"`, 0)
    expect(await readReport(event)).toBeNull()
  })

  it('drops a missing or malformed body', async () => {
    request(undefined)
    expect(await readReport(event)).toBeNull()
    request('{not json')
    expect(await readReport(event)).toBeNull()
  })
})

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(isRecord('x')).toBe(false)
  })
})
