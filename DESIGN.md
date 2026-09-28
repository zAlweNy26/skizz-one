---
name: SkizzOne
description: A multiplayer drawing-and-guessing game, drawn in marker on bordeaux.
colors:
  bordeaux: "oklch(0.35 0.13 16)"
  bordeaux-glow: "oklch(0.8 0.08 16)"
  wine-night: "oklch(0.2 0.06 16)"
  tangerine-marker: "oklch(0.78 0.16 60)"
  tangerine-note: "oklch(0.89 0.09 65)"
  mulberry-ink: "oklch(0.25 0.045 16)"
  paper-white: "oklch(0.99 0.004 16)"
  pencil-grey: "oklch(0.47 0.03 16)"
  night-paper: "oklch(0.31 0.04 16)"
  chalk: "oklch(0.96 0.008 16)"
  mint-guessed: "oklch(0.508 0.118 165.6)"
typography:
  display:
    fontFamily: "Shantell Sans, ui-rounded, system-ui, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'INFM' 90, 'BNCE' 60"
  headline:
    fontFamily: "Shantell Sans, ui-rounded, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
    fontVariation: "'INFM' 90, 'BNCE' 60"
  word:
    fontFamily: "Shantell Sans, ui-rounded, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    letterSpacing: "0.25em"
    fontVariation: "'INFM' 100, 'BNCE' 100"
  body:
    fontFamily: "Shantell Sans, ui-rounded, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontVariation: "'INFM' 20"
  label:
    fontFamily: "Shantell Sans, ui-rounded, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
rounded:
  sketch-control: "14px 9px 16px 8px / 9px 15px 8px 13px"
  field: "0.625rem"
  canvas: "10px"
  panel: "18px"
  card: "22px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "32px"
components:
  button-cta:
    backgroundColor: "{colors.tangerine-marker}"
    textColor: "{colors.mulberry-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sketch-control}"
    padding: "12px 20px"
  button-primary:
    backgroundColor: "{colors.bordeaux}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.sketch-control}"
    padding: "8px 14px"
  button-ink:
    backgroundColor: "{colors.mulberry-ink}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.sketch-control}"
    padding: "8px 12px"
  input:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.mulberry-ink}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
  sketch-panel:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.mulberry-ink}"
    rounded: "{rounded.panel}"
    padding: "12px"
  player-row-drawing:
    backgroundColor: "{colors.tangerine-note}"
    textColor: "{colors.mulberry-ink}"
    rounded: "{rounded.sketch-control}"
    padding: "8px 16px 8px 12px"
---

# Design System: SkizzOne

## 1. Overview

**Creative North Star: "The Sketchbook Party"**

SkizzOne is a friend's sketchbook passed around a party. Every panel is a scrap
of paper on a bordeaux tablecloth, outlined by the same shaky marker that draws on
the canvas. The chrome is loud, but in a good-natured way, and it always makes
room for the drawing. Tangerine is the sticky note that says "press me", mulberry
ink is the pen, and the bordeaux stage is the party happening around it.

The hand-drawn line is the system's one committed idea. Panels, the canvas
frame, the timer ring and the underline under the wordmark are drawn with
`roughjs` (`SketchFrame.vue`), seeded per element so each keeps its own wobble.
Buttons can't be redrawn at every size, so they carry the same feel through
uneven hand-rounded corners and an inked ring. Dark mode isn't an inverted
copy: it turns the paper to night paper and the pen to chalk, so the same
lines read as a chalkboard.

The system rejects what PRODUCT.md rejects: the **SaaS dashboard** of neutral
grey cards and component-library defaults (the old look), the **childish crayon
app**, the **ad-cluttered, skribbl-era web game**, and **neon gamer RGB**.

**Key Characteristics:**
- A committed bordeaux stage behind everything. Content sits on paper, never directly on the stage.
- One pen: mulberry ink outlines, drawn by roughjs, so the chrome and the canvas feel like one world.
- One type family, Shantell Sans, turned up to full wobble for display and kept calm for body text.
- Tangerine appears only on the main call to action on each screen.
- Motion only for state: a press squash, a new-turn pop, a last-ten-seconds tick.

## 2. Colors: The Bordeaux Palette

A real bordeaux stage, paper-white panels, mulberry ink, and one tangerine marker
for the action that matters.

### Primary
- **Bordeaux** (oklch(0.35 0.13 16), #6e0b22): a real wine red. It's the page background behind every surface in light mode (paper-white text on it: 11.7:1) and also Nuxt UI's `primary` there: links, focus rings, the selected tool, player names in chat, "(You)" markers (11.7:1 on paper).
- **Bordeaux Glow** (oklch(0.8 0.08 16)): `primary` in dark mode, a rosé that reads on night paper (6.9:1).
- **Wine Night** (oklch(0.2 0.06 16)): the stage in dark mode, nearly black wine.

### Secondary
- **Tangerine Marker** (oklch(0.78 0.16 60)): Nuxt UI's `secondary`. Solid call-to-action buttons only (Create a room, Start game, Join when invited), always with mulberry-ink text (7.8:1). It's never used as text: it fails on paper.
- **Tangerine Note** (oklch(0.89 0.09 65)): a soft sticky-note fill for the current drawer's row, the avatar ring and the lobby icon.

### Tertiary
- **Mint Guessed** (oklch(0.508 0.118 165.6)): `success`. Private chat, the "guessed" row tint (mixed 55% into paper), and confirmation messages. It's always paired with a lock or check icon.

### Neutral
- **Mulberry Ink** (oklch(0.25 0.045 16)): body text and every sketched line in light mode (15.8:1 on paper). Also the fixed-dark text on tangerine in both themes.
- **Paper White** (oklch(0.99 0.004 16)): panel surfaces and inputs. It's chroma-tinted toward bordeaux, never toward cream.
- **Pencil Grey** (oklch(0.47 0.03 16)): muted text, placeholders and system lines (6.7:1). Nothing lighter carries text.
- **Night Paper** (oklch(0.31 0.04 16)): panel surfaces in dark mode.
- **Chalk** (oklch(0.96 0.008 16)): text and sketched lines in dark mode (11.9:1 on night paper).

### Named Rules
**The Paper Rule.** Text lives on paper. The bordeaux stage carries only the wordmark, the round counter and bold header controls; anything smaller than 18px or lighter than semibold goes on a paper panel.

**The One Marker Rule.** Tangerine marks the single most important action on a screen. If two tangerine buttons are visible at once, one of them is wrong.

## 3. Typography

**Display Font:** Shantell Sans (with ui-rounded, system-ui)
**Body Font:** Shantell Sans, the same family
**Label/Mono Font:** the system monospace, only for the room code and letter counts

**Character:** A marker font with variable informality (`INFM`) and bounce (`BNCE`) axes. The same family shouts at full wobble in the wordmark and settles down for chat, so the whole UI reads as one hand.

### Hierarchy
- **Display** (800, 4.5rem / 3.75rem on phones, line-height 1, INFM 90 · BNCE 60): the SkizzOne wordmark only, rotated −3°.
- **Headline** (700, 1.5rem, INFM 90 · BNCE 60): panel titles such as "Waiting to start".
- **Word** (700, 1.875rem, tracking 0.25em, INFM 100 · BNCE 100): the secret word or its blanks. The loudest text on the room screen, deliberately.
- **Body** (400, 1rem, line-height 1.5, INFM 20): chat, descriptions, player names.
- **Label** (600, 0.875rem): buttons, form labels, points.

### Named Rules
**The One Hand Rule.** Never add a second typeface for flavour. Emphasis comes from Shantell's weight and its INFM/BNCE axes (`font-display`, `font-bouncy`), not from a new family.

## 4. Elevation

The system has no drop shadows. Depth comes from the sketched ink outline: a
paper panel with a 2–3.5px roughjs stroke sits "on top of" the stage the way
paper sits on a table. The only blur is the pause overlay over the canvas,
which hides the drawing while the game is frozen.

### Named Rules
**The Drawn-Not-Lifted Rule.** Never add `box-shadow` for depth. If an element needs to stand out, give it a sketched outline, a tinted fill or a heavier stroke, never a shadow.

## 5. Components

### Buttons
- **Shape:** hand-rounded corners, each one a little different (14px 9px 16px 8px / 9px 15px 8px 13px).
- **Call to action:** Tangerine Marker fill, mulberry-ink label, 2px inked ring (mulberry ink at 85%). One per screen.
- **Primary:** Bordeaux fill, paper text, the same inked ring. Used for the selected tool and "Join".
- **Stage chip:** controls that sit directly on the stage (Pause, room code) use the `--chip` / `--on-chip` tokens: a paper chip with ink text in light mode, a chalk chip in dark mode. Dark ink would vanish against bordeaux (1.35:1).
- **Soft:** a translucent tint and no ring, for secondary tools (undo, redo, brush size, random name).
- **Press:** a 150ms squash to 95% scale on `:active` (ease-out-quart), removed under reduced motion. No hover lift, no elastic.

### Inputs / Fields
- **Style:** paper fill, 2px inset ring of ink at 35%, 0.625rem radius, size `lg`.
- **Focus:** the bordeaux focus ring, traced over once by an unsteady hand: a second inset stroke offset by 1.5px (`sketch-field` in theme.css) makes the line heavier on two sides. It never grows outside the field. The chat input switches to the mint "highlight" ring and a lock icon while it's the private channel, and the extra stroke follows that colour.
- **Leading icon:** says who reads what you type: a speech bubble (public), a lightbulb (guessing), a lock (private) or pause (on hold).

### Sketch Panel (signature component)
`SketchFrame.vue` draws a seeded roughjs outline behind any content, in three shapes: `box` for panels, `circle` for the timer and avatar ring, and `underline` for the wordmark scribble. Colours are passed as CSS values (`var(--paper)`, `var(--ink)`), so theme switches don't redraw it. It redraws on resize and keeps the same seed, so the wobble never jitters.

### Player Rows
Each player is a small sketched card: rank, avatar, name, points. The drawer's row is filled with Tangerine Note plus a pencil icon, a player who has guessed gets a mint tint plus a check badge, and disconnected players fade to 55%. State is never shown by colour alone.

### Word Card & Timer Ring
The word card sits centred above the canvas and pops in (280ms, ease-out-expo) at every new turn. The timer is a sketched circle beside it that turns amber while paused and red for the last ten seconds, ticking once per second. Both are hidden in the lobby.

### Phone Room
Below the `lg` breakpoint the room is one screen that fits the viewport and doesn't scroll, in this order: a compact top bar (wordmark, "1/3", a "⋯" menu holding pause, share and theme), the player strip (avatars with crown, pencil and check badges; tapping opens the full list in a bottom sheet), the word card and timer, the canvas at full width, the drawer's one-row toolbar (colour and size live in a bottom sheet), and the chat filling what's left, with its input on top (right under the canvas) and the newest message first. The player strip hides while the chat input is focused, so the on-screen keyboard never pushes the canvas away. Every control is at least 44px.

## 6. Do's and Don'ts

### Do:
- **Do** put every paragraph, list and input on a paper panel; only the wordmark, round counter and bold controls go on the bordeaux stage.
- **Do** outline new panels with `SketchFrame`, with a 2–3.5px stroke and a 14–22px radius.
- **Do** pair every state colour with an icon or label: pencil for drawing, check for guessed, lock for private, pause for paused.
- **Do** give every animation a `prefers-reduced-motion: no-preference` guard; the reduced version is instant.
- **Do** check text contrast against the ratios above (AA ≥4.5:1) before adding a colour pairing.
- **Do** keep every control at least 44px and check new UI on a 390px-wide phone first.

### Don't:
- **Don't** drift back to the **SaaS dashboard**: neutral grey cards, stone greys, flat component-library defaults with nothing drawn.
- **Don't** go **childish**: no crayon scrawl on everything, rainbow text, or mascots that talk down to adults and coworkers.
- **Don't** build the **ad-cluttered, skribbl-era web game**: no dense side-by-side widget walls, no low-contrast noise.
- **Don't** reach for **neon gamer RGB**: no glows, no aggressive angles, no dark esports chrome.
- **Don't** use tangerine as text, or place two tangerine buttons on one screen.
- **Don't** add drop shadows, glassmorphism or gradient text; depth is drawn.
- **Don't** add a second typeface.
