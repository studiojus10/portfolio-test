# Home Hero Carousel — Interior-Cylinder Redesign

**Date:** 2026-07-18
**Status:** Approved (design), pending implementation plan

## Problem

The home hero (`src/pages/index.astro` + `src/scripts/home-hero.js`) currently renders
the scrolling portfolio wall as a faux-3D "room": a flat **back wall** plus two
`rotateY(±72deg)` **side walls**, each with its own cloned track and a mirrored
floor reflection. Three problems:

1. **Frame-rate-dependent speed.** The scroll advances a fixed `2.5px` *per
   `requestAnimationFrame` tick* (`masterOffset += spd`). On a 120/144 Hz Chrome
   display it runs ~2× faster than on 60 Hz — "very fast, hard to read."
2. **Unstable speed in Firefox.** Firefox's rAF cadence can shift mid-session
   (e.g. after navigating), so the same per-frame step yields a different px/sec —
   the carousel "starts slow, then suddenly speeds up."
3. **Segmented-room seams.** The three flat walls meet at hard angles with
   alignment bugs (overlap on the right, gap on the left) and inherently visible
   joints. Even perfectly aligned, three flat planes cannot read as a smooth curve.

## Goals

- Replace the three-segment room with **one seamless interior cylinder**: framed
  cards tiling a curved wall the viewer stands inside, running edge-to-edge across
  the viewport and clipping at the screen borders — no joints, no seams, no pop.
- **Frame-rate-independent motion** (time-based) so speed is identical on any
  refresh rate and stable across a session — in Chrome *and* Firefox — at a slow,
  readable default pace. Applies to **both** the hero cylinder and the vertical
  side carousel.
- Preserve the site's existing identity and the surrounding hero staging: the
  **light** cream room, the **red glass-floor reflection**, the centered **person
  silhouette**, the typewriter name, the scroll-to-content transition, real card
  **links/labels** (accessibility + SEO), and the drag-to-scrub interaction.
- Keep the site **framework-free and lightweight** — pure CSS 3D + a small rAF
  loop. No React/WebGL. (A WebGL curved-panorama alternative was prototyped and
  explicitly rejected: it converts the hero to a canvas, losing real links/labels
  and adding a heavy dependency, and it warps framed cards.)

## Non-Goals

- No visual change to the About section, footer, nav, or other pages.
- No change to card *content* (same 10 works, same routes).
- No new build tooling or dependencies.

## Chosen Approach — CSS 3D Interior Cylinder

Validated interactively in a throwaway prototype (`carousel-explorer.html`). The
geometry, interaction, and look below are lifted from the approved prototype and
are the starting point for implementation (exact numbers to be re-tuned against
the real cards/images on the site).

### Geometry

- The cards are laid out around the **inside of a vertical cylinder**. Each card is
  a flat quad tangent to the cylinder wall:

  ```
  transform: translate(-50%,-50%) rotateY(θ_i) translateZ(-R)
  θ_i = normalizeTo(-180,180]( rotationDeg + i * STEP )
  STEP = 360 / N            // N = number of card positions around the ring
  ```

  Cards are centered on the ring's center (`left:50%; top:50%` + the `translate`),
  the ring has `transform-style: preserve-3d`, and the scene has
  `perspective` + `perspective-origin`. The viewer sits near the axis looking at
  the far wall; the wall curves away to both sides.

- **Exact tiling (no gaps, no overlap).** Card width must equal the chord of one
  angular step, so adjacent flat cards share edges at every rotation:

  ```
  cardWidth = 2 * R * sin(π / N)   ⟺   R = cardWidth / (2 * sin(π / N))
  ```

  R is **derived from the measured card width and N at layout time** (and on
  resize), never hard-coded. Prototype reference: `N = 20`, `cardWidth ≈ 230px`
  ⟹ `R ≈ 735px`, `perspective ≈ 820px`, `perspective-origin: 50% 42%`.

- **Card count.** The site has 10 works. Duplicate them to `N = 20` positions
  (each work appears twice around the ring) so the front ~180° arc shows ~9–10
  cards and the wall fills the viewport width. Duplication reuses the existing
  "clone for infinite loop" pattern; clones are `aria-hidden="true"` `tabindex="-1"`.

### Edges — render past the screen, clip, no fade

Every front-facing card renders at **full opacity** and simply runs off the screen
edges, clipped by the stage's `overflow: hidden`. There is **no opacity fade and no
angular cutoff**. `backface-visibility: hidden` drops each card the instant it
rotates past edge-on (`|θ| > 90°`) — an off-screen, zero-width moment — so cards
glide off the border and back-facing cards disappear off-screen. This was the key
refinement: fades and hard cutoffs both caused a visible "pop"; clipping does not.

Depth shading only: `filter: grayscale(1) brightness(0.82 + 0.18 * max(0, cos θ))`
so side cards read slightly deeper. (Grayscale matches the site; hover restores
color per existing card styles if desired.)

### Cards — frameless, edge-to-edge, real links

- Cards remain real `<a href>` anchors wrapping the image + label (keyboard,
  focus, SEO, and the **already-fixed** click navigation all keep working —
  see "Interaction").
- **Frameless / edge-to-edge:** the image fills the card; the label is a **caption
  overlaid on the image** (bottom gradient scrim), not a separate strip that opens
  a gap. Only a hairline separates neighbors. Light theme: cream scrim, dark
  title, red CJK subtitle — matching the live cards.
- Video cards keep `.carousel-still` + `seekStills()` (`carousel-stills.js`).

### Staging (light theme, matches the live site)

- Cream room background; the cylinder sits in it.
- **Red glass-floor reflection:** a mirrored copy of the cylinder ring positioned
  at its base — `scaleY(-1)`, red-tinted gradient overlay, masked to fade out
  downward — reusing the current floor-reflection technique (clone track,
  `scaleY(-1)`, red tint, `mask-image`). Do **not** use `-webkit-box-reflect`
  (Chrome/Safari-only; breaks the cross-browser goal). *This mirrored reflection
  is the one genuinely fiddly piece; see Risks for the fallback.*
- Centered **person silhouette** (`#hero-person`) stays, with its existing scroll
  parallax.

### Animation — time-based (fixes #1 and #2)

Single `requestAnimationFrame` loop driven by `performance.now()` delta time:

```
dt = min(0.05, (now - last) / 1000)          // seconds, clamped for tab-switches
rotationDeg = (rotationDeg + speedDegPerSec * factor * dt) mod 360
factor = dragging ? 0 : hovering ? HOVER_SLOW : 1
```

- `speedDegPerSec` is a **slow, readable** default (tune ~6–10 deg/sec).
- Identical output at 60/120/144 Hz; stable if Firefox changes cadence.
- `prefers-reduced-motion: reduce` ⟹ auto-rotation off (drag still works).
- Optional gentle intro spin-up (ease-in); the current elaborate ramp/fast/slow
  intro is dropped.
- **The vertical side carousel (`#vert-track`) is converted to the same
  delta-time model** (it currently shares the per-frame bug).

### Interaction

- **Drag-to-scrub** with **lazy pointer capture** — reuse the exact pattern from
  the recent fix (`src/scripts/home-hero.js`): capture only after movement passes
  the 5px threshold, so a plain click still targets the card `<a>` and navigates.
  Scrubbing adjusts `rotationDeg` by `dx * k`.
- **Hover-to-slow, tight to the cards.** Rotation slows only while the pointer is
  genuinely over a card, detected per-card (delegated hit-test:
  `pointermove` → `event.target.closest('.card')`), **not** anywhere over the hero.
  Frontal cards carry `pointer-events`; the empty room above/below the wall, the
  space beyond the wall's edges, and the centered figure do **not** slow it. The
  current behavior — hovering anywhere in the 100vh hero slows the carousel — is
  explicitly rejected as too coarse ("the detection zone is way too big"). Return
  to normal speed as soon as the pointer leaves the cards (`pointerleave` + the
  per-move re-check).
- **Prev/next** buttons rotate by one `STEP`.
- **Click** navigates (guarded by the drag-suppression already in place).

### Scroll-to-content transition

Replace the three-wall "panel split" (back slides up, sides slide out) with a
single unified hero exit: as `scrollY` goes `0 → heroHeight`, the cylinder +
reflection translate up and fade, while the existing header (`#home-hero-header`),
name overlay (`#hero-name-overlay`), and background photo (`#page-bg-photo`)
transitions are **kept as-is**. This removes the projection math that positioned
the back wall relative to the side panels.

## File-by-file changes

### `src/pages/index.astro`

- **Remove** the three-wall markup and their reflections:
  - `#room-wall-back` / `#carousel-container` / `#carousel-track`
  - `#room-wall-left` / `#room-left-container` / `#carousel-track-left`
  - `#room-wall-right` / `#room-right-container` / `#carousel-track-right`
  - `#floor-reflection`, `#right-floor-reflection`, `#left-floor-reflection`
    (and their inner tracks)
- **Add** a single cylinder scene: a `perspective` stage → a `preserve-3d` ring
  containing the 10 `<a>` card templates, plus one mirrored ring for the floor
  reflection. The 10 cards keep their current href/image/label markup.
- **Keep:** `#home-hero-section`, `#hero-person`, `#hero-name-overlay`,
  `#home-hero-header`, `#page-bg-photo`, `#page-loader`, `#carousel-prev/next`,
  the About section, footer, and the entire vertical side carousel
  (`#vert-carousel-wrap` / `#vert-track`).

### `src/scripts/home-hero.js`

- **Replace** the "Infinite Room Carousel" IIFE and the `sizeBackWall()`
  perspective-projection IIFE with a **cylinder controller**:
  measure card width → derive `R` → clone cards to `N` → per-frame `layout()`
  positioning each card by `rotateY/translateZ`, with the time-based loop, hover,
  drag (lazy capture), and prev/next.
- **Rewrite** the scroll handler's panel-split block as the unified hero exit;
  keep the person parallax, header, background-photo, name-overlay logic.
- **Convert** the vertical-carousel loop to delta-time.
- **Keep:** typewriter, page-loader dismiss, nav-reveal, `seekStills` usage.

### `src/scripts/carousel-stills.js`

- No change (reused by cylinder video cards and the vertical carousel).

## Responsive

- Recompute card width / `R` / `perspective` on resize (and orientation change).
- Mobile: narrower cards, adjust `N`/perspective for a comfortable arc; keep the
  slower mobile speed factor the current code already applies.

## Accessibility

- Cards are real anchors; clones are `aria-hidden` + `tabindex="-1"`.
- `prefers-reduced-motion`: no auto-rotation.
- Visible keyboard focus on cards; Enter activates the link. Consider pausing
  rotation while a card has focus (nice-to-have).

## Testing

Extend `tests/astro-smoke.spec.ts` (Playwright), following the existing pattern of
freezing `requestAnimationFrame` to stabilize the animated target:

- **Click navigates:** a cylinder card `<a>` click lands on its route (regression
  guard for the pointer-capture fix on the new structure).
- **Drag scrubs without navigating:** a pointer drag rotates the cylinder and does
  not navigate (reuses the existing coordinate-based `page.mouse` drag test).
- **Time-based motion:** with mocked rAF timestamps, assert `rotationDeg` advances
  proportional to elapsed time (double dt ⟹ ~double rotation), independent of tick
  count — the core fix for #1/#2.
- **Manual cross-browser check:** confirm identical speed and no edge-pop in Chrome
  and Firefox (the symptom that motivated this work).

## Risks / Open Questions

- **Floor reflection is the fiddliest piece.** A mirrored 3D ring must line up
  under the cylinder and fade correctly. *Fallback* (used in the prototype and
  acceptable): a simple red glass **gradient** at the base instead of a true
  mirrored reflection — cheaper, cross-browser, still reads as a glass floor.
  Decide during implementation based on how the true reflection lands.
- **Faceting.** Flat cards make the wall a many-sided polygon, not a mathematically
  smooth curve. Accepted: framed works on a curved wall are flat facets in reality,
  and at `N = 20` the facets are barely readable. (WebGL would smooth this but was
  rejected — see Goals.)
- **Focus + rotation.** Tabbing into an off-screen rotating anchor could move focus
  oddly; mitigate with the "pause on focus" nice-to-have and `aria-hidden` clones.

## Out of scope / future

- Real mirrored-photo reflections, per-card hover color, and any intro-animation
  polish are enhancements, not requirements for this change.
