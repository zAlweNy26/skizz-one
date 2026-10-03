# SkizzOne

A multiplayer drawing-and-guessing game. One player draws, everyone else guesses.

## Architecture

The app is **two Cloudflare Workers**:

| Worker | Source | Role |
| --- | --- | --- |
| `skizz` | repo root | The Nuxt SPA on [skizz.app](https://skizz.app). Serves assets and forwards `/parties/*` websocket upgrades. |
| `skizz-realtime` | `realtime/` | One `partyserver` Durable Object per game room: canvas relay, turns, scoring. |

The realtime half lives in its own Worker because **Durable Objects are the only
way fan-out works on Cloudflare**. Nitro's `cloudflare_module` preset compiles
websockets down to `crossws/adapters/cloudflare`, whose `publish()` is an empty
function — broadcasts silently do nothing in production even though they work
under `nuxi dev` (which uses the Node adapter). Nitro's own `cloudflare_durable`
preset does not help either: it hardcodes a single global DO instance named
`server`, and Cloudflare's guidance for realtime games is one DO *per room*.

`preset/entry.ts` replaces Nitro's generated Worker entry so that a websocket
upgrade can be handed to `skizz-realtime` over a service binding. This cannot be
done from a Nitro server route: `localFetch` round-trips through node-mock-http,
and a 101 response carrying a `webSocket` does not survive that.

### How the drawing streams

While a stroke is in progress the drawer sends only the points added since the
last frame, coalesced on a ~50ms window (Cloudflare's guidance for high-frequency
DO traffic). Watchers rebuild the path using drauu's own geometry helpers, so the
preview is produced by the same code that drew it. When the stroke ends, the
drawer sends the finished SVG node, which snaps every watcher to a byte-exact
copy and heals any drift.

Erase and bucket-fill rewrite existing nodes rather than adding one, so they
resync the whole canvas on commit instead of streaming. Undo, redo and clear do
the same. The DO caches the latest canvas so a late joiner sees the drawing
immediately.

The `<svg>` carries a fixed `viewBox` of `1600x900`. drauu maps pointers through
`getScreenCTM().inverse()`, so every client — phone or desktop — produces
coordinates in that same space, and path data is portable without rescaling.

## Setup

```bash
bun install
```

## Development

```bash
bun run dev
```

This starts two processes side by side: the app (`dev:app`, on :3000) and the
game rooms (`dev:realtime`, on :8787), since Durable Objects cannot run under
`nuxt dev`. The page connects straight to :8787. Either can be run alone with
`bun run dev:app` or `bun run dev:realtime`.

To run both as a single multi-worker session with the service binding wired up,
build first and then:

```bash
bun run build
bunx wrangler dev -c .output/server/wrangler.json -c realtime/wrangler.jsonc
```

## Deploy

Every push to `main` runs CI and, once it passes, deploys both Workers
(`.github/workflows/deploy.yml`). It needs two repository secrets:
`CLOUDFLARE_API_TOKEN` (with permission to edit Workers) and
`CLOUDFLARE_ACCOUNT_ID`. Deploys never overlap: while one runs, only the newest
waiting push is kept.

The public `/stats` page reads the game events the realtime worker writes to
Workers Analytics Engine. Give the app worker read access once, with an API
token that has only "Account Analytics: Read":

```bash
bunx wrangler secret put NUXT_ANALYTICS_ACCOUNT_ID --name skizz
bunx wrangler secret put NUXT_ANALYTICS_API_TOKEN --name skizz
```

Secrets survive deploys. Without them, `/stats` shows its empty state.

To deploy by hand, `skizz-realtime` must exist before the app's service binding
can resolve:

```bash
bun run deploy:realtime
bun run build && bunx wrangler deploy --cwd .output
```

Both Workers are configured entirely from their `wrangler.jsonc`: a deploy
replaces whatever was set in the dashboard. The app's custom domain
(`skizz.app`) is declared there too, so it stays attached.

`ALLOWED_ORIGINS` in `realtime/wrangler.jsonc` is set to `https://skizz.app`.
Browsers do not send a CORS preflight for websocket upgrades, so that variable
is the only thing gating who can open a room; add any new origin (another
domain, a preview URL) there and redeploy `skizz-realtime`.

When a change touches `shared/utils/protocol.ts`, deploy `skizz-realtime`
first, then the app.

## Tests

```bash
bun run test           # unit + realtime + nuxt
bun run test:realtime  # the GameRoom and Lobby Durable Objects
bun run test:e2e       # playwright
```

The realtime tests run the worker in Node against a small fake of the workerd
runtime (sockets, storage, alarms) on a fake clock, so whole games, the away
grace and hibernation play out in milliseconds. They check, among other
things, that the drawing reaches the watchers, that only the drawer can draw,
and that the word never leaks.
