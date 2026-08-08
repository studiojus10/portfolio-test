# Scroll cue — design

**Date:** 2026-08-08
**Status:** implemented, on `feat/scroll-progress-rail`
**Builds on:** [`2026-08-08-scroll-progress-rail-design.md`](2026-08-08-scroll-progress-rail-design.md)

> **Revised twice after review.** This spec's first two versions each described a
> cue that was not built, for reasons recorded in "Corrections" at the end. The
> design below is what shipped. The corrections are kept rather than edited away
> because each one cost a round trip, and the pattern behind them is worth
> remembering: describing the site from its markup without checking what it
> renders.

## Problem

The scroll progress rail tells a reader *how far through* a page they are. It
does not tell them a page scrolls at all — at `scrollY 0` the rail is a
zero-width bar, indistinguishable from no rail.

That gap matters here because twelve-plus routes open with a full-viewport hero
and nothing bleeding past the fold:

| Route | Hero | Already had a cue? |
| --- | --- | --- |
| `/` | `height: 100vh` cylinder room (`index.astro:297`) | no |
| `/art` | `height: 100vh` spacer (`art/index.astro:174`) | no |
| `/projects` | `height: 100vh` (`projects/index.astro:424`) | no |
| `/video` | `min-height: calc(100vh - 56px)` (`video/index.astro:56`) | no |
| `/photography` | `height: 100vh` sticky (`photography/index.astro:41`) | no |
| `/photography/{colorado,arizona,washington,nature,film,europe}` | `height: 100vh` (each `index.astro:117`) | **yes** |

The six region pages already shipped a scroll cue. Half the routes this feature
targets had already solved the problem locally, in a design the site had
settled on and nobody had generalised.

## Solution

**Promote the design the site already had, to every scrollable route.**

```
┌───────────────────────────────────┐
│          100vh hero               │
│                                   │
│           S C R O L L             │ ← 10px, 0.3em tracking, uppercase
│               ╷                   │ ← 1px gold rule, 40px
│               │                   │   scaleY loop, 2s
│               ╵                   │
└───────────────────────────────────┘
```

No backing, no CJK line, no chevron — the original treatment, unchanged except
that it is now global rather than repeated on six pages, and lifted slightly by
a text shadow (see below).

### The shadow

The promoted cue read as too quiet, so the label carries
`text-shadow: 0 1px 3px var(--cue-shadow)`, and the rule carries a matching
`filter: drop-shadow(0 1px 2px var(--cue-shadow))`.

This is the same device the original design already used on its neighbour: the
`.hero-sub` line directly above the cue on those six pages had
`text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6)`. The blur is trimmed from 4px to
3px and the alpha from 0.6 to 0.55 because at 10px type with 1px strokes the
precedent's values read as a glow rather than a lift.

The rule gets `drop-shadow` rather than `box-shadow` deliberately:
`drop-shadow` follows the gradient's own fade to transparent, where
`box-shadow` would halo the full 40px box including its invisible lower half.

### Why this shape

It is the design the site had already converged on for exactly this problem, in
exactly these places. Two treatments invented for this feature were built,
measured, and rejected in favour of it (see Corrections). Reusing the existing
pattern also removes six near-duplicate implementations.

The one alternative never built: `滚动` set vertically with `.writing-vertical`.
The most distinctly Studio Jus10 option, but vertical text is slower to parse,
which cuts against the one thing the cue exists to do.

### Scope

Every page that scrolls by more than the dismissal threshold. No per-page
configuration.

## Behaviour

| Condition | Cue |
| --- | --- |
| Document scrolls by more than 24px, `scrollY === 0` | Visible |
| Scrolled past 24px | Fades out over 400ms, then leaves the tab order |
| Reader returns to the top | **Stays gone.** Dismissal is permanent for the page view |
| Document scrolls by 24px or less | Never shown |
| Document does not scroll | Never shown |
| Document grows after load (gallery images decode) | Re-measured; may appear if the page becomes scrollable and the reader has not yet scrolled |
| `prefers-reduced-motion: reduce` | Shown, rule animation stopped, click-scroll jumps instead of animating |
| Clicked | Scrolls one viewport down |

The show threshold and the dismiss threshold are **the same 24px on purpose**.
An earlier version showed the cue whenever the document scrolled at all while
only dismissing past 24px, so a page with 1–24px of overflow — reachable at
arbitrary desktop window heights, and on mobile when the URL bar collapses —
displayed a cue that survived scrolling to the very bottom. At that moment the
rail read 100% and the cue read "there's more below": two indicators
contradicting each other.

The 24px floor also keeps trackpad jitter and scroll restoration from
dismissing the cue before it has been seen.

Dismissal is permanent because returning to the top is itself proof the reader
knows the page scrolls. A cue that reappeared would nag.

### Interaction and accessibility

The cue is a real `<button>`, not decoration:

- It is the obvious thing to click, so it scrolls one viewport down.
- `aria-label="Scroll down"`; the rule `<span>` is `aria-hidden`.
- The hidden state uses `visibility` (Tailwind `invisible`), not `opacity`
  alone. An `opacity: 0` button stays keyboard-focusable; `visibility: hidden`
  removes it from the tab order *and* can be transitioned, so the cue fades
  rather than vanishing.
- **It is rendered after `<slot />`.** Placed first in the body it became the
  first tab stop on all 40 routes, ahead of the logo, and the site has no skip
  link. It is `position: fixed` with an explicit z-index, so DOM order affects
  only tab order and paint order against equal-z siblings.

This differs from the rail, which stays `aria-hidden` decoration. Different
element, different job: the rail reports a value no user action targets, the
cue is a control.

## Legibility: an accepted trade

`--cue-ink` is `rgba(243, 237, 225, 0.55)` — light — and `--cue-rule` is the
gold `#d9a441`. Both are **theme-invariant**: they are not reassigned under
`html[data-theme="dark"]`.

That is inherited from the original design, which only ever appeared over
photographs. Promoting it site-wide means it now also appears over plain
light-background routes, where it measures **~1.06:1** — effectively invisible
on `/about`, `/contact`, and the text pages.

**This is a deliberate owner decision, not an oversight.** Two treatments that
would have fixed it were built and rejected on aesthetic grounds:

- a solid plate behind the cue — measured 7.2:1, rejected as a visible box;
- a radial gradient scrim fading to a matching-RGB zero-alpha stop — measured
  6.2–6.7:1 light and 5.3–5.5:1 dark with no perceptible edge, also rejected.

The owner was shown the measurement for the current treatment before choosing
it. If it proves annoying in practice, the remedy is scoping the cue to hero
pages rather than restoring a backing.

Note that **no automated check in this repo would have caught the original
problem** either, for two independent reasons worth recording:

1. `dark-mode.spec.ts` walks up the DOM for a painted background. A
   `position: fixed` element's nearest painted ancestor is `<body>`, so the
   sweep measures against the body colour, not the photograph actually behind
   the cue.
2. Both sweeps are **dark-mode only**. There is no light-mode contrast sweep
   anywhere in the suite, and light is both the default theme and the failing
   one.

## Implementation

Four files.

### 1. `src/layouts/Base.astro`

A `<button id="scroll-cue">` as a direct child of `<body>`, **after `<slot />`**
(see the accessibility note above). Children: `<span>Scroll</span>` and an
`aria-hidden` span for the rule.

Its z-index sits below the mobile menu overlay (`z-[99997]`), the mobile menu
(`z-[99998]`), the nav (`z-[99999]`), and the photography lightbox and scroll
rail (both `z-[100000]`), and above all ordinary page content (highest
observed: `z-index: 10000`). The home page's fixed side carousel is
`z-index: 9000` (`index.astro:597`) but only reveals after the hero has
scrolled away, by which point the cue is dismissed, so the two never coexist.

Ships hidden, so a page whose script never runs shows nothing.

### 2. `src/scripts/scroll-cue.js`

Exports `initScrollCue()`. Its own module rather than folded into
`scroll-progress.js`: the rail lives for the whole page view, the cue dies on
first scroll. They share only a short "does this page scroll" check, which is
not worth an abstraction.

- Reads `#scroll-cue`; returns immediately if absent.
- Shows the cue if the document scrolls by more than 24px and `scrollY` is
  within that threshold.
- One `scroll` listener, `{ passive: true }`, that dismisses past 24px and then
  removes itself along with the observer.
- `ResizeObserver` on `document.documentElement` so a page that becomes
  scrollable after images decode still gets the cue.
- Click handler scrolling one viewport, honouring `prefers-reduced-motion`.

House style follows the other `src/scripts/*.js` modules: single quotes, `var`,
plain `function`.

### 3. `src/styles/tokens.css`

`--cue-ink`, `--cue-rule`, and `--cue-shadow`, set once in `:root` and
deliberately not reassigned for dark mode.

### 4. `src/styles/site.css`

The cue's typography, the label's `text-shadow` and the rule's matching
`drop-shadow`, the `cueSlide` `@keyframes` on the rule, the fade transition,
and the `@media (prefers-reduced-motion: reduce)` override.

### Removed

The six per-page cues: `.scroll-cue` / `.cue-line` / `@keyframes cueSlide` and
their markup in each
`src/pages/photography/{colorado,arizona,washington,nature,film,europe}/index.astro`,
plus the `scrollCue` lookup and opacity line in each corresponding
`src/scripts/photography-*.js`.

## Tests

`tests/scroll-cue.spec.ts`:

1. **Visible at the top of a scrolling page**, on a route asserted tall at test
   time rather than assumed — `/public/assets` is gitignored, so image-driven
   height is unavailable in CI.
2. **Dismissed after scrolling**, and **still dismissed after returning to the
   top** — the second leg pins the "permanent" decision.
3. **Never shown on a page that does not scroll**, with a guard asserting the
   route genuinely does not overflow, plus an assertion that `#scroll-rail` is
   script-hidden on the same page — otherwise this test passes with
   `initScrollCue()` deleted entirely.
4. **Clicking scrolls about one viewport** — bounded on both sides.
5. **The rule animates when motion is allowed** and **is stopped under
   `prefers-reduced-motion`** while the cue still renders. This pair has to
   stay a pair: the reduced-motion half alone would also pass if the animation
   were never wired up.

Every visibility assertion is paired with an explicit opacity assertion.
Playwright's `toBeVisible()` checks for a non-empty box and
`visibility !== hidden` but **ignores opacity**, so a future edit that dropped
`opacity-0` from the show path would leave the cue invisible to every user and
still pass.

Shared helpers (`scrollableDistance`, `disableSmoothScroll`) live in
`tests/helpers/scroll.ts`, used by both this spec and the rail's.

### Not covered by tests, deliberately

- **Legibility over heroes.** Structurally unverifiable in this suite, for the
  two reasons given above. Manual check in **Firefox Developer Edition**, per
  this project's standing rule that Playwright's bundled Firefox misses real
  Firefox rendering bugs on this site.
- **The 400ms fade duration.** Asserting a transition duration tests the
  stylesheet against itself. The observable behaviour it serves is tested.

## Corrections

All three errors were found by measuring a running build, not by reading code.

**1. "Twelve routes need a cue" — six already had one.** The Problem table was
built by grepping for `100vh` heroes. Nobody grepped for an existing cue. It
reached review as a visible defect: on those six routes "Scroll" rendered
twice, offset by ~9px, at a 100%-of-width overlap, both fully opaque.
Compounding it, the first spec's rejected-alternatives list dismissed "a 1px
vertical rule with a lit segment travelling down it" as too subtle — without
recognising it as the site's own shipped pattern on exactly the pages under
discussion. That rejected alternative is now the shipped design.

**2. The halo mitigation did not work.** The first spec specified a
`text-shadow` halo and asserted it made the cue legible over any hero. Measured
in light mode at 1440×900: **2.24:1 on `/`, 2.13:1 on `/video`, 1.28:1 on
`/photography/nature`**, against a 4.5:1 bar. On `/` the background across the
cue's box is literally `#000000`; the brightest halo pixel measured anywhere
was `rgb(143, 141, 140)`. An 8px blur cannot deposit enough alpha behind a
1.5px glyph stroke.

The cue was also **too small to do its job**: a 12px label is the same size as
a nav link at roughly a fifth of its legibility, in a component occupying 0.19%
of the viewport.

**3. Both replacement treatments were rejected on sight.** The plate that fixed
the contrast (7.2:1) read as a visible box; the scrim that removed the box
(6.2–6.7:1, no perceptible edge) was rejected too. The measurements were sound
in both cases — the mismatch was aesthetic, and three build-measure-reject
cycles is what it cost to find that out. Reusing the existing pattern was
available from the start and would have avoided all three.

A note for next time: the first question on a feature like this is not "what
should this look like" but "does the site already do this somewhere". Here it
did, on a quarter of the routes in scope.
