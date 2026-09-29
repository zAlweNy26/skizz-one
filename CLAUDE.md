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
bunx nuxi typecheck          # app typecheck (vue-tsc)
bunx tsc -p realtime         # realtime worker typecheck (separate tsconfig)

bun run test                 # vitest: unit + nuxt projects (coverage is on by default)
bun run test:unit            # node-only tests in test/unit/
bun run test:nuxt            # tests needing the Nuxt env (happy-dom) in test/nuxt/
bunx vitest run test/unit/protocol.test.ts        # single file
bunx vitest run --project unit -t "quantisation"  # tests matching a name
bun run test:e2e             # playwright (test/e2e/)

# Realtime protocol e2e: two real WebSocket clients through a round.
bun run dev:realtime --port 8799   # terminal 1
bun run test:realtime              # terminal 2
```

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
  persisted to DO storage and re-hydrated in the constructor. The secret word
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
  masking, quantisation). The worker can't use Nuxt's `#shared` alias, so it
  imports this by **relative path** and it must stay dependency-free. Any
  protocol change touches both `realtime/src/game-room.ts` and the client.

Client side of a room (`app/pages/room/[code].vue` → `app/components/RoomGame.vue`):

- `useGameSocket` wraps `PartySocket`, owns game state/chat, and exposes the raw
  `ServerMessage` stream as an event hook. Player identity is a `playerId` in
  localStorage (survives refresh), not the connection id.
- `useDrawingSync` bridges drauu (`useDrauu`) and the socket. Drawer streams
  quantised points coalesced by `DRAW_FLUSH_MS`/`DRAW_FLUSH_POINTS`; watchers
  replay them at the drawer's pace via `app/utils/strokePlayback.ts`, then
  snap to the committed SVG. Erase/bucket (`OPAQUE_MODES`), undo/redo/clear
  resync the whole canvas instead of streaming. The canvas `viewBox` is fixed
  at `CANVAS_WIDTH`×`CANVAS_HEIGHT`, so coordinates are portable across devices.
- The page itself is a join gate: it asks for a name (prefilled from localStorage)
  and only mounts `RoomGame.vue` once the tab has joined that room. Joined rooms
  live in sessionStorage (`useJoinedRooms`), so a refresh or entering from `/`
  skips the gate.

## Conventions

- **i18n:** UI language is per player (`@nuxtjs/i18n`, `no_prefix`, locales in
  `i18n/locales/{en,it}.json`) and is unrelated to the room's *word* language
  (`LANGUAGES` in the protocol, lists in `realtime/src/words/`). The server
  never sends display text for announcements — it sends a `LogKey` + params and
  each client renders `log.<key>`. Add new keys to every locale file.
- **Adding a word language:** add it to `LANGUAGES` in the protocol and a list
  file in `realtime/src/words/`. Words: concrete, drawable, lowercase, no
  apostrophes or hyphens.
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
  - Colors: `primary` bordeaux, `secondary` tangerine (call to action only), `neutral` mulberry.
  - Tokens: `--stage`, `--paper`, `--ink`, `--on-stage`, `--ink-fixed` and `--chip`/`--on-chip` (controls on the stage) live in
    `app/assets/css/theme.css` (with the colour ramps, custom utilities and base
    styles); component defaults are in `app/app.config.ts`. `main.css` only
    imports Tailwind, Nuxt UI and `theme.css`.
  - `@shadcn/lint` enforces `no-unknown-classes` and `no-arbitrary-values`
    (layout values such as grid columns may stay arbitrary; radius, type and
    colour must come from the theme). It reads the theme through
    `components.json` → `app/assets/css/lint.css`, a lint-only copy of the
    stylesheet stack, because it can't resolve Nuxt UI's `#build/ui.css` alias.
    Add new design tokens to `theme.css`, never to `lint.css`.
  - Panels are drawn with `SketchFrame.vue` (roughjs). Text goes on paper, not on the bordeaux stage.
  - Phones are first-class. Below `lg` the room is one non-scrolling screen
    (`h-dvh`): top bar with a "⋯" menu, `PlayerStrip` (bottom sheet for the
    full list), word and timer, canvas, a one-row toolbar with colour/size in a
    bottom sheet, and the chat filling the rest. In landscape below `lg`
    (`phone-landscape:` variant) it's toolbar | canvas | side column, with the
    canvas sized by `canvas-landscape` in `theme.css`. From `lg` up it's the
    three-column grid. Keep tap targets ≥44px (`size-11`/`min-h-11`) and check
    changes at 390×844.
- **fallow:** entries or class members only reached by frameworks (e.g. new
  `partyserver` lifecycle hooks, `preset/entry.ts`) must be listed in
  `.fallowrc.json`, or they're reported as unused.

## Deploy

Deploy `skizz-realtime` first (`bun run deploy:realtime`), then the app with
`bun run build && bunx wrangler deploy --cwd .output`. Don't use `nuxthub deploy`
for the app: it doesn't upload `wrangler.jsonc`, so the `REALTIME` service
binding is lost.
