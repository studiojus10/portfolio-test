import type { Page } from '@playwright/test';

/** How far the document can actually scroll, in px. */
export function scrollableDistance(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
}

/**
 * <html> carries Tailwind's `scroll-smooth`, so a programmatic scroll
 * animates. Turning it off makes each scroll land in one step.
 */
export async function disableSmoothScroll(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
  });
}
