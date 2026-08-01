# Dark mode, properly — design

**Date:** 2026-07-31
**Status:** approved, not yet implemented

## Problem

Dark mode degrades as the site grows. Two independent causes.

### 1. The theme is a denylist, not a token system

`src/styles/site.css` contains 35 rules of this shape:

```css
html[data-theme="dark"] .bg-surface {
  background-color: #111010 !important;
}
```

35 rules, 35 `!important` declarations, each recolouring one Tailwind utility.
The list only covers utilities somebody remembered to add. Any newly-used colour
utility renders light-on-light until a matching override is hand-written, so the
theme decays with every page added. Nothing in the build catches the omission.

### 2. Hard-coded colour literals bypass the overrides entirely

~270 hex/rgb literals sit in page templates, where no `.bg-*` selector reaches
them:

| File                             | Literals |
| -------------------------------- | -------- |
| `src/pages/index.astro`          | 64       |
| `src/pages/projects/index.astro` | 48       |
| `src/pages/video/index.astro`    | 38       |
| 9 other files                    | ~120     |

The home page paints its gallery room this way — floor
`linear-gradient(#f6f3f2, #f4f1f0)`, card mat `background: #fff`, scroll overlay
`rgb(246,243,242)`, frame line `#e6e6e6`. All literal, none themed.

### Observed result

Captured at 1440×900 with `co-theme=dark`:

| Page        | State                                                                     |
| ----------- | ------------------------------------------------------------------------- |
| `/`         | **Broken.** Room, floor and cards stay light; only the nav strip darkens. |
| `/projects` | Muddy — mockup cards wash out to near-invisible contrast.                 |
| `/about`    | Fine (hero is a photograph).                                              |
| `/contact`  | Fine (rebuilt 2026-07-31, uses only themed utilities).                    |

## Goals

- Adding a page with ordinary Tailwind colour utilities themes correctly with no
  extra CSS.
- Zero `!important` in the theme layer.
- The home gallery room reads as a gallery at night.
- First visit respects the OS preference; an explicit toggle wins thereafter.

## Non-goals

- No visual redesign of light mode. Light output should be byte-comparable.
- No per-component `dark:` variants sprinkled through templates. Themed tokens
  handle it centrally.

## Design

### Colour as a variable layer

Point Tailwind's palette at CSS custom properties; `html[data-theme="dark"]`
reassigns only the variables. Every `bg-surface` / `text-on-background` /
`border-on-background` in the codebase then re-themes with no new rules.

```js
// tailwind.config.js
colors: {
  surface: 'rgb(var(--c-surface) / <alpha-value>)',
  'on-background': 'rgb(var(--c-on-background) / <alpha-value>)',
  // ...
}
```

```css
:root {
  --c-surface: 252 249 248;
  --c-on-background: 28 27 27;
}
html[data-theme="dark"] {
  --c-surface: 17 16 16;
  --c-on-background: 243 237 225;
}
```

Channels are stored space-separated and unwrapped so Tailwind's `<alpha-value>`
placeholder keeps working — `bg-surface/50` must still compile.

Tailwind 3.4 is in use, so `darkMode` also gets pointed at the existing
attribute, making `dark:` available for the rare case a token cannot express:

```js
darkMode: ["selector", '[data-theme="dark"]'];
```

### Token table

Dark values are taken from the current override sheet so the migration is
visually neutral where it already worked.

| Token                           | Light         | Dark          |
| ------------------------------- | ------------- | ------------- |
| `--c-background`                | `252 249 248` | `12 11 10`    |
| `--c-surface`                   | `252 249 248` | `17 16 16`    |
| `--c-surface-container-lowest`  | `255 255 255` | `22 20 19`    |
| `--c-surface-container-low`     | `246 243 242` | `12 11 10`    |
| `--c-surface-container`         | `240 237 237` | `17 16 16`    |
| `--c-surface-container-high`    | `234 231 231` | `26 24 23`    |
| `--c-surface-container-highest` | `229 226 225` | `30 28 26`    |
| `--c-on-background`             | `28 27 27`    | `243 237 225` |
| `--c-on-surface`                | `28 27 27`    | `243 237 225` |
| `--c-on-surface-variant`        | `91 64 60`    | `139 135 128` |
| `--c-primary`                   | `224 60 49`   | `224 60 49`   |

Several current dark overrides bake in alpha (e.g.
`rgba(243,237,225,0.55)` for muted text, `rgba(243,237,225,0.12)` for borders).
Those are flattened against the dark background into solid triples — `139 135 128`
and `40 38 36` respectively — so the `<alpha-value>` pipeline stays intact.
Translucency that is genuinely intentional (the nav's blur panel) keeps its own
raw variable outside the Tailwind palette.

### The inverse-surface trap

**This is the migration's main hazard and the reason it cannot be a blind swap.**

39 page footers are built as:

```html
<footer class="bg-on-background ... text-surface-variant"></footer>
```

`bg-on-background` is being used as an _always-dark bar_, with
`text-surface-variant` and `text-surface-container-lowest` as _always-light text
on it_. Under a token system `bg-on-background` inverts to near-white in dark
mode and all 39 footers become light bars with invisible text.

**Corrected during implementation.** This section originally said the footers
survive today because none of those utilities appear in the override list, and
that deleting the sheet is what breaks them. Both claims are wrong. What kept
them safe was `on-background` being a _static hex_ in `tailwind.config.js` —
the override sheet never had a `.bg-on-background` rule to begin with. So the
inversion lands the moment the palette is repointed at variables, one step
earlier than described, and deleting the sheet is irrelevant to it. The
ordering constraint the section produced (fix the footers before deleting the
sheet) is still correct; only the stated reason was wrong.

The same reasoning error hid a second instance: the "STUDIO JUS10" wordmark
inside each footer uses `text-surface-container-lowest`, which is `#ffffff` in
light but reassigned to `22 20 19` in dark — near-black on the `28 27 27` bar,
about 1.03:1. Any foreground that sits on the fixed bar needs an invariant
token, not just the bar itself.

Fix: introduce explicitly theme-invariant tokens and migrate the footer to them.

| Token                 | Both themes   | Meaning                         |
| --------------------- | ------------- | ------------------------------- |
| `--c-fixed-dark`      | `28 27 27`    | always-dark bar                 |
| `--c-surface-variant` | `229 226 225` | always-light text on it         |
| `--c-on-fixed-dark`   | `255 255 255` | the bright wordmark on that bar |

The footer becomes `bg-fixed-dark ... text-surface-variant`, with the wordmark
on `text-on-fixed-dark`. The same audit applies to `border-surface-variant`
used as the footer divider.

**Naming corrected during implementation.** This originally proposed
`--c-inverse-surface` / `--c-inverse-on-surface`. Those names are already taken
in the palette by _different_ values (`#313030`, `#f3f0ef`), so reusing them
would have shifted the footer in light mode and broken the "light mode
unchanged" constraint. `surface-variant` is used nowhere but these footers, so
it simply stays unreassigned rather than needing a new name.

### Home gallery room

The room is pure CSS — `home-hero.js` only touches opacity, transform and
layout, never colour — so swapping literals for variables is sufficient and no
script changes are required.

New tokens, consumed by `index.astro`'s scoped `<style>`:

| Token                | Light              | Dark            | Used by                      |
| -------------------- | ------------------ | --------------- | ---------------------------- |
| `--room-floor-near`  | `#f6f3f2`          | `#0e0d0c`       | floor gradient stop 0%       |
| `--room-floor-far`   | `#f4f1f0`          | `#131211`       | floor gradient stops 40/100% |
| `--room-card-mat`    | `#ffffff`          | `#1b1917`       | `.cyl-card` print mat        |
| `--room-frame-line`  | `#1c1b1b`          | `#3a3632`       | inset frame rule             |
| `--room-reflection`  | `#f4f1f0`          | `#131211`       | reflection fill + glow fade  |
| `--room-scroll-veil` | `rgb(246,243,242)` | `rgb(12,11,10)` | scroll-fade overlay          |

Direction: **dark room, lit prints.** Floor and walls go near-black; the framed
prints keep their brightness while their mats dim, so the cylinder becomes the
lit subject. The reflection fill must track `--room-floor-far` exactly or the
mirror seam becomes visible — the existing comment in `index.astro` calls this
out and the constraint carries over unchanged.

### OS preference

The pre-paint snippet in `Base.astro` currently reads:

```js
var t = localStorage.getItem("co-theme");
if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
```

It becomes: use the stored value when present; otherwise fall back to
`matchMedia('(prefers-color-scheme: dark)')`. Still inline and still pre-paint,
so there is no flash. `theme.js` continues writing an explicit `'light'` /
`'dark'` on toggle, which keeps overriding the OS from then on.

## Plan

### Phase 1 — token layer (~2h)

1. Add `--c-*` light values to `:root` and dark values to `html[data-theme="dark"]`.
2. Rewrite `tailwind.config.js` colours as `rgb(var(--c-*) / <alpha-value>)`;
   set `darkMode: ['selector', '[data-theme="dark"]']`.
3. Add `inverse-surface` / `inverse-on-surface`; migrate all 39 footers.
4. Delete the 35 `!important` overrides from `site.css`, keeping only the nav's
   deliberate translucent-blur panel.
5. Update the `Base.astro` snippet for OS preference.

### Phase 2 — home room (~1.5h)

6. Replace the 64 literals in `index.astro` with the `--room-*` tokens.
7. Tune dark values against a screenshot; verify the reflection seam is invisible
   and the floor/mirror still match.

### Phase 3 — audit and tune (~2h)

8. Work through the remaining ~120 literals (`projects/`, `video/`, `art/`,
   `photography/`), converting or explicitly marking any that are deliberately
   fixed (e.g. colour that sits on a photograph).
9. Re-check the six `photography-*.js` `onNavThemeChange` hooks still repaint
   correctly under the token system.
10. Fix the washed-out `/projects` mockup cards.

## Verification

- **Light mode is unchanged.** Screenshot every route before and after Phase 1
  in light mode and diff; any pixel change is a regression, not an improvement.
- **Dark mode sweep.** Every route at 1440×900 in dark mode, checked for
  light-background leaks and for text whose contrast against its own computed
  background falls below 4.5:1.
- **Footers.** Explicitly assert all 39 stay dark-bar/light-text in both themes.
- **No flash.** Load with `co-theme=dark` and confirm no light frame paints first.
- **Guard against regression.** A script that fails when a template introduces a
  raw hex outside the approved fixed-colour list, so the denylist problem cannot
  silently return.

## Risks

- **Inverse-surface regression** across 39 footers — the largest single risk;
  mitigated by dedicated tokens and an explicit assertion.
- **Alpha flattening** shifts muted text and borders very slightly against the
  current dark rendering. Intentional, and the price of keeping `<alpha-value>`.
- **Literal sprawl in Phase 3** is broad but mechanical; each file is independent,
  so it can land incrementally without blocking Phases 1–2.
