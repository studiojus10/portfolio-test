import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __cyl: {
      advance: (rotation: number, dt: number, factor: number) => number;
      state: () => { rotation: number; hovering: boolean };
    };
    __vert: { state: () => { offset: number } };
  }
}

test('home hero renders 10 cylinder work cards as links', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  const ring = page.locator('#cyl-ring');
  await expect(ring).toBeAttached(); // 0x0 positioning anchor; cards are absolute
  // 10 original works (JS-added clones are aria-hidden)
  const originals = ring.locator('> a.cyl-card:not([aria-hidden="true"])');
  await expect(originals).toHaveCount(10);
  await expect(originals.first()).toBeVisible();
  await expect(originals.first()).toHaveAttribute(
    'href',
    '/photography/colorado/twelve-views',
  );
  await expect(page.locator('#cyl-floor-ring')).toHaveCount(1);
  // the old room walls are gone
  await expect(page.locator('#room-wall-left')).toHaveCount(0);
  await expect(page.locator('#floor-reflection')).toHaveCount(0);
});

test('cylinder rotation is time-based (double dt -> double advance)', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  const [a, b] = await page.evaluate(() => [
    window.__cyl.advance(0, 1, 1),
    window.__cyl.advance(0, 2, 1),
  ]);
  expect(a).toBeCloseTo(8, 5); // 8 deg/sec * 1s
  expect(b).toBeCloseTo(16, 5); // proportional to dt -> frame-rate independent
});

test('clicking a cylinder card navigates to its page', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  }); // freeze
  await page.waitForTimeout(60);
  const href = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#cyl-ring > a.cyl-card')];
    const vw = innerWidth;
    for (const a of cards) {
      const r = a.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      if (
        getComputedStyle(a).pointerEvents === 'auto' &&
        cx > vw * 0.4 &&
        cx < vw * 0.6
      ) {
        (a as HTMLElement).dataset.testTarget = '1';
        return a.getAttribute('href');
      }
    }
    return null;
  });
  expect(href).toBeTruthy();
  await page.locator('#cyl-ring > a.cyl-card[data-test-target="1"]').click();
  await expect(page).toHaveURL(new RegExp(`${href?.replace(/\//g, '\\/')}$`));
});

test('dragging the cylinder scrubs it without navigating', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(60);
  const before = await page.evaluate(() => window.__cyl.state().rotation);
  const url = page.url();
  const box = await page.locator('#home-hero-section').boundingBox();
  if (!box) throw new Error('no hero box');
  const y = Math.round(box.y + box.height * 0.42);
  const x1 = Math.round(box.x + box.width * 0.7);
  const x2 = Math.round(box.x + box.width * 0.2);
  await page.mouse.move(x1, y);
  await page.mouse.down();
  for (let x = x1; x >= x2; x -= 20) await page.mouse.move(x, y);
  await page.mouse.up();
  const after = await page.evaluate(() => window.__cyl.state().rotation);
  expect(page.url()).toBe(url); // no navigation
  expect(Math.abs(after - before)).toBeGreaterThan(3); // rotated
});

test('hover slows only over a card, not the empty hero', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  const box = await page.locator('#home-hero-section').boundingBox();
  if (!box) throw new Error('no hero box');
  // empty room near the very top of the hero (above the wall band)
  await page.mouse.move(
    Math.round(box.x + box.width / 2),
    Math.round(box.y + 12),
  );
  expect(await page.evaluate(() => window.__cyl.state().hovering)).toBe(false);
  // over a frontal card
  const pt = await page.evaluate(() => {
    const vw = innerWidth;
    for (const a of document.querySelectorAll('#cyl-ring > a.cyl-card')) {
      const r = a.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      if (
        getComputedStyle(a).pointerEvents === 'auto' &&
        cx > vw * 0.42 &&
        cx < vw * 0.58
      )
        return { x: Math.round(cx), y: Math.round(r.top + r.height * 0.4) };
    }
    return null;
  });
  if (!pt) throw new Error('no frontal card found');
  await page.mouse.move(pt.x, pt.y);
  expect(await page.evaluate(() => window.__cyl.state().hovering)).toBe(true);
});

test('next button rotates the cylinder by one step', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(60);
  const before = await page.evaluate(() => window.__cyl.state().rotation);
  await page.locator('#carousel-next').click();
  const after = await page.evaluate(() => window.__cyl.state().rotation);
  expect(after).not.toBe(before);
});

test('scrolling past the hero reveals the About section', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.evaluate(() =>
    window.scrollTo({ top: window.innerHeight * 1.1, behavior: 'instant' }),
  );
  await page.waitForTimeout(120);
  // Cylinder scrolls off naturally (stays a cylinder, no fade); About comes up.
  await expect(page.locator('#about')).toBeInViewport();
});

test('vertical carousel advances by wall-clock time', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.evaluate(() =>
    window.scrollTo({ top: window.innerHeight * 1.4, behavior: 'instant' }),
  );
  await page.waitForTimeout(150); // let it reveal + start
  const t0 = await page.evaluate(() => window.__vert.state().offset);
  await page.waitForTimeout(500);
  const t1 = await page.evaluate(() => window.__vert.state().offset);
  expect(Math.abs(t1 - t0)).toBeGreaterThan(10); // moved on a time basis
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
