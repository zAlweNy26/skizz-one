# Product

## Register

product

## Users

Friends playing together on a voice call (Discord or similar), mostly on
desktop, usually in the evening, for laughs. Also classrooms and teams using it
as an icebreaker, on shared screens or their own laptops. Mixed ages, from
teens to adults, and many of them aren't gamers.

The job: get a group into a room in seconds, then take turns drawing and
guessing without anyone needing to be taught how.

## Product Purpose

SkizzOne is a multiplayer drawing-and-guessing game. One player draws a secret
word, everyone else races to guess it in chat, and points go to fast guessers
and to the drawer. Success means the room laughs, nobody gets lost about whose
turn it is or what to do, and people start another game.

## Brand Personality

**Sketchy, cheerful, bouncy.**

It should feel like the hand-drawn line of Excalidraw, with brighter color and
springy, tactile feedback. Playful in a grown-up way: witty, never babyish. The
UI should feel sketched by the same hand that draws on the canvas. The
emotional goal is light, shared delight, with a small burst of celebration when
someone gets the word.

## Anti-references

- **SaaS dashboard:** neutral grey cards and generic component-library defaults
  (the current look).
- **Childish crayon app:** too cutesy for teens, adults and coworkers.
- **Ad-cluttered, skribbl-era web game:** dense, noisy, dated, low-contrast
  chaos.
- **Neon gamer RGB:** dark esports aesthetic, glows, aggressive angles.

## Design Principles

1. **The canvas is the stage.** The chrome frames the drawing and never
   competes with it.
2. **Drawn, not built.** Interface elements look sketched rather than
   machined, so the UI and the drawings feel like one world.
3. **Celebrate moments.** Guesses, new turns, the word reveal and the podium
   get real, joyful feedback. Idle chrome stays quiet.
4. **Readable at a glance.** The timer, the hint, whose turn it is and whether
   you've guessed must be clear instantly, even in the middle of the chaos.
5. **Fun for everyone.** Safe and welcoming in a classroom. Humor never costs
   clarity.

## Accessibility & Inclusion

- WCAG 2.2 AA: text contrast ≥4.5:1 (large text ≥3:1), visible focus rings, and
  every control usable by keyboard (the drawing tools already have shortcuts).
- Reduced motion: every bounce, wobble and celebration has a calm alternative
  under `prefers-reduced-motion: reduce`.
- Players share a room but not a UI language (English and Italian today), so
  copy and layouts must survive longer translated strings.
