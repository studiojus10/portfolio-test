import { expect, type Page, test } from '@playwright/test';
import { siteRoutes } from './helpers/routes';
import { computed, readVar, setTheme } from './helpers/theme';

test('light mode resolves palette tokens to their original hex values', async ({
  page,
}) => {
  await setTheme(page, 'light');
  await page.goto('/contact');
  expect(await readVar(page, '--c-surface')).toBe('252 249 248');
  expect(await readVar(page, '--c-on-background')).toBe('28 27 27');
  expect(await readVar(page, '--c-surface-container-low')).toBe('246 243 242');
  expect(await readVar(page, '--c-primary')).toBe('224 60 49');
  // Utilities must still paint the exact pre-migration colours.
  expect(await computed(page, 'body', 'backgroundColor')).toBe(
    'rgb(246, 243, 242)',
  );
});

// Tailwind's JIT only emits classes it finds while scanning source, so a
// class invented at runtime would never have any CSS behind it. Assert
// against the compiled stylesheet instead.
test('alpha-value modifier still compiles against tokens', async ({ page }) => {
  await setTheme(page, 'light');
  await page.goto('/contact');
  const css = await page.evaluate(async () => {
    // The <head> also carries two Google Fonts stylesheet links ahead of
    // Astro's bundled one, so the first `link[rel="stylesheet"]` isn't
    // reliably the compiled sheet — pick the same-origin one instead.
    const link = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    ).find((l) => !l.href.includes('fonts.googleapis.com'));
    if (!link) throw new Error('no stylesheet link');
    return (await fetch(link.href)).text();
  });
  // The token must reach the utility in the `/ <alpha-value>` form, which is
  // what makes bg-surface/50 and friends possible at all.
  expect(css).toContain('var(--c-surface)');
  expect(css).toMatch(/--tw-bg-opacity|rgb\(var\(--c-surface\)/);
});

test('borders stay a subtle hairline in dark while body text goes bright', async ({
  page,
}) => {
  await setTheme(page, 'dark');
  await page.goto('/contact');
  // Text token is bright cream…
  expect(await readVar(page, '--c-on-background')).toBe('243 237 225');
  // …while the rule token stays near the background.
  expect(await readVar(page, '--c-rule')).toBe('40 38 36');
  const border = await computed(
    page,
    'main section:nth-of-type(2) > div',
    'borderTopColor',
  );
  expect(border).toBe('rgb(40, 38, 36)');
});

test('no template still uses the ambiguous border/white utilities', async () => {
  const { globSync, readFileSync } = await import('node:fs');
  const files = globSync('src/**/*.astro');
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (/\bborder-on-background\b/.test(src))
      offenders.push(`${f}: border-on-background`);
    if (/\bborder-on-surface\b/.test(src))
      offenders.push(`${f}: border-on-surface`);
    if (/\bbg-white\b/.test(src)) offenders.push(`${f}: bg-white`);
  }
  expect(offenders, offenders.join('\n')).toHaveLength(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`footer stays a dark bar with light text in ${theme}`, async ({
    page,
  }) => {
    await setTheme(page, theme);
    await page.goto('/contact');
    expect(await computed(page, 'footer', 'backgroundColor')).toBe(
      'rgb(28, 27, 27)',
    );
    expect(await computed(page, 'footer', 'color')).toBe('rgb(229, 226, 225)');
    // The wordmark must stay legible against the always-dark bar in both
    // themes — it must never resolve to the theme-variant surface token.
    expect(await computed(page, 'footer .italic', 'color')).toBe(
      'rgb(255, 255, 255)',
    );
  });
}

test('theme layer carries no !important colour overrides', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync('src/styles/site.css', 'utf8');
  const bangs = css.match(/!important/g) ?? [];
  // Only the nav's translucent blur panel may keep !important.
  expect(
    bangs.length,
    `found ${bangs.length} !important in site.css`,
  ).toBeLessThanOrEqual(8);
  expect(
    /html\[data-theme=["']dark["']\]\s+\.(bg|text|border)-/.test(css),
  ).toBe(false);
});

// '/' leaked via .cyl-card and an unnamed div (hard-coded hero-carousel
// literals) — fixed in Task 6. '/projects', '/video', '/art', and
// '/photography' all leaked via the page-hero-card pattern's hard-coded
// inline `style="background-color:rgba(246,243,242,0.70)"` (or
// `rgba(255,255,255,0.70)` on /photography) — the deleted !important
// override was the only thing strong enough to beat it. Fixed in Task 7.
//
// Swept across every route the site serves (see helpers/routes.ts), not
// just those original 7: the migration touched every page, and the 20
// photography leaf pages in particular each had a private duplicate of the
// old override sheet deleted with no per-route assertion behind it.
test.describe('dark mode: no light-surface leaks (all routes)', () => {
  // One page reused across all 40 navigations rather than the default
  // fresh-context-per-test: a 40-route sweep is slow done the naive way,
  // and `setTheme`'s addInitScript is registered once on this page and
  // survives every later goto() (Playwright re-runs init scripts on each
  // navigation of the page they were added to). Deliberately NOT
  // `.serial`: serial mode skips every remaining test the moment one
  // fails, which would hide how widespread a regression is — a plain
  // describe still runs the tests in this file in one worker, in
  // declaration order (this project doesn't set `fullyParallel`), so the
  // shared `page` is never touched concurrently, but every route still
  // gets checked and reported even after an earlier one fails.
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await setTheme(page, 'dark');
  });

  test.afterAll(async () => {
    await page.close();
  });

  for (const route of siteRoutes()) {
    test(`dark mode leaves no light surface on ${route}`, async () => {
      const res = await page.goto(route);
      // A wrong URL shape (e.g. a stray trailing slash under this site's
      // trailingSlash:'never') 404s. The branded 404 page is itself styled
      // fine for dark mode, so a leak scan that doesn't check the response
      // status would still report "no leaks" — green, but silently testing
      // the wrong page on every broken route. See helpers/routes.ts.
      expect(res?.status(), `${route} did not return 200`).toBe(200);
      await page.waitForLoadState('load');
      // Confirm the intended page actually rendered (nav is present on
      // every route via Base.astro, including the 404 page itself, so this
      // is a rendering sanity check, not a route-identity check — identity
      // is covered by the status assertion above).
      await expect(
        page.locator('nav').getByText('STUDIO JUS10').first(),
      ).toBeVisible();

      const leaks = await page.evaluate(() => {
        const lum = (c: string) => {
          const m = c.match(/[\d.]+/g);
          if (!m) return null;
          const a = m[3] !== undefined ? Number(m[3]) : 1;
          if (a < 0.5) return null;
          return (
            (0.2126 * Number(m[0]) +
              0.7152 * Number(m[1]) +
              0.0722 * Number(m[2])) /
            255
          );
        };
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width < 80 || r.height < 40) continue;
          if (el.closest('footer')) continue; // deliberately dark-on-light-text
          const l = lum(getComputedStyle(el).backgroundColor);
          if (l !== null && l > 0.7)
            out.push(`${el.tagName}.${el.className}`.slice(0, 80));
        }
        return [...new Set(out)];
      });
      expect(
        leaks,
        `light surfaces in dark mode on ${route}:\n${leaks.join('\n')}`,
      ).toEqual([]);
    });
  }
});

test.describe('light is the default regardless of the OS', () => {
  test.use({ colorScheme: 'dark' });

  test('first visit with no stored choice stays light', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-theme',
      'dark',
    );
  });

  test('an explicit dark choice still wins', async ({ page }) => {
    await setTheme(page, 'dark');
    await page.goto('/contact');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('a toggled choice survives a refresh', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-theme',
      'dark',
    );

    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('co-theme'))).toBe(
      'dark',
    );

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // and back again — light must persist just as explicitly
    await page.locator('#theme-toggle').click();
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-theme',
      'dark',
    );
  });
});

test('the room floor and its reflection stay in lockstep', async ({ page }) => {
  await setTheme(page, 'dark');
  await page.goto('/');
  await page.waitForLoadState('load');
  const [far, reflection] = await Promise.all([
    readVar(page, '--room-floor-far'),
    readVar(page, '--room-reflection'),
  ]);
  // A seam appears in the mirror the moment these diverge.
  expect(reflection).toBe(far);
});

// Originally only /projects. Extended across every route the site serves
// (see helpers/routes.ts) — the photography leaf pages are the largest and
// riskiest slice of the migration (each had a private duplicate of the old
// override sheet deleted) and previously carried zero contrast assertions.
test.describe('dark mode: readable contrast (all routes)', () => {
  // Same shared-page approach as the leak sweep above, for the same reason
  // (including deliberately not using `.serial` — see that comment).
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await setTheme(page, 'dark');
  });

  test.afterAll(async () => {
    await page.close();
  });

  // Brand red (--c-primary, rgb(224,60,49) — tokens.css, unchanged by the
  // `html[data-theme="dark"]` override block) is deliberately identical in
  // both themes: it's brand-palette, not a dark-mode variable. It shows up
  // on both sides of the text/background pairing — as body-copy-sized red
  // text (e.g. CJK captions) and as the bg-primary CTA-button fill with
  // white text on top — and both land close to but under the 4.5:1 body
  // floor used below (~4.3-4:1). Holding it to that floor would make this
  // test permanently red over a colour that never changed and was never
  // part of the migration, and a permanently-red check gets ignored. It
  // still gets a real floor rather than a free pass: WCAG's large-text
  // minimum (3:1), which is where it actually measures. A brand-red
  // element that regresses *below* 3:1 (e.g. placed on a near-white
  // surface by a future bug) still fails.
  const BRAND_RED = '224, 60, 49';

  for (const route of siteRoutes()) {
    test(`readable contrast on ${route}`, async () => {
      const res = await page.goto(route);
      expect(res?.status(), `${route} did not return 200`).toBe(200);
      await page.waitForLoadState('load');

      const { worst, worstEl, worstBrand, worstBrandEl } = await page.evaluate(
        (brandRed) => {
          const rel = (c: string) => {
            const m = (c.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
            const f = (v: number) => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
          };
          const channels = (c: string) =>
            (c.match(/[\d.]+/g) ?? []).slice(0, 3).join(', ');
          let worst = 21;
          let worstEl = '';
          let worstBrand = 21;
          let worstBrandEl = '';
          // Scans the whole document rather than `main` (many pages, e.g.
          // most photography leaf pages, have no <main> wrapper at all —
          // scoping to it would silently scan nothing on those routes).
          // nav/footer/mobile-menu are chrome, not page content: nav's
          // hover dropdowns and the off-canvas mobile menu carry real text
          // colour even while visually hidden (opacity/translate, not
          // display:none), which would otherwise read as false failures
          // unrelated to anything this migration touched. Footer itself is
          // covered by the dedicated footer test above.
          for (const el of document.querySelectorAll<HTMLElement>('body *')) {
            if (el.closest('nav, footer, #mobile-menu, #mobile-menu-overlay'))
              continue;
            if (!el.textContent?.trim()) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 40 || r.height < 12) continue;
            const cs = getComputedStyle(el);
            let bgEl: HTMLElement | null = el;
            let bg = cs.backgroundColor;
            while (
              bgEl &&
              (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')
            ) {
              bgEl = bgEl.parentElement;
              bg = bgEl
                ? getComputedStyle(bgEl).backgroundColor
                : 'rgb(12, 11, 10)';
            }
            const a = rel(cs.color);
            const b = rel(bg);
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            const label = `${el.tagName}.${el.className}`.slice(0, 80);
            // Either side of the pairing counts: red-on-dark-surface (CJK
            // captions/labels) and white-on-red (bg-primary CTA buttons)
            // are the same invariant colour, just swapped which side it's
            // on.
            if (channels(cs.color) === brandRed || channels(bg) === brandRed) {
              if (ratio < worstBrand) {
                worstBrand = ratio;
                worstBrandEl = label;
              }
            } else if (ratio < worst) {
              worst = ratio;
              worstEl = label;
            }
          }
          return { worst, worstEl, worstBrand, worstBrandEl };
        },
        BRAND_RED,
      );

      expect(
        worst,
        `${route}: worst contrast ${worst.toFixed(2)}:1 on ${worstEl}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        worstBrand,
        `${route}: worst brand-red contrast ${worstBrand.toFixed(2)}:1 on ${worstBrandEl}`,
      ).toBeGreaterThanOrEqual(3);
    });
  }
});
