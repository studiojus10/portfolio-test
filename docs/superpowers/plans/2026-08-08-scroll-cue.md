# Scroll Cue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dismissible "scroll down" cue at the bottom of the first viewport on every page that scrolls, so a visitor knows there is more below a full-viewport hero.

**Architecture:** A `<button id="scroll-cue">` fixed to the bottom centre of the viewport, rendered in `src/layouts/Base.astro` next to the existing scroll progress rail, driven by a new `src/scripts/scroll-cue.js`. Shown at the top of any scrolling page; permanently dismissed once the reader scrolls past 24px. Clicking it scrolls one viewport down. Presentation (bob animation, fade, text halo) lives in `src/styles/site.css` against a new `--cue-halo` token.

**Tech Stack:** Astro 7, Tailwind CSS 3 (token-backed palette), plain ES-module JS, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-08-scroll-cue-design.md`

**Builds on:** the scroll progress rail already on this branch (`src/scripts/scroll-progress.js`, `#scroll-rail` in `Base.astro`). The cue is a separate module — do not merge them. The rail lives for the whole page view; the cue dies on first scroll.

## Global Constraints

- **No colour literals outside `tokens.css`.** `scripts/check-raw-colors.mjs` fails the build on any raw hex, `rgb()`/`hsl()`/`rgba()` literal, CSS colour name, default-Tailwind-palette utility (`text-red-500`), or `!important` colour rule in `.astro`, `src/scripts/**/*.js`, and `src/styles/**/*.css`. **`src/styles/tokens.css` is the one excluded file** — that is why `--cue-halo` is defined there and referenced by `var()` everywhere else.
- **`src/scripts/*.js` house style:** single quotes, `var`, plain `function` expressions. Biome's formatter is disabled for that directory and `useConst` / `useArrowFunction` / `useTemplate` are switched off there. Match `src/scripts/nav.js`, `src/scripts/home-hero.js`, and `src/scripts/scroll-progress.js`.
- **The gate is `pnpm run check`** — `astro check`, `biome check`, the colour guard, the mailer tests, the njs tests — plus `pnpm run build` and `pnpm run test` (Playwright, which builds and starts its own preview server on port 4173).
- **Never run `pnpm run format`** — it reformats every `.astro` file site-wide with Prettier and will bury the diff.
- **Copy is `Scroll` over `滚动`.** The English/CJK stack matches every nav link (`Nav.astro:39-41`); the CJK is `text-primary`, as it is there.
- **z-index is `z-[99996]`** — under the mobile menu overlay (`z-[99997]`), the mobile menu (`z-[99998]`), the nav (`z-[99999]`), and the photography lightbox plus the scroll rail (both `z-[100000]`), while clearing all ordinary page content (highest observed: `z-index: 10000`).
- **Dismissal is permanent for the page view.** Returning to the top must not bring the cue back.

---

### Task 1: The cue element, its styles, and dismissal

**Files:**

- Modify: `src/styles/tokens.css` (add `--cue-halo` to the `:root` block and to the `html[data-theme="dark"]` block)
- Modify: `src/styles/site.css` (append a scroll-cue block at the end)
- Modify: `src/layouts/Base.astro` (add the button after the existing `#scroll-rail` script block, before `<Nav />`; add one import + one call to that script block)
- Create: `src/scripts/scroll-cue.js`
- Create: `tests/scroll-cue.spec.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks. `#scroll-rail` and `initScrollProgress()` already exist in `Base.astro` — leave both exactly as they are.
- Produces: `initScrollCue(): void`, the sole export of `src/scripts/scroll-cue.js`. Operates on the element with id `scroll-cue`; returns immediately and harmlessly if absent. Task 2 adds a click handler to this same module.

**Why `visibility`, not `display`:** the hidden state must keep the button out of the tab order — an `opacity: 0` button is still keyboard-focusable, which would be an accessibility bug. Tailwind's `invisible` (`visibility: hidden`) does that *and* transitions, so the cue can fade rather than vanish. `display: none` would work too but cannot be transitioned.

- [ ] **Step 1: Write the failing tests**

Create `tests/scroll-cue.spec.ts`:

```ts
import { expect, type Page, test } from '@playwright/test';

/** How far the document can actually scroll, in px. */
function scrollableDistance(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
}

/**
 * <html> carries Tailwind's `scroll-smooth`, so a programmatic scroll
 * animates. Turning it off makes each scroll land in one step.
 */
async function disableSmoothScroll(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
  });
}

/** Two frames — enough for any synchronous re-show to have happened. */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
      }),
  );
}

/** The chevron's resolved animation-name. */
function chevronAnimation(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('#scroll-cue .cue-chevron');
    if (!el) throw new Error('no #scroll-cue .cue-chevron');
    return getComputedStyle(el).animationName;
  });
}

test('cue is visible at the top of a scrolling page', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');

  // Guard: the assertion below is vacuous if the page doesn't scroll.
  // /public/assets is gitignored, so no image height is available in CI —
  // the home page's 100vh hero plus its stacked sections is what makes it
  // tall here, and that is in the repo.
  expect(
    await scrollableDistance(page),
    'the home page did not overflow the test viewport',
  ).toBeGreaterThan(200);

  await expect(page.locator('#scroll-cue')).toBeVisible();
});

test('cue dismisses on scroll and stays dismissed back at the top', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await disableSmoothScroll(page);
  await expect(page.locator('#scroll-cue')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(page.locator('#scroll-cue')).toBeHidden();

  // Pins the "permanent" decision: returning to the top is itself proof the
  // reader knows the page scrolls, so the cue must not reappear.
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await expect(page.locator('#scroll-cue')).toBeHidden();
});

test('cue never appears on a page that does not scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 3000 });
  await page.goto('/404');
  await page.waitForLoadState('load');

  // Guard: /404 is `min-h-[75vh]` of centred text with no images, so a
  // 3000px viewport contains it. If this fails, the route grew and this test
  // needs a different one — it does not mean the cue is broken.
  expect(
    await scrollableDistance(page),
    '/404 overflowed a 3000px viewport',
  ).toBeLessThanOrEqual(0);

  await expect(page.locator('#scroll-cue')).toBeHidden();
});

// This pair has to stay a pair. The reduced-motion test alone would also
// pass if the bob were never wired up at all.
test('chevron bobs when motion is allowed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.waitForLoadState('load');
  expect(await chevronAnimation(page)).toBe('cue-bob');
});

test('bob is disabled under prefers-reduced-motion, cue still shows', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForLoadState('load');

  await expect(page.locator('#scroll-cue')).toBeVisible();
  expect(await chevronAnimation(page)).toBe('none');
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```sh
pnpm exec playwright test tests/scroll-cue.spec.ts
```

Expected: 5 failed. The visibility tests fail on a locator timeout for `#scroll-cue`; the two animation tests fail with `Error: no #scroll-cue .cue-chevron`.

If Playwright reports a missing browser, run `pnpm exec playwright install --with-deps chromium` once.

- [ ] **Step 3: Add the `--cue-halo` token**

In `src/styles/tokens.css`, add to the `:root` block, immediately after the `--surface-container-low: #f4f1f0;` line:

```css
  /* Halo behind the scroll cue's text. The cue is position:fixed over
     whatever hero a route opens with, so what sits behind it is unknowable
     from the element: /video's hero ends in a near-black scrim while the
     home page's room floor is near-white. The halo is always on rather than
     conditional because that condition cannot be detected — and the contrast
     sweep cannot catch the failure either, since a fixed element's nearest
     painted ancestor is <body>. Light value here separates the cue's dark
     text from a dark photo; the dark-mode value below inverts it. */
  --cue-halo: rgba(252, 249, 248, 0.9);
```

And to the `html[data-theme="dark"]` block, immediately after its `--surface-container-low: #0c0b0a;` line:

```css
  --cue-halo: rgba(12, 11, 10, 0.9);
```

- [ ] **Step 4: Add the cue's styles**

Append to the end of `src/styles/site.css`:

```css
/* ── Scroll cue ── */
#scroll-cue {
  /* `visibility` is transitioned alongside opacity so the cue fades out
     instead of vanishing, while still leaving the tab order when hidden —
     an opacity-0 button stays keyboard-focusable. Colour is transitioned
     here rather than with Tailwind's transition-colors because this id
     selector would outrank that utility anyway. */
  transition:
    opacity 0.4s ease,
    visibility 0.4s,
    color 0.3s ease;
  text-shadow:
    0 1px 3px var(--cue-halo),
    0 0 8px var(--cue-halo);
}

#scroll-cue .cue-chevron {
  animation: cue-bob 2s ease-in-out infinite;
}

@keyframes cue-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(6px);
  }
}

/* Unlike the progress rail — a 1:1 readout of scroll position with no
   animation to reduce — the bob is a real animation and has a genuine
   reduced-motion case. The cue still appears; only the motion stops. */
@media (prefers-reduced-motion: reduce) {
  #scroll-cue .cue-chevron {
    animation: none;
  }
}
```

- [ ] **Step 5: Add the button to Base.astro**

In `src/layouts/Base.astro`, insert this immediately after the existing `<script>` block that calls `initScrollProgress()` (currently ending at line 71) and immediately before `<Nav />`:

```astro
    <!-- Scroll cue: tells a reader a page scrolls at all, which the rail
         above cannot — at scrollY 0 the rail is a zero-width bar. Twelve-plus
         routes open with a 100vh hero and nothing crossing the fold, so the
         first screen looks complete. Unlike the rail this is a real control,
         not decoration: it is the obvious thing to click, so it carries a
         real accessible name and scrolls one viewport down. Starts hidden so
         a no-JS page shows nothing. z-[99996] keeps it under the mobile menu
         overlay (z-[99997]), the nav (z-[99999]), and the lightbox
         (z-[100000]), while clearing all ordinary page content. -->
    <button
      id="scroll-cue"
      type="button"
      aria-label="Scroll down"
      class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[99996] flex flex-col items-center gap-1 font-label-caps text-label-caps tracking-widest text-on-surface-variant hover:text-primary opacity-0 invisible pointer-events-none"
    >
      <span>Scroll</span>
      <span class="font-cjk text-[13px] text-primary">滚动</span>
      <span class="material-symbols-outlined cue-chevron" aria-hidden="true"
        >keyboard_arrow_down</span
      >
    </button>
```

- [ ] **Step 6: Create the cue module**

Create `src/scripts/scroll-cue.js`:

```js
export function initScrollCue() {
  var cue = document.getElementById('scroll-cue');
  if (!cue) return;

  // Past this many px the reader has demonstrably scrolled. A bare
  // `scrollY > 0` would let trackpad jitter, or the browser restoring a
  // scroll position on reload, dismiss the cue before it has been seen.
  var DISMISS_AT = 24;

  var dismissed = false;
  var observer = null;

  function show() {
    cue.classList.remove('opacity-0', 'invisible', 'pointer-events-none');
  }

  function hide() {
    cue.classList.add('opacity-0', 'invisible', 'pointer-events-none');
  }

  function scrollY() {
    return window.scrollY || window.pageYOffset;
  }

  function sync() {
    if (dismissed) return;
    if (document.documentElement.scrollHeight - window.innerHeight > 0) show();
    else hide();
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    hide();
    // Nothing can bring the cue back for this page view, so stop listening
    // rather than keeping a live handler that only ever returns early.
    window.removeEventListener('scroll', onScroll);
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function onScroll() {
    if (scrollY() > DISMISS_AT) dismiss();
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  // A page can become scrollable after load — gallery images decoding, fonts
  // swapping in. <html> has no intrinsic height in standards mode, so its
  // content box tracks the document's height.
  observer = new ResizeObserver(sync);
  observer.observe(document.documentElement);

  // A reload that restores a mid-page scroll position must never show the
  // cue: that reader has already scrolled.
  if (scrollY() > DISMISS_AT) dismiss();
  else sync();
}
```

- [ ] **Step 7: Wire it up**

In `src/layouts/Base.astro`, replace the existing `<script>` block:

```astro
    <script>
      import { initScrollProgress } from "@scripts/scroll-progress.js";
      import { initScrollCue } from "@scripts/scroll-cue.js";
      initScrollProgress();
      initScrollCue();
    </script>
```

- [ ] **Step 8: Run the tests and verify they pass**

```sh
pnpm exec playwright test tests/scroll-cue.spec.ts
```

Expected: 5 passed.

If `chevron bobs when motion is allowed` fails with `animationName: 'none'`, the `@keyframes cue-bob` block did not make it into the compiled stylesheet — check it is at the top level of `site.css`, not nested.

- [ ] **Step 9: Commit**

```bash
git add src/styles/tokens.css src/styles/site.css src/layouts/Base.astro src/scripts/scroll-cue.js tests/scroll-cue.spec.ts
git commit -m "feat(cue): add a dismissible scroll-down cue below the fold"
```

---

### Task 2: Click-to-scroll, then the full gate

**Files:**

- Modify: `src/scripts/scroll-cue.js` (add a click handler inside `initScrollCue`)
- Modify: `tests/scroll-cue.spec.ts` (append one test)

**Interfaces:**

- Consumes: `initScrollCue()` and its internal `dismiss()` from Task 1; `#scroll-cue` from `Base.astro`; the `disableSmoothScroll` helper already defined at the top of `tests/scroll-cue.spec.ts`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append to `tests/scroll-cue.spec.ts`:

```ts
test('clicking the cue scrolls down about one viewport', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await disableSmoothScroll(page);

  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const vh = await page.evaluate(() => window.innerHeight);

  await page.locator('#scroll-cue').click();

  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(vh * 0.9);
  // Activating the cue is itself a scroll, so it dismisses like any other.
  await expect(page.locator('#scroll-cue')).toBeHidden();
});
```

- [ ] **Step 2: Run the test and verify it fails**

```sh
pnpm exec playwright test tests/scroll-cue.spec.ts -g "clicking the cue"
```

Expected: FAIL. `scrollY` stays at 0, so the `expect.poll` times out — the button currently has no click handler.

- [ ] **Step 3: Add the click handler**

In `src/scripts/scroll-cue.js`, insert immediately after the `onScroll` function and before the `window.addEventListener('scroll', …)` line:

```js
  cue.addEventListener('click', function () {
    window.scrollBy({ top: window.innerHeight });
    // <html> carries `scroll-smooth`, so the scroll above animates and
    // onScroll would dismiss on the way. Dismiss here too: a reader whose
    // scroll-behavior resolves to instant would otherwise see one frame of
    // the cue still up over the new screen.
    dismiss();
  });
```

- [ ] **Step 4: Run the test and verify it passes**

```sh
pnpm exec playwright test tests/scroll-cue.spec.ts
```

Expected: 6 passed.

- [ ] **Step 5: Run the full gate**

```sh
pnpm run check && pnpm run build
```

Expected: `astro check` 0 errors / 0 warnings / 0 hints; `biome check` no diagnostics; `check-raw-colors.mjs` no offenders; mailer and njs tests pass; the build writes `dist/`.

The colour guard is the likeliest to fire. If it flags `site.css`, a literal crept in where `var(--cue-halo)` belongs. If it flags `tokens.css`, something is wrong with your invocation — that file is excluded.

- [ ] **Step 6: Run the whole Playwright suite**

```sh
pnpm run test
```

Expected: green, including the 40-route dark-mode leak sweep and the 40-route contrast sweep.

Both sweeps iterate `body *`, so the cue is now in scope on every route, and unlike the rail it **has text**. Check specifically:

- The **leak sweep** skips elements under `40px` tall. The cue is a three-line stack and will likely exceed that, so it is genuinely scanned — but it has no background (`backgroundColor` resolves to `rgba(0, 0, 0, 0)`), and the sweep's `lum()` returns `null` for any colour with alpha below 0.5. It should pass.
- The **contrast sweep** skips anything inside `nav, footer, #mobile-menu, #mobile-menu-overlay`. The cue is none of those, so its text **is** measured — against `<body>`'s background, because that is the nearest painted ancestor. `text-on-surface-variant` on `--c-background` is the same pairing the sweep already accepts elsewhere.

If either sweep fires on `#scroll-cue`, that is a real finding about the element, not sweep flakiness. Report it rather than adding a skip.

- [ ] **Step 7: Commit**

```bash
git add src/scripts/scroll-cue.js tests/scroll-cue.spec.ts
git commit -m "feat(cue): scroll one viewport on click"
```

- [ ] **Step 8: Hand off for a real-browser check — do not skip, and do not self-certify**

Playwright's bundled Firefox has previously passed rendering bugs that real Firefox shows on this site (see commit `4624c01`, the Firefox carousel shutter). A green suite is not evidence this looks right. **The halo in particular cannot be verified automatically at all** — the contrast sweep measures the cue against `<body>`, not against the hero photograph actually behind it.

Start the dev server and ask Davey to look:

```sh
pnpm run dev
```

At `http://localhost:4321`, in **Firefox Developer Edition**:

1. **Legibility over heroes** — the cue must be readable on `/`, `/video` (its hero ends in a near-black scrim, the worst case), `/art`, `/projects`, `/photography`, and at least two of the six photography region pages. Check both themes.
2. **The bob** reads as a gentle invitation, not a twitch, and the chevron glyph renders (Material Symbols is a webfont — a missing glyph shows as a box or ligature text).
3. **Dismissal** — scroll down, cue fades; return to the top, it stays gone.
4. **Click** — scrolls one screen and the cue fades.
5. **Still outstanding from the rail:** the rail stays put while the nav retracts on `/about`, and the red does not smear against the dark nav's `backdrop-filter: blur(16px)`.

Report what Davey says. Do not mark this task complete on the strength of the Playwright run alone.

---

## Self-review notes

Checked against `docs/superpowers/specs/2026-08-08-scroll-cue-design.md`:

| Spec requirement | Task |
| --- | --- |
| Fixed bottom-centre, EN over CJK over chevron | 1, step 5 |
| CJK in `text-primary`, as in the nav | 1, step 5 |
| Every page that scrolls, no per-page config | 1, steps 5-7 (lives in `Base.astro`) |
| Visible at `scrollY === 0` on a scrolling page | 1, steps 1 & 6 |
| Fades over 400ms past 24px | 1, steps 4 & 6 |
| Dismissal permanent — no reappearance at the top | 1, step 1 (test 2, the return-to-top leg) & step 6 (`dismissed` flag, listeners removed) |
| Never shown on a page that does not scroll | 1, steps 1 & 6 |
| Re-measured if the document grows after load | 1, step 6 (`ResizeObserver`) |
| Bob disabled under `prefers-reduced-motion`, cue still shown | 1, steps 1 & 4 |
| Real `<button>`, `aria-label="Scroll down"`, chevron `aria-hidden` | 1, step 5 |
| Clicking scrolls one viewport | 2, steps 1 & 3 |
| `--cue-halo` in `tokens.css`, `text-shadow` in `site.css` | 1, steps 3 & 4 |
| z-index below overlay/menu/nav/lightbox, above content | 1, step 5 |
| Halo legibility is a manual check | 2, step 8 |

Two spec points carry no automated test, deliberately:

- **Halo legibility over heroes.** Structurally unverifiable — the contrast sweep resolves a fixed element's background to `<body>`. Covered by Task 2 step 8 item 1.
- **The 400ms fade duration.** Asserting a transition duration would test the stylesheet against itself. The observable behaviour it serves — hidden after scrolling, still hidden back at the top — is tested.
