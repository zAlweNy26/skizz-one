import { describe, expect, it } from 'vitest'
import { clip, reportPath } from '#shared/utils/reports'

describe('reportPath', () => {
  it('keeps the path and drops the room code, query and host', () => {
    expect(reportPath('/room/a1b2c3d4')).toBe('/room/:code')
    expect(reportPath('https://skizz.app/room/a1b2c3d4?public=1#x')).toBe('/room/:code')
    expect(reportPath('/changelog')).toBe('/changelog')
    expect(reportPath('')).toBe('/')
  })
})

describe('clip', () => {
  it('cuts strings and drops anything else', () => {
    expect(clip('abcdef', 3)).toBe('abc')
    expect(clip(42, 3)).toBeUndefined()
    expect(clip(null, 3)).toBeUndefined()
  })
})
