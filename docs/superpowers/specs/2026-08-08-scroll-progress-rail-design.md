# Scroll progress rail — design

**Date:** 2026-08-08
**Status:** implemented

## Problem

Nothing on any page tells a visitor how much of it is left. The site's long
routes are the gallery pages — `/photography/*` leaves run to dozens of images,
and the home page stacks a full-viewport hero on top of several more screens of
content. A visitor part-way down has no cue whether they are near the end or a
quarter of the way in, and the native scrollbar is a poor cue here: the home
carousel already hides its scrollbar (`site.css`), and on macOS and mobile the
overlay scrollbar is absent until you scroll and gone again a second later.

## Solution

A 2px brand-red bar fixed to the top edge of the viewport, horizontally scaled
by document scroll progress, painting above the nav rather than living inside
it.

```
┌────────────────────────────────────┐
├██████████████──────────────────────┤ ← 2px rail, fixed to viewport top
│ STUDIO JUS10  Photo Video   Contact│ ← nav (retracts on scroll-down)
│                                    │
│   content                          │
└────────────────────────────────────┘
```

### Why this shape

The rail is fixed to the top of the viewport (`position: fixed; top: 0`)
rather than attached to the nav. `nav.js` retracts the whole nav on
scroll-down — `translateY(-100%)` once the scroll delta passes 8px past
`scrollY` 80 — restoring it only on scroll-up, desktop hover into the top 5%
of the viewport, or a mobile tap in the top 60px. A rail living inside that
nav translates off-screen with it, so it goes dark during and after every
downward scroll — exactly when a reader most wants to know how much is left.
(This was the original implementation, and the bug: measured on `/about`,
the rail's `getBoundingClientRect().top` was `-2` — off-screen — both mid-scroll
and 1.5s after scrolling stopped.)

Fixing the rail to the viewport does make it persistent chrome, which the
nav-attached design was trying to avoid by riding an element already present
on every route rather than adding a new one. The owner accepted that
trade-off: an always-on 2px line costs less than a progress indicator that
goes dark for most of the scroll gesture it exists to describe. `z-[100000]`
keeps it painting above the nav's `z-[99999]` (`Nav.astro:19`), since both now
occupy the same top edge. There is no longer a "track" for the unfilled
remainder to read against (that relied on sitting over the nav's bottom
border) — the unfilled portion simply isn't painted, and whatever sits behind
it (typically the nav itself) shows through.

Two alternatives were considered and rejected:

- **A right-margin vertical rail with a vertical CJK label.** Leans harder on
  the site's `writing-vertical` / bilingual motif, but adds a second persistent
  element in the margin and competes with the native scrollbar it sits beside.
- **A "scroll for more" chevron at the bottom of the first viewport.** Signals
  that a page continues but never shows progress, which is the actual gap.

### Colour

`bg-primary` (`--c-primary`, brand red) in **both** themes.

`--c-primary` is one of the tokens deliberately not reassigned under
`html[data-theme="dark"]`, matching the nav, whose CJK glyphs and logo accent
stay red in dark mode. The rail follows that same choice rather than the
red→gold `--accent` swap that the hero and card captions make, even though the
rail is no longer physically attached to the nav — it is styled to read as the
same piece of chrome.

`bg-primary` is a token-backed Tailwind utility, so `scripts/check-raw-colors.mjs`
passes with no literal and no `fixed:` annotation.

## Behaviour

| Condition                                | Rail                                                       |
| ---------------------------------------- | ---------------------------------------------------------- |
| Document taller than viewport            | Visible; `scaleX` = `scrollY / (scrollHeight − innerHeight)` |
| Document fits in viewport                | Hidden (`opacity: 0`)                                        |
| Document grows (gallery images decode)   | Re-measured via `ResizeObserver`                             |
| Viewport resized / device rotated        | Re-measured via a separate `resize` listener, not the observer above — a pure viewport-height change doesn't move `<html>`'s content box when content is already taller than the viewport |
| Mobile menu open                         | Unchanged — `nav.js` locks body scroll, so it cannot drift   |
| `prefers-reduced-motion`                 | Unchanged — see below                                        |

Progress is clamped to `[0, 1]` so overscroll (rubber-banding on iOS, or the
`scroll-smooth` overshoot on anchor jumps) cannot push the rail past full or
below empty.

The rail carries **no CSS transition on `transform`**. It is a 1:1 readout of
scroll position, not an animation: a transition would make it visibly lag the
scroll, and there is no motion to reduce, so `prefers-reduced-motion` needs no
special case.

## Implementation

Two source files, plus the test.

### 1. `src/layouts/Base.astro`

One element, a direct child of `<body>`, before `<Nav />`:

```astro
<div
  id="scroll-rail"
  aria-hidden="true"
  class="fixed left-0 right-0 top-0 z-[100000] h-[2px] bg-primary origin-left scale-x-0 opacity-0"
>
</div>
```

Fixed to the viewport (`position: fixed; top: 0`) rather than positioned
relative to the nav — see "Why this shape" above for why a nav-child rail
doesn't work. `z-[100000]` keeps it painting above the nav's `z-[99999]`
(`Nav.astro:19`), since both now sit at the same top edge.

`aria-hidden="true"` — the rail is decorative. Scroll position is already
conveyed to assistive tech by the viewport itself; a `role="progressbar"` here
would announce a value no user action targets.

The rail starts at `scale-x-0 opacity-0`, so a page that never runs JS shows
nothing rather than a full-width red bar.

`Base.astro` also gets its own `<script>` block, next to the rail element,
that imports `initScrollProgress` and calls it. It is not wired through
Nav.astro's script alongside `initTheme()` / `initNav()` — scroll progress is
a layout concern now that the rail is fixed to the viewport instead of living
inside the nav. Because it lives in `Base.astro`, every route that uses it
still gets the rail with no per-page change — all 40 of them.

### 2. `src/scripts/scroll-progress.js` (new)

Exports `initScrollProgress()`. 55 lines:

- Reads `#scroll-rail`; returns immediately if absent.
- `measure()` computes `scrollHeight − innerHeight`, toggles `opacity-0` on
  whether that is greater than zero.
- `paint()` writes `style.transform = 'scaleX(' + p + ')'`; `schedule()`
  coalesces calls into one `requestAnimationFrame` per frame via a pending
  flag (the pattern `home-hero.js` already uses).
- `scroll` listener registered `{ passive: true }`, calling `schedule()`.
- `ResizeObserver` on `document.documentElement` calls `remeasure()`, which
  runs `measure()` then `schedule()`.
- Runs `measure()` + `paint()` once at init so a page restored mid-scroll
  (browser scroll restoration) paints correctly on first frame.

Style follows the other `src/scripts/*.js` modules: single quotes, `var`, plain
`function`. Biome's formatter is disabled for that directory and `useConst` /
`useArrowFunction` are off, so the existing idiom is the correct one.

## Tests

New spec `tests/scroll-progress.spec.ts`:

1. **Empty at top, full at bottom.** On a known-tall route, assert `scaleX`
   ≈ 0 initially, then `scrollTo(0, scrollHeight)` and assert ≈ 1. Read the
   matrix from `getComputedStyle().transform` and compare with a tolerance
   rather than string-matching. At the midpoint and bottom steps, also assert
   `boundingBox().y >= 0` — a computed transform alone doesn't prove the rail
   is on-screen, and a single `scrollTo` is one scroll event with a delta far
   past `nav.js`'s 8px hide threshold, so the nav is retracted at exactly
   those points.
2. **Hidden when the page fits.** Size the viewport tall enough that a short
   route does not overflow; assert the rail computes to `opacity: 0`.
3. **Correct colour in both themes.** Reuse `tests/helpers/theme.ts`
   (`setTheme`, `readVar`, `computed`) to assert the rail's
   `background-color` equals `--c-primary` in light *and* dark — this is the
   regression guard for the "red in both themes" decision.

The route used in (1) must be asserted tall at test time, not assumed: image
assets are gitignored, so a gallery page's height in CI is text-only. The spec
picks its route by measuring, and fails loudly if no route in the build
overflows the test viewport.

Existing suites already cover the rest: `astro-smoke.spec.ts` sweeps every
route for console errors, and `dark-mode.spec.ts` sweeps all 40 routes for
light-surface leaks, which the new element passes through automatically.

## Limits

Tracks **document** scroll only. A page that scrolled an inner container
instead would not register. No page currently does — `#carousel-container` is
the only scrolling sub-element and it scrolls horizontally.
