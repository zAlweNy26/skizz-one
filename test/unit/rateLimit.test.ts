import { describe, expect, it } from 'vitest'
import { RateLimiter } from '#realtime/rate-limit'

describe('rateLimiter', () => {
  it('lets a burst through, then refuses', () => {
    const limit = new RateLimiter(3, 1_000)
    expect([1, 2, 3, 4].map(() => limit.take('a', 0))).toEqual([true, true, true, false])
  })

  it('refills one token per interval, up to the burst', () => {
    const limit = new RateLimiter(2, 1_000)
    limit.take('a', 0)
    limit.take('a', 0)
    expect(limit.take('a', 500)).toBe(false)
    expect(limit.take('a', 1_000)).toBe(true)
    expect(limit.take('a', 1_000)).toBe(false)
    expect([limit.take('a', 60_000), limit.take('a', 60_000), limit.take('a', 60_000)]).toEqual([true, true, false])
  })

  it('keeps a bucket per key', () => {
    const limit = new RateLimiter(1, 1_000)
    expect(limit.take('a', 0)).toBe(true)
    expect(limit.take('b', 0)).toBe(true)
    expect(limit.take('a', 0)).toBe(false)
  })

  it('starts a forgotten key afresh', () => {
    const limit = new RateLimiter(1, 1_000)
    limit.take('a', 0)
    limit.forget('a')
    expect(limit.take('a', 0)).toBe(true)
  })
})
