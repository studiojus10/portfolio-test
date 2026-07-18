import { expect, test } from '@playwright/test';

test('home carousel initializes at /', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect(page.locator('#carousel-track > *').first()).toBeVisible();
});

test('contact renders at clean URL /contact with static nav', async ({
  page,
}) => {
  await page.goto('/contact');
  await expect(page.locator('nav')).toBeVisible();
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await expect(
    page.locator('nav a[href="/photography"]').first(),
  ).toBeVisible();
});

test('theme toggle flips and persists', async ({ page }) => {
  await page.goto('/contact');
  await page.locator('#theme-toggle').dispatchEvent('click');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('old .html URL 404s (clean break)', async ({ page }) => {
  const res = await page.goto('/contact.html');
  expect(res?.status()).toBe(404);
});

test('unknown route serves branded 404 page', async ({ page }) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('Page not found')).toBeVisible();
});

test('mobile menu opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/contact');
  await page.locator('#mobile-menu-toggle').click();
  await expect(page.locator('#mobile-menu')).toHaveClass(/translate-x-0/);
});

for (const path of [
  '/photography',
  '/photography/colorado',
  '/photography/nature',
]) {
  test(`nav renders on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
    await expect(
      page.locator('nav a[href="/photography"]').first(),
    ).toBeVisible();
  });
}

test('nav renders on /photography/colorado/twelve-views', async ({ page }) => {
  await page.goto('/photography/colorado/twelve-views');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await expect(
    page.locator('nav a[href="/photography"]').first(),
  ).toBeVisible();
});

test('nav renders on /photography/film/memory', async ({ page }) => {
  await page.goto('/photography/film/memory');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await expect(
    page.locator('nav a[href="/photography"]').first(),
  ).toBeVisible();
});

test('nav renders on /video', async ({ page }) => {
  await page.goto('/video');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await expect(page.locator('nav a[href="/video"]').first()).toBeVisible();
});

test('nav renders on /video/dublin', async ({ page }) => {
  await page.goto('/video/dublin');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
});

test('nav renders on /art/sketches', async ({ page }) => {
  await page.goto('/art/sketches');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await expect(page.locator('nav a[href="/art"]').first()).toBeVisible();
});

test('nav renders on /projects/peak-pet', async ({ page }) => {
  await page.goto('/projects/peak-pet');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await expect(page.locator('nav a[href="/projects"]').first()).toBeVisible();
});

test('about renders at /about (no broken non-media resources)', async ({
  page,
}) => {
  // Media lives in a mounted volume (not in git / the CI checkout), so /assets
  // 404s are expected in CI; this still catches broken CSS/JS/HTML paths.
  const failures: string[] = [];
  page.on('response', (r) => {
    if (r.status() === 404 && !r.url().includes('/assets/'))
      failures.push(r.url());
  });
  await page.goto('/about');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(failures, `non-media 404s: ${failures.join(', ')}`).toHaveLength(0);
});
