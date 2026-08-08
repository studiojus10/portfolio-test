import { expect, type Page, test } from '@playwright/test';
import { disableSmoothScroll, scrollableDistance } from './helpers/scroll';

/** Two frames — enough for any synchronous re-show to have happened. */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
      }),
  );
}

/** The rule's resolved animation-name. */
function ruleAnimation(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('#scroll-cue .cue-line');
    if (!el) throw new Error('no #scroll-cue .cue-line');
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
  // toBeVisible() doesn't consider opacity (only box + visibility), so a
  // future edit that dropped `opacity-0` from show()'s remove-list would
  // leave the cue invisible to every user while this still passed it.
  await expect(page.locator('#scroll-cue')).toHaveCSS('opacity', '1');
});

test('cue dismisses on scroll and stays dismissed back at the top', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await disableSmoothScroll(page);
  await expect(page.locator('#scroll-cue')).toBeVisible();
  await expect(page.locator('#scroll-cue')).toHaveCSS('opacity', '1');

  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(page.locator('#scroll-cue')).toBeHidden();
  await expect(page.locator('#scroll-cue')).toHaveCSS('opacity', '0');

  // Pins the "permanent" decision: returning to the top is itself proof the
  // reader knows the page scrolls, so the cue must not reappear.
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await expect(page.locator('#scroll-cue')).toBeHidden();
  await expect(page.locator('#scroll-cue')).toHaveCSS('opacity', '0');
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
  await expect(page.locator('#scroll-cue')).toHaveCSS('opacity', '0');
  // The button ships hidden in the markup, so the assertions above pass even
  // with initScrollCue() deleted entirely. Assert on something script-driven
  // instead — the rail only ever reaches opacity 0 via initScrollProgress()'s
  // measure() — to prove this page's scripts actually ran.
  await expect(page.locator('#scroll-rail')).toHaveCSS('opacity', '0');
});

// This pair has to stay a pair. The reduced-motion test alone would also
// pass if the slide were never wired up at all.
test('rule slides when motion is allowed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.waitForLoadState('load');
  expect(await ruleAnimation(page)).toBe('cueSlide');
});

test('slide is disabled under prefers-reduced-motion, cue still shows', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForLoadState('load');

  await expect(page.locator('#scroll-cue')).toBeVisible();
  await expect(page.locator('#scroll-cue')).toHaveCSS('opacity', '1');
  expect(await ruleAnimation(page)).toBe('none');
});

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
  // Upper-bounded too: this should land about one viewport down, not three.
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(vh * 1.1);
  // Activating the cue is itself a scroll, so it dismisses like any other.
  await expect(page.locator('#scroll-cue')).toBeHidden();
  await expect(page.locator('#scroll-cue')).toHaveCSS('opacity', '0');
});
