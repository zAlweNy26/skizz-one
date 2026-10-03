import { afterEach, beforeEach, vi } from 'vitest'
import { installRuntime } from '#test/realtime/runtime'

installRuntime()

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-01-01T12:00:00Z'), toFake: ['Date', 'setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
