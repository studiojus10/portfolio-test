# Scroll Progress Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 2px brand-red bar to the bottom edge of the sticky nav that fills left-to-right as the visitor scrolls, on every route.

**Architecture:** One decorative `<div>` inside the existing `<nav>` in `Nav.astro`, scaled by a new `src/scripts/scroll-progress.js` module wired into Nav.astro's existing client script. Because the nav is in `Nav.astro`, which every page gets via `Base.astro`, all 40 routes are covered with no per-page change. Progress is a direct rAF-coalesced readout of `window.scrollY`, not a CSS animation.

**Tech Stack:** Astro 7, Tailwind CSS 3 (token-backed palette), plain ES-module JS, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-08-scroll-progress-rail-design.md`

## Global Constraints

- **No colour literals.** `scripts/check-raw-colors.mjs` fails the build on any raw hex, `rgb()`/`hsl()` literal, CSS colour name, default-Tailwind-palette utility, or `!important` colour rule in `.astro`. Use the token-backed utility `bg-primary` only.
- **`src/scripts/*.js` house style:** single quotes, `var`, plain `function` expressions. Biome's *formatter* is disabled for that directory and `useConst` / `useArrowFunction` / `useTemplate` are switched off there, so match the surrounding files (`nav.js`, `home-hero.js`) rather than modern idiom.
- **Tests are Playwright only.** `pnpm run test` builds and starts its own preview server on port 4173.
- **The full gate is `pnpm run check`**, which runs `astro check`, `biome check`, the colour guard, the mailer tests, and the njs tests — in that order. CI runs exactly this plus `pnpm run build` plus the Playwright suite.
- **Colour is `--c-primary` (`224 60 49`) in both light and dark.** It is deliberately not reassigned under `html[data-theme="dark"]`. Do not add a dark-mode variant.
- **Never run `pnpm run format` on the whole repo** as part of a task — it reformats `.astro` files site-wide with Prettier and will bury the diff.

---

### Task 1: The rail element and its scroll module

**Files:**

- Create: `src/scripts/scroll-progress.js`
- Create: `tests/scroll-progress.spec.ts`
- Modify: `src/components/Nav.astro` (add one `<div>` as the last child of `<nav>`, ending line 198; add one import + one call in the `<script>` block, lines 340-345)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `initScrollProgress(): void`, the sole export of `src/scripts/scroll-progress.js`. Operates on the element with id `scroll-rail`; returns immediately and harmlessly if that element is absent.

- [ ] **Step 1: Write the failing test**

Create `tests/scroll-progress.spec.ts`:

```ts
import { expect, type Page, test } from '@playwright/test';

/**
 * The rail's horizontal scale, read out of the computed transform matrix.
 * A computed `none` means no transform is applied at all — for this element
 * that is a bug (it must start explicitly collapsed), so it is reported as
 * NaN rather than silently coerced to the identity scale of 1.
 */
function railScaleX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.getElementById('scroll-rail');
    if (!el) throw new Error('no #scroll-rail on this page');
    const t = getComputedStyle(el).transform;
    if (t === 'none') return Number.NaN;
    return new DOMMatrixReadOnly(t).a;
  });
}

/** How far the document can actually scroll, in px. */
function scrollableDistance(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
}

/**
 * <html> carries Tailwind's `scroll-smooth`, so a programmatic scrollTo
 * animates. Turning it off makes each scroll land in one step, which keeps
 * the midpoint assertion from sampling the page mid-flight.
 */
async function disableSmoothScroll(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
  });
}

test('rail tracks scroll position from empty to full', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await disableSmoothScroll(page);

  // Guard: everything below is vacuous if the page doesn't scroll.
  // /public/assets is gitignored, so no image height is available in CI —
  // the home page's 100vh hero plus its stacked sections is what makes it
  // tall here, and that is in the repo.
  expect(
    await scrollableDistance(page),
    'the home page did not overflow the test viewport',
  ).toBeGreaterThan(200);

  expect(await railScaleX(page)).toBeCloseTo(0, 2);

  // Halfway: proves the rail is proportional, not a 0/1 toggle.
  await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, max / 2);
  });
  await expect.poll(() => railScaleX(page)).toBeGreaterThan(0.45);
  expect(await railScaleX(page)).toBeLessThan(0.55);

  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect.poll(() => railScaleX(page)).toBeGreaterThan(0.99);
  // Clamped: overscroll must not push it past full.
  expect(await railScaleX(page)).toBeLessThanOrEqual(1);
});

test('rail is hidden on a page that does not scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 3000 });
  await page.goto('/404');
  await page.waitForLoadState('load');

  // Guard: /404 is `min-h-[75vh]` of centred text with no images, so a
  // 3000px viewport contains it. If this fails, the route grew and this test
  // needs a different one — it does not mean the rail is broken.
  expect(
    await scrollableDistance(page),
    '/404 overflowed a 3000px viewport',
  ).toBeLessThanOrEqual(0);

  await expect(page.locator('#scroll-rail')).toHaveCSS('opacity', '0');
});
```

- [ ] **Step 2: Run the test and verify it fails**

```sh
pnpm exec playwright test tests/scroll-progress.spec.ts
```

Expected: both tests FAIL. The first with `Error: no #scroll-rail on this page`; the second with a locator timeout on `#scroll-rail`.

If Playwright complains about a missing browser, run `pnpm exec playwright install --with-deps chromium` once.

- [ ] **Step 3: Create the scroll module**

Create `src/scripts/scroll-progress.js`:

```js
export function initScrollProgress() {
  var rail = document.getElementById('scroll-rail');
  if (!rail) return;

  var max = 0;         // scrollable px; 0 means the page doesn't scroll
  var pending = false; // one paint per frame, not one per scroll event

  function measure() {
    max = document.documentElement.scrollHeight - window.innerHeight;
    if (max < 1) max = 0;
    // Hidden rather than removed: there is nothing to indicate on a page
    // that fits, but the element must stay for the next measure().
    rail.classList.toggle('opacity-0', max === 0);
  }

  function paint() {
    pending = false;
    var p = max === 0 ? 0 : (window.scrollY || window.pageYOffset) / max;
    // Clamp: iOS rubber-banding and scroll-smooth overshoot both run past
    // the ends, and a scaleX above 1 would spill the rail past the nav.
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    // Inline transform deliberately overrides the `scale-x-0` utility that
    // holds the no-JS initial state; both agree at p = 0, so nothing jumps.
    rail.style.transform = 'scaleX(' + p + ')';
  }

  function schedule() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(paint);
  }

  function remeasure() {
    measure();
    schedule();
  }

  window.addEventListener('scroll', schedule, { passive: true });

  // Catches the document growing under us — gallery images decoding, fonts
  // swapping in, the mobile menu opening. <html>'s border box is the content
  // height in standards mode, so it moves whenever the document does.
  new ResizeObserver(remeasure).observe(document.documentElement);

  // ResizeObserver does NOT cover a viewport height change on its own: when
  // content is taller than the viewport, <html>'s box is the content height
  // and doesn't move, but `max` does. Mobile URL-bar collapse hits this.
  window.addEventListener('resize', remeasure, { passive: true });

  // Paint once at init so a page restored mid-scroll by the browser's scroll
  // restoration is correct on the first frame rather than the first scroll.
  measure();
  paint();
}
```

- [ ] **Step 4: Add the rail element to Nav.astro**

In `src/components/Nav.astro`, insert this as the **last child of `<nav>`**, immediately before the closing `</nav>` on line 198 (after the right-hand group `</div>`):

```astro
  <!-- Scroll progress. Decorative: scroll position is already conveyed by
       the viewport, so it is aria-hidden rather than a progressbar role.
       `-bottom-px` lays the 2px bar over the nav's 1px bottom border, so the
       filled part covers the rule and the rest leaves it showing as the
       track. Starts collapsed and transparent so a no-JS page shows nothing
       instead of a full-width red bar. No transition: this is a 1:1 readout
       of scroll position, and a transition would visibly lag it. -->
  <div
    id="scroll-rail"
    aria-hidden="true"
    class="absolute left-0 right-0 -bottom-px h-[2px] bg-primary origin-left scale-x-0 opacity-0"
  >
  </div>
```

- [ ] **Step 5: Wire it up**

In the same file, replace the `<script>` block at lines 340-345 with:

```astro
<script>
  import { initNav } from "@scripts/nav.js";
  import { initScrollProgress } from "@scripts/scroll-progress.js";
  import { initTheme } from "@scripts/theme.js";
  initTheme();
  initNav();
  initScrollProgress();
</script>
```

- [ ] **Step 6: Run the test and verify it passes**

```sh
pnpm exec playwright test tests/scroll-progress.spec.ts
```

Expected: 2 passed.

If the first test fails at the *initial* `toBeCloseTo(0, 2)` with a value of 1, the inline transform is not overriding the `scale-x-0` utility — check the element actually has `origin-left scale-x-0` and that `initScrollProgress()` is being called.

- [ ] **Step 7: Commit**

```bash
git add src/scripts/scroll-progress.js src/components/Nav.astro tests/scroll-progress.spec.ts
git commit -m "feat(nav): scroll progress rail on the sticky nav"
```

---

### Task 2: Lock the colour decision, then run the full gate

**Files:**

- Modify: `tests/scroll-progress.spec.ts` (add one test)

**Interfaces:**

- Consumes: `#scroll-rail` from Task 1; `setTheme` and `computed` from `tests/helpers/theme.ts`.
- Produces: nothing consumed by later tasks.

Why this is its own test rather than a comment: "red in both themes" is a deliberate divergence from the site's usual red→gold dark-mode accent swap. Without a guard, a later pass that sweeps accents to `--accent` would silently take the rail with it.

- [ ] **Step 1: Write the failing test**

Add to the top of `tests/scroll-progress.spec.ts`, merged into the existing import line:

```ts
import { computed, setTheme } from './helpers/theme';
```

Then append this test to the end of the file:

```ts
// The rail follows the nav (whose CJK glyphs and logo accent stay red in
// dark) rather than the red -> gold `--accent` swap the hero and card
// captions make. --c-primary is one of the tokens deliberately NOT
// reassigned under html[data-theme="dark"], and this asserts it stays that
// way for this element specifically.
for (const theme of ['light', 'dark'] as const) {
  test(`rail paints brand red in ${theme} mode`, async ({ page }) => {
    await setTheme(page, theme);
    await page.goto('/');
    await page.waitForLoadState('load');
    expect(await computed(page, '#scroll-rail', 'backgroundColor')).toBe(
      'rgb(224, 60, 49)',
    );
  });
}
```

- [ ] **Step 2: Run the test and verify it passes immediately**

```sh
pnpm exec playwright test tests/scroll-progress.spec.ts
```

Expected: 4 passed.

This is the one test in this plan that is *expected to pass on first run* — it is a regression guard on an already-correct value, not a driver for new code. Do not write code to make it pass. If it fails, the value in Task 1's markup is wrong: confirm the class is `bg-primary` and not a literal or a different token.

- [ ] **Step 3: Run the full gate**

```sh
pnpm run check && pnpm run build
```

Expected: `astro check` reports 0 errors / 0 warnings / 0 hints; `biome check` reports no diagnostics; `check-raw-colors.mjs` prints no offenders; mailer and njs tests pass; the build writes `dist/`.

The colour guard is the one most likely to fire here. If it flags the new markup, the class is not token-backed — `bg-primary` is; anything with a hex, an `rgb()`, or a default-palette name like `bg-red-500` is not.

- [ ] **Step 4: Run the whole Playwright suite**

```sh
pnpm run test
```

Expected: the full suite green, including the 40-route dark-mode leak sweep and the 40-route contrast sweep.

Neither sweep should react to the new element, and it is worth knowing why before you run it: the leak sweep skips anything under 40px tall (the rail is 2px), and the contrast sweep skips everything inside `nav` and everything with no text. If either *does* fire on `#scroll-rail`, that is a real finding about the element, not a flaky sweep.

- [ ] **Step 5: Commit**

```bash
git add tests/scroll-progress.spec.ts
git commit -m "test(nav): pin the scroll rail to brand red in both themes"
```

- [ ] **Step 6: Hand off for a real-browser check — do not skip, and do not self-certify**

Playwright's bundled Firefox has previously passed rendering bugs that real Firefox shows on this site, so a green suite is not evidence the rail looks right. Start the dev server and ask Davey to look:

```sh
pnpm run dev
```

Ask for confirmation on four things at `http://localhost:4321`, in **Firefox Developer Edition**:

1. Light mode, `/` — the rail fills smoothly and sits flush on the nav's bottom rule with no gap or double line.
2. Dark mode (nav toggle), `/` — the red is visible against the blurred dark nav bar and doesn't smear with the `backdrop-filter`.
3. `/404` — no rail at all.
4. Narrow viewport with the mobile menu open — the rail holds position and doesn't jump.

Report what Davey says. Do not mark this task complete on the strength of the Playwright run alone.

---

## Self-review notes

Checked against `docs/superpowers/specs/2026-08-08-scroll-progress-rail-design.md`:

| Spec requirement | Task |
| --- | --- |
| 2px bar, bottom edge of sticky nav, `bg-primary` | 1, step 4 |
| No track element; nav border is the track | 1, step 4 (`-bottom-px`) |
| Visible + proportional when the document overflows | 1, steps 3 & 6 |
| Hidden when the document fits | 1, steps 3 & 6 |
| Re-measure on document growth and on resize | 1, step 3 (`ResizeObserver` + `resize`) |
| Clamped to [0, 1] | 1, step 3 |
| No CSS transition on transform | 1, step 4 (asserted by inspection, not by test — a transition would not fail any assertion here, only look wrong, which is why step 6 of Task 2 exists) |
| `aria-hidden`, decorative | 1, step 4 |
| Red in both themes | 2, step 1 |
| Colour guard passes with no literal | 2, step 3 |
| Existing sweeps unaffected | 2, step 4 |

Deliberately **not** covered by an automated test: the `prefers-reduced-motion` row of the spec's behaviour table. The spec's position is that no special case is needed because there is no animation to reduce; there is no code path to test.
