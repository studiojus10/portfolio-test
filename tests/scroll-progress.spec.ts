import { expect, type Page, test } from '@playwright/test';
import { disableSmoothScroll, scrollableDistance } from './helpers/scroll';
import { computed, setTheme } from './helpers/theme';

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

/**
 * nav.js animates the nav's retraction over 0.35s (`transition: transform
 * 0.35s cubic-bezier(...)`), so its inline `transform` flips to
 * `translateY(-100%)` well before the nav is actually off-screen. A
 * boundingBox() sample taken right after a scrollTo can land mid-animation,
 * which only a nav-child rail would ride along with — waiting for the nav's
 * rendered position (not just its state) to clear the viewport is what makes
 * the assertion below actually exercise the regression it guards.
 */
async function navFullyRetracted(page: Page) {
  await page.waitForFunction(() => {
    const nav = document.querySelector('nav');
    return !!nav && nav.getBoundingClientRect().bottom <= 0;
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
  // A single scrollTo is one scroll event with a delta far past nav.js's
  // 8px hide threshold, so the nav is mid- or fully retracted here. The rail
  // must stay on-screen anyway — this is the regression guard for the rail
  // being fixed to the viewport rather than riding off with a nav-child
  // rail. Waiting for the nav to actually finish retracting (not just flip
  // its inline transform) is what makes that guard meaningful — see
  // navFullyRetracted().
  await navFullyRetracted(page);
  {
    const box = await page.locator('#scroll-rail').boundingBox();
    expect(
      box,
      'rail has no box while scrolled to the midpoint',
    ).not.toBeNull();
    expect(box?.y).toBeGreaterThanOrEqual(0);
  }

  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect.poll(() => railScaleX(page)).toBeGreaterThan(0.99);
  // Clamped: overscroll must not push it past full.
  expect(await railScaleX(page)).toBeLessThanOrEqual(1);
  await navFullyRetracted(page);
  {
    const box = await page.locator('#scroll-rail').boundingBox();
    expect(box, 'rail has no box while scrolled to the bottom').not.toBeNull();
    expect(box?.y).toBeGreaterThanOrEqual(0);
  }
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
