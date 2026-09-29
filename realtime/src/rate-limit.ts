/** A token bucket per key: `burst` messages at once, then one every `refillMs`. */
export class RateLimiter {
  #buckets = new Map<string, { tokens: number, at: number }>()

  constructor(readonly burst: number, readonly refillMs: number) {}

  /** Spend a token for `key`, or return false if it has none left. */
  take(key: string, now = Date.now()) {
    const bucket = this.#buckets.get(key) ?? { tokens: this.burst, at: now }
    const tokens = Math.min(this.burst, bucket.tokens + (now - bucket.at) / this.refillMs)
    const allowed = tokens >= 1
    this.#buckets.set(key, { tokens: allowed ? tokens - 1 : tokens, at: now })
    return allowed
  }

  forget(key: string) {
    this.#buckets.delete(key)
  }
}
