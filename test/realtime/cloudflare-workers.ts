/** Stands in for the `cloudflare:workers` module, which only exists inside workerd. */

export class DurableObject<E = unknown> {
  constructor(readonly ctx: DurableObjectState, readonly env: E) {}
}

export const env = {}
