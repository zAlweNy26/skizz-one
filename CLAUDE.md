# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

SkizzOne is a multiplayer drawing-and-guessing game: Nuxt 4 SPA + a Cloudflare
Durable Object worker. `README.md` explains *why* the architecture looks the way
it does (crossws `publish()` is a no-op on Cloudflare, etc.) — read it before
changing how the two workers talk.

## Git workflow

- **Never create git worktrees.** Work directly in the current checkout, on
  whatever branch is checked out. This applies to background jobs too: do not
  call `EnterWorktree` or `git worktree add`. `.claude/settings.json` turns
  off the background-job isolation guard (`worktree.bgIsolation: "none"`) so
  this works.
- Commit follow-up work onto the current branch. Only create a new branch when
  explicitly asked.

## Commands

Package manager is **bun**.

```bash
bun run dev                  # app (:3000) + realtime worker (:8787) in parallel
bun run lint / lint:fix      # eslint (@antfu/eslint-config + @shadcn/lint Tailwind rules)
bun run fallow               # dead code / unused deps check (.fallowrc.json)
bun run fallow:health        # complexity report, with CRAP scores from fresh vitest coverage
bunx nuxi typecheck          # app typecheck (vue-tsc)
bunx tsc -p realtime         # realtime worker typecheck (separate tsconfig)

bun run test                 # vitest: unit, realtime and nuxt projects (coverage is on by default)
bun run test:unit            # node-only tests in test/unit/
bun run test:realtime        # GameRoom/Lobby Durable Object tests in test/realtime/
bun run test:nuxt            # tests needing the Nuxt env (happy-dom) in test/nuxt/
bunx vitest run test/unit/protocol.test.ts        # single file
bunx vitest run --project unit -t "quantisation"  # tests matching a name
bun run test:e2e             # playwright (test/e2e/)
```

`test/realtime/` runs the realtime worker in Node: `runtime.ts` fakes the
workerd pieces partyserver uses (hibernatable sockets, storage, alarms,
`cloudflare:workers`), and `harness.ts` drives the worker's `fetch` and the
Durable Objects' `webSocketMessage`/`webSocketClose`/`alarm` on a fake clock.
`world.advance(ms)` fires due alarms in order; `world.hibernate()` drops a
room's in-memory object so the next event rebuilds it from storage. The fakes
follow partyserver's internals, so check them when upgrading partyserver.

CI (`.github/workflows/ci.yml`) runs lint, `fallow dead-code`/`dupes`, both
typechecks, vitest and Playwright on every pull request (root `*.md` and dot
folders alone don't trigger it, nor a deploy); `fallow health` is
reported but never fails the run. Playwright builds the app with Nitro's
`node-server` preset (`playwright.config.ts`), since a `cloudflare_module`
build can't run in Node, and starts its own realtime worker on port 8799
(any origin allowed) that the e2e build's client and CSP point at.
`test/e2e/game.spec.ts` plays a turn between two browser contexts and fails
on any console error or CSP violation.

`realtime/.dev.vars` overrides `ALLOWED_ORIGINS` for `wrangler dev` so the
local app on :3000 can connect; `realtime/wrangler.jsonc` only allows
`https://skizz.app`, which is what deploys.

The realtime dev port is pinned to 8787 in `realtime/wrangler.jsonc` because the
app's dev `realtimeHost` points there; if the port is busy, wrangler would
silently move and the page would talk to a stale worker.

## Architecture

Two Workers, one shared protocol:

- **App** (repo root, `app/`) — `ssr: false` Nuxt SPA on Nitro's
  `cloudflare_module` preset. In production, `preset/entry.ts` replaces Nitro's
  generated entry to forward `/parties/*` WebSocket upgrades to the realtime
  worker via the `REALTIME` service binding (`wrangler.jsonc`). That entry is
  wired under `$production` only; in dev the client connects straight to
  `localhost:8787` (`runtimeConfig.public.realtimeHost`).
- **Realtime** (`realtime/`, worker `skizz-realtime`) — `partyserver`, one
  `GameRoom` Durable Object per room, reached at `/parties/game-room/:roomId`
  (routing uses the kebab-cased *binding* name). Owns turns, scoring, timers
  (DO alarms), pause votes, and the cached canvas. Hibernation is on; state is
  persisted to DO storage and re-hydrated in the constructor. `game-room.ts`
  is only the Durable Object shell (storage, sockets, rate limits, lobby
  listing); the game is plain functions in `realtime/src/room/` that take the
  `Room` interface from `context.ts`: `state.ts` (types and pure helpers),
  `round.ts` (turns, hints, countdowns), `pause.ts`, `presence.ts` (joining,
  leaving, away grace), `kick.ts` and `messages.ts` (one handler per client
  message). Each module only imports the ones listed before it. The secret word
  never leaves the DO except in the drawer's copy of the `turn` message.
  `ALLOWED_ORIGINS` is the only origin gate (no CORS preflight for WS upgrades).
  A second DO, `Lobby` (`/parties/lobby/global`, one instance), lists public
  rooms: each `GameRoom` pushes its listing via the `update` RPC and the home
  page subscribes over a WebSocket.
- **PWA** — `@vite-pwa/nuxt` (`pwa` in `nuxt.config.ts`, `autoUpdate`) owns the
  manifest (`/manifest.webmanifest`) and the Workbox service worker, which is
  only built in production. The SPA shell `/` is rendered by the Worker rather
  than emitted to `public/`, so it's precached via `additionalManifestEntries`
  with a per-build revision; `/parties/*` is excluded from the navigation fallback.
- **`shared/utils/protocol.ts`** — the wire protocol (`ClientMessage` /
  `ServerMessage`), shared constants, and pure helpers (guess normalisation,
  masking, quantisation). The worker imports it as `#shared/utils/protocol`
  too, resolved by the `paths` in `realtime/tsconfig.json` (which esbuild
  follows when Wrangler bundles), so it must stay dependency-free: it can't
  import other `shared/` files either, since esbuild resolves `#shared/` from
  the importing file's tsconfig. Any protocol change touches both
  `realtime/src/game-room.ts` and the client; bump `PROTOCOL_VERSION` when
  it would break a client or worker built before it, so the room tells stale
  tabs to reload instead of talking past them.
- **`shared/utils/profanity.ts`** — the name filter: the join forms refuse a
  blocked name and the worker masks one that gets through. `BLOCKLIST` is a
  short English and Italian list kept to whole words, so real names and
  innocent words that contain one (`Scunthorpe`, `Dick Smith`) pass; matching
  sees through accents, stretched letters and leetspeak. Chat isn't filtered.
- **Security headers** — `nuxt-security` (`security` in `nuxt.config.ts`)
  sets an enforced CSP with a per-response nonce on the page shell, plus
  the other security headers. Its request middleware (rate limiter, XSS
  validator, size limiter, CORS) and COEP are off. A new third-party origin
  (script, image, font, fetch) must be added to the matching directive, or
  the browser blocks it.
- **Observability** — both workers have Workers Logs on. Browser errors go
  through `app/plugins/error-report.client.ts` (production only) to
  `server/api/errors.post.ts`, which logs them as `type: client-error` with
  the room code stripped from the path.
- **Analytics** — `GameRoom` writes `game_started`, `game_finished` and
  `turn_ended` events to the `ANALYTICS` Analytics Engine dataset
  (`skizz_games`); columns are listed in `realtime/src/analytics.ts`. The
  public `/stats` page reads them through `server/api/stats.get.ts`
  (`server/utils/analytics.ts` runs the SQL, `shared/utils/stats.ts`
  summarises it, cached 10 minutes). The app needs the
  `NUXT_ANALYTICS_ACCOUNT_ID` and `NUXT_ANALYTICS_API_TOKEN` Worker secrets;
  without them `/stats` shows its empty state. Never write player names,
  ids, tokens or chat into an event.

Client side of a room (`app/pages/room/[code].vue` → `app/components/room/Game.vue`, i.e. `<RoomGame>`):

- `useGameSocket` wraps `PartySocket`, owns game state/chat, and exposes the raw
  `ServerMessage` stream as an event hook. Player identity is a `playerId` in
  localStorage (survives refresh), not the connection id.
- `useDrawingSync` bridges drauu (`useDrauu`) and the socket. Drawer streams
  quantised points coalesced by `DRAW_FLUSH_MS`/`DRAW_FLUSH_POINTS`; watchers
  replay them at the drawer's pace via `app/utils/drawing.ts`, then
  snap to the committed SVG. Erase/bucket (`OPAQUE_MODES`), undo/redo/clear
  resync the whole canvas instead of streaming. The canvas `viewBox` is fixed
  at `CANVAS_WIDTH`×`CANVAS_HEIGHT`, so coordinates are portable across devices.
- `RoomGame` owns the page grid (with its `phone-landscape:` placement
  classes, kept on each child where it's used), the canvas and the socket
  wiring. The pieces around it are `RoomHeader`, `RoomLobbyCard`, `WordCard`,
  `DrawingToolbar` and `RoomTurnedAway`; the drawer's palette, tools, cursor
  and keyboard shortcuts come from `useDrawingTools`.
- The page itself is a join gate: it asks for a name (prefilled from localStorage)
  and only mounts `RoomGame` once the tab has joined that room. Joined rooms
  live in sessionStorage (`useJoinedRooms`), so a refresh or entering from `/`
  skips the gate.

## Conventions

- **Imports:** no relative imports. Use `~/` for `app/`, `#shared/` for
  `shared/`, `#realtime/` for `realtime/src/` and `#test/` for `test/`; the
  worker gets them from `realtime/tsconfig.json` `paths`, tests from
  `vitest.config.ts`. Only
  `nuxt.config.ts` (loaded before Nuxt's aliases exist) and
  `app/assets/css/lint.css` (read by `@shadcn/lint`) stay relative.
- **i18n:** UI language is per player (`@nuxtjs/i18n`, `no_prefix`, locales in
  `i18n/locales/{en,it}.json`) and is unrelated to the room's *word* language
  (`LANGUAGES` in the protocol, lists in `realtime/src/words/`). The server
  never sends display text for announcements — it sends a `LogKey` + params and
  each client renders `log.<key>`. Add new keys to every locale file.
- **Adding a word language:** add it to `LANGUAGES` in the protocol and a list
  file in `realtime/src/words/`. Words: concrete, drawable, lowercase (German
  nouns too), letters and single spaces only: write `arc-en-ciel` as
  `arc en ciel`. `normalizeGuess` reads hyphens and apostrophes as spaces and
  matches `ß`/`ss` and `œ`/`oe`, so players can type either.
  `test/unit/words.test.ts` checks every list.
- **Style:** enforced by eslint (`eslint.config.mjs`) and auto-applied to every
  file Claude edits by the PostToolUse hook in `.claude/settings.json`:
  - 2-space indent, single quotes, no semicolons.
  - `curly: multi-or-nest`: single-statement bodies go without braces, e.g. `if (x) return`.
  - 1TBS braces: `} else {` and `} catch {` on the closing-brace line.
  - Top-level functions are `function` declarations, not `const` arrows.
  - `interface` for object shapes, `type` for unions and aliases. No `any`.
  - No interface for a shape used only once: let the function's inferred return
    type carry it (derive it with `ReturnType<typeof fn>` / `Pick<…>` where needed).
  - Use a VueUse composable whenever one covers the job (timers, listeners,
    storage, media queries, focus, clipboard…) instead of hand-rolling it.
  - camelCase props and events in Vue templates (`:drawerId`, `@update:modelValue`).
  - Lines up to 120 chars. This is only a warning: max-len can't auto-fix, so wrap long template `class` lists by hand.
  Run `bun run lint:fix` rather than formatting by hand.
- **Comments:** keep them to a minimum. Don't write comments that explain why
  something was done (rationale, platform backstory, history) or that restate
  what the code, a name or a class list already says. Tool directives
  (`eslint-disable`, `@ts-expect-error`) and a short note for a fact a name
  can't carry (units, formats) are fine.
- **UI:** Nuxt UI v4 components. The visual system ("The Sketchbook Party")
  is specified in `DESIGN.md` and the product context in `PRODUCT.md`; read both
  before UI work.
  - **Nuxt UI first.** Before writing a raw element (`<button>`, `<input>`,
    `<kbd>`, a badge/chip `<span>`, an overlay or list wrapper) or a
    hand-rolled component, check whether a Nuxt UI component or prop covers it
    (`UButton`, `UChip`/`UAvatar :chip`, `UKbd`, `UBadge`, `UColorModeButton`,
    `USlider :tooltip`…); use the `nuxt-ui` MCP/skill to look it up. Restyle it
    through `app.config.ts` or `:ui` rather than replacing it. Go custom only
    for what Nuxt UI can't do (roughjs frames via `SketchFrame`, the drawing
    canvas), and use `useColorMode` rather than VueUse's `useDark`.
  - **Look comes from props only.** Size, colour and variant come from
    `size`, `color`, `variant` and, for toggles, `active`/`activeColor`/
    `activeVariant`. Never restyle a Nuxt UI instance with size, colour,
    background, ring or text classes or `:ui` overrides of them; classes are
    for layout, font family/weight and visibility. Controls on the stage are
    `color="neutral" variant="outline"`. Button/input `lg` is the 44px tap
    target, button `xl` the call to action. A size that changes at `lg`
    switches the prop via `useIsDesktop()`. Change `app.config.ts` only for a
    rule every instance follows, never for one instance; see "Nuxt UI Props"
    in `DESIGN.md`.
  - Colors: `primary` bordeaux, `secondary` tangerine (call to action only), `neutral` mulberry.
  - Tokens: `--stage`, `--paper`, `--ink`, `--on-stage` and `--ink-fixed` live in
    `app/assets/css/theme.css` (with the colour ramps, custom utilities and base
    styles); component defaults are in `app/app.config.ts`. `main.css` only
    imports Tailwind, Nuxt UI and `theme.css`.
  - `@shadcn/lint` enforces `no-unknown-classes` and `no-arbitrary-values`
    (layout values such as grid columns may stay arbitrary; radius, type and
    colour must come from the theme). It reads the theme through
    `components.json` → `app/assets/css/lint.css`, a lint-only copy of the
    stylesheet stack, because it can't resolve Nuxt UI's `#build/ui.css` alias.
    Add new design tokens to `theme.css`, never to `lint.css`.
  - Icons are bundled at build time (`icon` in `nuxt.config.ts`); nothing is
    fetched. Write each name as a full `i-lucide-…` literal in a `.vue` file so
    the scan finds it: a name built at runtime or only in a `.ts` file isn't
    bundled and renders blank. Only Lucide (`@iconify-json/lucide`) is installed.
  - Components that share a name prefix live in a folder named after it, so
    Nuxt keeps the full name: `components/room/Header.vue` is `<RoomHeader>`,
    `components/drawing/Toolbar.vue` is `<DrawingToolbar>`. Add a new `Room…`,
    `Drawing…` or `Player…` component to its folder.
  - Panels are drawn with `SketchFrame.vue` (roughjs). Text goes on paper, not on the bordeaux stage.
  - Phones are first-class. Below `lg` the room is one non-scrolling screen
    (`h-dvh`): top bar with a "⋯" menu, `PlayerStrip` (bottom sheet for the
    full list), word and timer, canvas, a one-row toolbar with colour/size in a
    bottom sheet, and the chat filling the rest. In landscape below `lg`
    (`phone-landscape:` variant) it's toolbar | canvas | side column, with the
    canvas sized by `canvas-landscape` in `theme.css`. From `lg` up it's the
    three-column grid. Keep tap targets ≥44px (`size="lg"` or larger) and check
    changes at 390×844.
- **fallow:** entries or class members only reached by frameworks (e.g. new
  `partyserver` lifecycle hooks, `preset/entry.ts`) must be listed in
  `.fallowrc.json`, or they're reported as unused.

## Deploy

Every push to `main` deploys once CI passes (`.github/workflows/deploy.yml`,
which needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository
secrets). By hand: deploy `skizz-realtime` first (`bun run deploy:realtime`), then the app with
`bun run build && bunx wrangler deploy --cwd .output`.
