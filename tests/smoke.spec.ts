import { expect, test } from '@playwright/test';

test.describe('shared chrome', () => {
  test('nav renders with brand + primary links', async ({ page }) => {
    await page.goto('/contact.html');
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
    await expect(
      page.locator('nav a[href="/photography.html"]').first(),
    ).toBeVisible();
  });

  test('theme toggle flips and persists', async ({ page }) => {
    await page.goto('/contact.html');
    // The desktop nav animates to translateY(-100%) (above the fold) on every
    // page except the homepage, revealing only via scroll/hover/tap. A
    // coordinate click — even { force: true } — errors with "outside of
    // viewport" once the hide animation settles, so a real click here is
    // timing/load-flaky. This smoke test targets the toggle's WIRING, not the
    // reveal choreography, so dispatch the click event directly on the button.
    await page.locator('#theme-toggle').dispatchEvent('click');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('mobile menu opens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/contact.html');
    await page.locator('#mobile-menu-toggle').click();
    await expect(page.locator('#mobile-menu')).toHaveClass(/translate-x-0/);
  });
});

test('home carousel initializes', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForLoadState('load');
  await expect(page.locator('#carousel-track > *').first()).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.locator('#carousel-track-left').innerHTML()).length,
    )
    .toBeGreaterThan(0);
});

for (const path of [
  '/photography.html',
  '/photography-colorado.html',
  '/photography-nature.html',
]) {
  test(`nav renders on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
    await expect(
      page.locator('nav a[href="/photography.html"]').first(),
    ).toBeVisible();
  });
}

test('nav renders on /photography-colorado-twelve-views.html', async ({
  page,
}) => {
  await page.goto('/photography-colorado-twelve-views.html');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await expect(
    page.locator('nav a[href="/photography.html"]').first(),
  ).toBeVisible();
});

test('nav renders on /photography-film-memory.html', async ({ page }) => {
  await page.goto('/photography-film-memory.html');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await expect(
    page.locator('nav a[href="/photography.html"]').first(),
  ).toBeVisible();
});

test('nav renders on /video.html', async ({ page }) => {
  await page.goto('/video.html');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await expect(page.locator('nav a[href="/video.html"]').first()).toBeVisible();
});

test('nav renders on /art.html', async ({ page }) => {
  await page.goto('/art.html');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await expect(page.locator('nav a[href="/art.html"]').first()).toBeVisible();
});
test('nav renders on /projects.html', async ({ page }) => {
  await page.goto('/projects.html');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await expect(
    page.locator('nav a[href="/projects.html"]').first(),
  ).toBeVisible();
});

test('about page renders and loads its assets (no 404)', async ({ page }) => {
  const failures: string[] = [];
  page.on('response', (r) => {
    if (r.status() === 404) failures.push(r.url());
  });
  await page.goto('/about/about.html');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(failures, `404s: ${failures.join(', ')}`).toHaveLength(0);
});
