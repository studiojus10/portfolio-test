# Vite Migration + Code-Quality Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 39-page Studio Jus10 static site to a Vite multi-page app with all inline scripts extracted into ES modules, shared runtime nav/theme modules, root-absolute asset paths, Biome tooling, a Playwright smoke suite, and Forgejo Actions CI — behavior-preserving throughout.

**Architecture:** Vite MPA keeps every HTML file as an entry point. Each page loads a single `type="module"` entry (`src/pages/<page>.js`) that imports a shared `bootstrap.js` (CSS + runtime nav + theme) and then its own former inline scripts. Tailwind v3 runs through Vite's PostCSS pipeline. The only pre-paint script (theme flash-prevention) is injected into every page's `<head>` at build time via `transformIndexHtml`, so no inline `<script>` remains in source HTML.

**Tech Stack:** Vite 8, Tailwind CSS v3 (PostCSS + autoprefixer), Biome 2, Playwright, Forgejo Actions. Node 26 (dev + CI; Vite 8's floor is `^20.19 || >=22.12`, pinned via `.nvmrc`).

## Global Constraints

- **Behavior-preserving.** Every page looks and behaves identically pre/post migration. No visual redesign, no content changes.
- **Tailwind stays v3.** No v4 upgrade.
- **Asset references are root-absolute `/assets/...`** everywhere — in HTML attributes AND in JS string literals (page scripts assign `img.src = '/assets/...'`).
- **No inline `<script>` in source HTML.** The pre-paint theme snippet is the sole exception and is injected via `transformIndexHtml`, not written into any `.html` file.
- **Nav is rendered at runtime** by an ES module (`renderNav()`), injected into `#nav-root` — same model as today.
- **All 39 page URLs are preserved.** HTML files stay at their current paths; inter-page `<a>` links are untouched.
- **Media lives in `public/assets/`.** Git LFS tracks by extension, so `git mv` preserves tracking.
- **Theme storage key is `co-theme`; dark mode is `html[data-theme="dark"]`.**
- **Node 26** for dev + CI, pinned via `.nvmrc`; `package.json` `engines` records the true floor (`>=22.12.0`, per Vite 8's `^20.19 || >=22.12`). `npm ci` for installs.
- **Dependencies are kept at latest** (Vite 8, Biome 2, latest PostCSS/autoprefixer/fast-glob/Playwright/Tailwind plugins) — the sole pin is **Tailwind core stays v3** (no v4).
- **Biome does not lint HTML** (`!**/*.html`); it checks JS/CSS/config only. HTML is reviewed manually. Ported legacy JS gets a scoped `overrides` leniency; new code gets the full recommended ruleset.
- Commit after each task. Do not push (origin is a fresh empty Forgejo repo; pushing is the owner's call).

## File structure (target)

```
/ (repo root = Vite root)
├── index.html … about/about.html      # 39 entries: content only, one module <script> each
├── src/
│   ├── pages/     index.js, photography.js, … (one per page)
│   ├── lib/       bootstrap.js, nav.js, theme.js, carousel-stills.js
│   └── styles/    main.css (@tailwind + @import), site.css (former styles.css)
├── public/assets/                      # all media (git mv from ./assets, minus css/js)
├── vite.config.js
├── postcss.config.js
├── tailwind.config.js                  # updated content globs
├── biome.json
├── playwright.config.js
├── tests/         smoke.spec.ts
├── vercel.json                         # outputDirectory → dist
├── .forgejo/workflows/ci.yml
└── package.json
```

---

## Task 1: Tooling & CSS pipeline scaffold

Stand up Vite + Tailwind-via-PostCSS + Biome and the CSS entry. No page is migrated yet; the deliverable is a working build/lint pipeline.

**Files:**
- Modify: `package.json` (deps + scripts)
- Create: `vite.config.js`, `postcss.config.js`, `biome.json`
- Modify: `tailwind.config.js` (content globs)
- Create: `src/styles/main.css`, `src/styles/site.css`
- Delete: `src/input.css`

**Interfaces:**
- Produces: `THEME_SNIPPET` injected into every entry `<head>` by a Vite plugin; `npm run dev/build/preview`, `npm run format/lint/check`, `npm run test` scripts.

- [ ] **Step 1: Install dependencies**

```bash
npm install -D vite@^5 autoprefixer@^10 postcss@^8 fast-glob@^3 @biomejs/biome@^1 @playwright/test@^1
```

Expected: installs succeed; `tailwindcss`, `@tailwindcss/forms`, `@tailwindcss/container-queries` are already present.

- [ ] **Step 2: Update `package.json` scripts**

Replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "format": "biome format --write .",
  "lint": "biome lint .",
  "check": "biome check .",
  "test": "playwright test"
}
```

- [ ] **Step 3: Create `postcss.config.js`**

The project stays CommonJS (no `"type": "module"` in `package.json`), so config
files that Node loads directly (PostCSS, Tailwind, Playwright) use CJS. Vite
loads `vite.config.js` through its own bundler, so that one file may use ESM.

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Update `tailwind.config.js` content globs**

Change the `content` array (line 3) from `['./*.html', './assets/js/*.js']` to:

```js
  content: ['./*.html', './about/*.html', './src/**/*.js'],
```

Leave everything else in `tailwind.config.js` unchanged. (`module.exports` stays — Tailwind config is read via PostCSS in CJS context; this is fine alongside ESM `postcss.config.js`.)

- [ ] **Step 5: Create the CSS entry `src/styles/main.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Do NOT `@import "./site.css"` here — a CSS `@import` after other rules is
invalid ordering (Biome flags it), and importing it *before* `@tailwind` would
invert the cascade. Instead, `bootstrap.js` (Task 2) imports `main.css` then
`site.css` in order, preserving today's "tailwind first, site overrides"
cascade.

- [ ] **Step 6: Move hand-written CSS to `src/styles/site.css`**

```bash
git mv assets/css/styles.css src/styles/site.css
git rm src/input.css assets/css/tailwind.css
```

(`assets/css/tailwind.css` is the empty generated placeholder; `src/input.css` is superseded by `main.css`.)

- [ ] **Step 7: Create `vite.config.js`**

```js
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import fg from 'fast-glob';

// Pre-paint theme snippet: must run synchronously before first paint, so it
// cannot be a deferred module. Defined once here, injected into every entry.
const THEME_SNIPPET =
  "(function(){var t=localStorage.getItem('co-theme');" +
  "if(t==='dark')document.documentElement.setAttribute('data-theme','dark');})();";

const input = Object.fromEntries(
  fg.sync(['*.html', 'about/*.html']).map((f) => [f, resolve(__dirname, f)]),
);

export default defineConfig({
  appType: 'mpa',
  build: {
    outDir: 'dist',
    rollupOptions: { input },
  },
  plugins: [
    {
      name: 'inject-pre-paint-theme',
      transformIndexHtml() {
        return [
          { tag: 'script', children: THEME_SNIPPET, injectTo: 'head-prepend' },
        ];
      },
    },
  ],
});
```

- [ ] **Step 8: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "ignore": [
      "assets/**",
      "assets_js_old/**",
      "public/**",
      "dist/**",
      "node_modules/**"
    ]
  },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "noVar": "off", "useConst": "off" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "single" } }
}
```

`noVar`/`useConst` are disabled because shared modules are ported **verbatim**
from the legacy IIFEs (which use `var`) to preserve behavior; re-modernizing
them is out of scope. `files.ignore` scopes Biome to real source: the legacy
JS (`assets/`, and the `assets_js_old/` porting-source that exists mid-
migration) is vendored code being deleted in Task 8, and `public/`/`dist/` are
media/build output — none should be linted. `biome check .` / `biome ci .`
then run clean throughout the migration.

- [ ] **Step 9: Verify the pipeline boots and lints**

A full `vite build` processes all 39 entries eagerly and would fail here,
because unmigrated pages still `<link>` the legacy CSS that Task 1 removed.
During migration the gate is the **dev server** (serves pages on demand); the
full production build is asserted in Task 8 once every page is converted.

Run: `npm run dev` (then request a page, e.g. `curl -sI http://localhost:5173/contact.html`)
Expected: dev server boots; the page returns 200. `transformIndexHtml` injects
the pre-paint theme `<script>` into the served HTML (`curl -s .../contact.html | grep co-theme`). Stop the server.

Run: `npx biome check .`
Expected: passes (or only formatting nits on the new files — run `npm run format` to fix, then re-run).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Scaffold Vite + Tailwind PostCSS + Biome pipeline"
```

---

## Task 2: Shared modules + first page (contact) + smoke harness

Build the runtime nav/theme/bootstrap modules, prove them on the simplest page (`contact.html`), and stand up the Playwright smoke suite. Media moves to `public/` here so migrated pages resolve assets.

**Files:**
- Create: `src/lib/theme.js`, `src/lib/nav.js`, `src/lib/bootstrap.js`, `src/lib/carousel-stills.js`
- Create: `src/pages/contact.js`
- Modify: `contact.html`
- Create: `playwright.config.js`, `tests/smoke.spec.ts`
- Move: `assets/` media → `public/assets/` (excluding `assets/css`, `assets/js`)

**Interfaces:**
- Produces:
  - `theme.js` → `export function initTheme()` — wires `#theme-toggle` / `#theme-toggle-mobile`, sets initial icon/label UI, toggles `html[data-theme]` and persists `co-theme`, calls `window.onNavThemeChange` if present.
  - `nav.js` → `export function renderNav()` — builds the nav markup (ported from `assets/js/nav.js`), replaces `#nav-root`, wires mobile menu + dropdown wheel-block + hide/reveal-on-scroll, sets `window._navReveal`, and calls `initTheme()`.
  - `carousel-stills.js` → `export function seekStills(root = document)` — for every `.carousel-still` under `root`, seek to `currentTime = 3` on `loadedmetadata` (and immediately if `readyState >= 1`).
  - `bootstrap.js` → side-effect module: imports `../styles/main.css` then `../styles/site.css` (in that order), calls `renderNav()`. Page modules import it first.

- [ ] **Step 1: Move media into `public/`**

```bash
mkdir -p public
git mv assets public/assets
# nav.js/main.js are the source of truth for the ports; hold them at repo root.
git mv public/assets/js assets_js_old
# assets/css was emptied in Task 1 (styles.css moved to src/, tailwind.css removed).
git rm -r public/assets/css 2>/dev/null; true
```

Expected: all images/videos/posters/logo/documents now under `public/assets/...`; `assets_js_old/{nav.js,main.js}` retained as the porting source; no `public/assets/css` or `public/assets/js`.

- [ ] **Step 2: Create `src/lib/theme.js`**

Port the theme logic out of `assets_js_old/nav.js` (the `updateThemeUI` / `toggleTheme` / button-wiring block, lines ~213–233 of the original) into a module:

```js
// Theme toggle + persistence. Pre-paint application happens in the injected
// head snippet (see vite.config.js); this wires the interactive toggles.
function updateThemeUI() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.querySelectorAll('.theme-icon').forEach((el) => {
    el.textContent = dark ? 'light_mode' : 'dark_mode';
  });
  document.querySelectorAll('.theme-label').forEach((el) => {
    el.textContent = dark ? 'Light Mode' : 'Dark Mode';
  });
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  if (isDark) {
    html.removeAttribute('data-theme');
    localStorage.setItem('co-theme', 'light');
  } else {
    html.setAttribute('data-theme', 'dark');
    localStorage.setItem('co-theme', 'dark');
  }
  updateThemeUI();
  if (typeof window.onNavThemeChange === 'function') window.onNavThemeChange();
}

export function initTheme() {
  updateThemeUI();
  const btn = document.getElementById('theme-toggle');
  const btnMobile = document.getElementById('theme-toggle-mobile');
  if (btn) btn.addEventListener('click', toggleTheme);
  if (btnMobile) btnMobile.addEventListener('click', toggleTheme);
}
```

- [ ] **Step 3: Create `src/lib/nav.js`**

Create the module by wrapping the existing nav code from `assets_js_old/nav.js`:

```js
import { initTheme } from './theme.js';

export function renderNav() {
  // ── Active-state detection, template helpers, and HTML string ──
  // PORT VERBATIM from assets_js_old/nav.js lines 5–171 (everything from
  // `var p = window.location...` through the `#nav-root` outerHTML injection),
  // EXCEPT the theme block (initTheme handles it — do not port updateThemeUI/
  // toggleTheme/theme button wiring here).
  //
  // ...ported code...

  // ── Post-injection wiring: mobile menu, dropdown wheel-block, hide/reveal
  // on scroll — PORT VERBATIM from assets_js_old/nav.js lines 173–294,
  // EXCEPT the theme button lines. Keep window._navReveal assignment.
  //
  // ...ported code...

  initTheme();
}
```

The edits while porting: (a) drop the outer IIFE wrapper (the `export function` replaces it); (b) remove the theme `updateThemeUI`/`toggleTheme`/`themeBtn` block (now in `theme.js`); (c) **make internal page links root-absolute** — change the `lnk(...)` href arguments from `index.html`, `photography.html`, …, `about/about.html` to `/index.html`, `/photography.html`, …, `/about/about.html` (a one-character prefix on each nav/logo/dropdown/contact href). This fixes navigation from the nested `/about/` page, where today's relative links resolve to the non-existent `/about/photography.html`; it is byte-identical behavior on the 38 root pages. Keep every string of nav markup and every event wiring otherwise unchanged.

> **Note to owner:** this is a second latent about-page defect (its nav links currently 404 from `/about/`), fixed here alongside the asset-path repair. Vercel `cleanUrls` still serves `/photography.html` links correctly.

- [ ] **Step 4: Create `src/lib/carousel-stills.js`**

```js
// Seek `.carousel-still` <video> elements to a fixed frame (no playback).
export function seekStills(root = document) {
  root.querySelectorAll('.carousel-still').forEach((vid) => {
    vid.addEventListener('loadedmetadata', () => {
      vid.currentTime = 3;
    });
    if (vid.readyState >= 1) vid.currentTime = 3;
  });
}
```

- [ ] **Step 5: Create `src/lib/bootstrap.js`**

```js
import '../styles/main.css'; // @tailwind layers first…
import '../styles/site.css'; // …then hand-written overrides (preserves cascade)
import { renderNav } from './nav.js';

// ES modules are deferred, so the DOM (including #nav-root) is parsed by now.
renderNav();
```

- [ ] **Step 6: Create `src/pages/contact.js`**

```js
import '../lib/bootstrap.js';

// Move contact.html's page-specific inline <script> bodies here verbatim,
// each still wrapped in its own IIFE. Update any 'assets/...' string literals
// to '/assets/...'.
```

- [ ] **Step 7: Rewire `contact.html`**

In `contact.html`: delete the inline pre-paint theme `<script>` (now injected), the `<script src="assets/js/nav.js">`, the `<script src="assets/js/main.js">`, and each page-specific inline `<script>...</script>` (their bodies moved to `contact.js`). Delete the two `<link rel="stylesheet" href="assets/css/...">` lines. Just before `</body>`, add:

```html
<script type="module" src="/src/pages/contact.js"></script>
```

Then normalize every remaining `assets/...` reference in the file (favicon `href`, `img`/`video` `src`, `poster`, download links) to `/assets/...`.

- [ ] **Step 8: Write the smoke suite (`tests/smoke.spec.ts`)**

```ts
import { expect, test } from '@playwright/test';

test.describe('shared chrome', () => {
  test('nav renders with brand + primary links', async ({ page }) => {
    await page.goto('/contact.html');
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.getByText('STUDIO JUS10')).toBeVisible();
    await expect(page.locator('nav a[href="/photography.html"]').first()).toBeVisible();
  });

  test('theme toggle flips and persists', async ({ page }) => {
    await page.goto('/contact.html');
    await page.locator('#theme-toggle').click();
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
```

- [ ] **Step 9: Create `playwright.config.js`**

```js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  webServer: {
    // Dev server so tests run incrementally during migration (build is
    // eager and can't pass until every page is converted — see Task 8).
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://localhost:4173/contact.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: 'http://localhost:4173' },
});
```

(CJS config; the `tests/*.spec.ts` files can still be TypeScript — Playwright
compiles them itself, no `tsconfig` needed.)

- [ ] **Step 10: Run the smoke suite (expect PASS for shared chrome)**

```bash
npx playwright install chromium
npm run test
```

Expected: the three `shared chrome` tests pass. (Full-page nav-render across all `PAGES` is exercised in later tasks as those pages migrate; for now the suite targets `/contact.html`.)

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Add shared nav/theme/bootstrap modules, migrate contact page, add smoke suite"
```

---

## Task 3: Migrate `index.html` (home carousel)

The most complex page: the room carousel (`main.js`) plus ~8 inline scripts.

**Files:**
- Create: `src/pages/index.js`
- Modify: `index.html`
- Modify: `tests/smoke.spec.ts` (carousel-init test)

**Interfaces:**
- Consumes: `bootstrap.js`, `seekStills` from `carousel-stills.js`.

- [ ] **Step 1: Create `src/pages/index.js`**

```js
import '../lib/bootstrap.js';
import { seekStills } from '../lib/carousel-stills.js';

// 1. Room carousel — PORT VERBATIM the IIFE body from assets_js_old/main.js.
//    Replace its three inline `.carousel-still` loadedmetadata loops with
//    seekStills(<trackEl>) calls where it clones tracks, and seekStills()
//    for the document-wide pass.
// 2. Home inline scripts — move index.html's ~8 inline <script> bodies here
//    verbatim (nav-reveal coordinator, scroll parallax, panel projection,
//    still-seek, etc.), each in its own IIFE.
// 3. Normalize any 'assets/...' string literals to '/assets/...'.
```

- [ ] **Step 2: Rewire `index.html`**

Delete the inline pre-paint theme `<script>`, `nav.js`, `main.js`, and all inline `<script>` blocks (lines 62, 65–79, 723–1012 region per the current file). Delete the two `assets/css` `<link>`s. Keep the page-specific `<style>` block. Add before `</body>`:

```html
<script type="module" src="/src/pages/index.js"></script>
```

Normalize all `assets/...` → `/assets/...` (favicon, every `img`/`video` `src`, `poster`, background `<img>`).

- [ ] **Step 3: Add carousel-init smoke test**

Append to `tests/smoke.spec.ts`:

```ts
test('home carousel initializes', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForLoadState('load');
  await expect(page.locator('#carousel-track > *').first()).toBeVisible();
  await expect
    .poll(async () => (await page.locator('#carousel-track-left').innerHTML()).length)
    .toBeGreaterThan(0);
});
```

- [ ] **Step 4: Build + test**

Run: `npm run test`
Expected: all smoke tests pass, including carousel init.

- [ ] **Step 5: Manual visual check**

Run: `npm run dev`, open `/index.html`. Confirm the hero carousel spins, drag works, person overlay + scroll split animate, background photo fades in, theme toggle works. (Behavior parity is the acceptance bar.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Migrate home page: carousel + inline scripts to src/pages/index.js"
```

---

## Task 4: Migrate the Photography section

Batch-migrate every photography page. Same per-page procedure; one deliverable.

**Files:**
- Create: `src/pages/<page>.js` for each of: `photography`, `photography-colorado`, `photography-colorado-twelve-views`, `photography-colorado-rock-ledge`, `photography-colorado-cornfield`, `photography-colorado-golf`, `photography-arizona`, `photography-arizona-travels`, `photography-washington`, `photography-washington-seattle`, `photography-nature`, `photography-nature-landscapes`, `photography-nature-flowers`, `photography-nature-sanctuary`, `photography-nature-museum`, `photography-film`, `photography-film-europe`, `photography-film-home`, `photography-film-memory`, `photography-europe`, `photography-europe-france-protests`
- Modify: each corresponding `.html`

**Per-page procedure (apply to every file above):**

- [ ] **Step 1: Create `src/pages/<page>.js`**

```js
import '../lib/bootstrap.js';

// Move this page's inline <script> bodies here verbatim (each in its own IIFE).
// If the page uses `.carousel-still` videos, add:
//   import { seekStills } from '../lib/carousel-stills.js';
// and call seekStills() instead of an inline loadedmetadata loop.
// Normalize every 'assets/...' string literal to '/assets/...'.
```

- [ ] **Step 2: Rewire `<page>.html`**

Remove the inline pre-paint theme `<script>`, `nav.js`, `main.js` (present-but-inert on these pages), and all inline `<script>` blocks. Remove the two `assets/css` `<link>`s. Keep any page-specific `<style>`. Add before `</body>`:

```html
<script type="module" src="/src/pages/<page>.js"></script>
```

Normalize all `assets/...` → `/assets/...` in attributes (including the JS `series`/`heroCandidates` arrays that hold `assets/images/...` paths).

- [ ] **Step 3: Extend the nav-render smoke test to cover the section**

In `tests/smoke.spec.ts`, add a parametrized check (once for the whole task):

```ts
for (const path of ['/photography.html', '/photography-colorado.html', '/photography-nature.html']) {
  test(`nav renders on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText('STUDIO JUS10')).toBeVisible();
    await expect(page.locator('nav a[href="/photography.html"]').first()).toBeVisible();
  });
}
```

- [ ] **Step 4: Build + test + spot check**

Run: `npm run test` → all pass.
Manually open `/photography.html` and one leaf (`/photography-colorado-twelve-views.html`) in `npm run dev`; confirm hero, thumbnails, and scroll behavior match the old site.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Migrate photography section to page modules + /assets paths"
```

---

## Task 5: Migrate the Video section

**Files:**
- Create: `src/pages/<page>.js` for each of: `video`, `video-collage`, `video-decadance`, `video-dublin`, `video-murder`, `video-portrait`, `video-resurrection`, `video-single-shot`, `video-winter`
- Modify: each corresponding `.html`

- [ ] **Step 1: For each page above, create `src/pages/<page>.js`**

```js
import '../lib/bootstrap.js';

// Move this page's inline <script> bodies here verbatim (each in its own IIFE).
// Video pages use `.carousel-still` thumbnail videos: add
//   import { seekStills } from '../lib/carousel-stills.js';
// and call seekStills() instead of any inline loadedmetadata still-seek loop.
// Normalize every 'assets/...' string literal to '/assets/...'.
```

- [ ] **Step 2: For each page above, rewire `<page>.html`**

Remove the inline pre-paint theme `<script>`, `nav.js`, `main.js`, and all inline `<script>` blocks; remove the two `assets/css` `<link>`s; keep any page-specific `<style>`. Add before `</body>`:

```html
<script type="module" src="/src/pages/<page>.js"></script>
```

Normalize all `assets/...` → `/assets/...` in attributes.

- [ ] **Step 3: Extend smoke test**

```ts
for (const path of ['/video.html', '/video-dublin.html']) {
  test(`nav renders on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText('STUDIO JUS10')).toBeVisible();
  });
}
```

- [ ] **Step 4: Build + test + spot check** (`/video.html`, one detail page). Confirm video thumbnails/poster frames and playback behave as before.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Migrate video section to page modules + /assets paths"
```

---

## Task 6: Migrate the Art & Projects sections

**Files:**
- Create: `src/pages/<page>.js` for each of: `art`, `art-sketches`, `art-composers`, `projects`, `projects-peak-pet`, `projects-career-footprint`
- Modify: each corresponding `.html`

- [ ] **Step 1: For each page above, create `src/pages/<page>.js`**

```js
import '../lib/bootstrap.js';

// Move this page's inline <script> bodies here verbatim (each in its own IIFE).
// If the page uses `.carousel-still` videos, add
//   import { seekStills } from '../lib/carousel-stills.js';
// and call seekStills() instead of any inline still-seek loop.
// Normalize every 'assets/...' string literal to '/assets/...'.
```

- [ ] **Step 2: For each page above, rewire `<page>.html`**

Remove the inline pre-paint theme `<script>`, `nav.js`, `main.js`, and all inline `<script>` blocks; remove the two `assets/css` `<link>`s; keep any page-specific `<style>`. Add before `</body>`:

```html
<script type="module" src="/src/pages/<page>.js"></script>
```

Normalize all `assets/...` → `/assets/...` in attributes.

- [ ] **Step 3: Extend smoke test**

```ts
for (const path of ['/art.html', '/art-sketches.html', '/projects.html', '/projects-peak-pet.html']) {
  test(`nav renders on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText('STUDIO JUS10')).toBeVisible();
  });
}
```

- [ ] **Step 4: Build + test + spot check** (`/art-sketches.html` 3D tile behavior, `/projects-peak-pet.html`). Match old behavior.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Migrate art + projects sections to page modules + /assets paths"
```

---

## Task 7: Migrate & repair the About page

The about page has broken paths (spec "Known defect"). Migrate AND fix.

**Files:**
- Create: `src/pages/about.js`
- Modify: `about/about.html`

**Interfaces:**
- Consumes: `bootstrap.js`. Note the module path from a nested page is still `/src/pages/about.js` (root-absolute, resolved by Vite regardless of the HTML file's folder).

- [ ] **Step 1: Create `src/pages/about.js`**

```js
import '../lib/bootstrap.js';

// Move about/about.html's inline <script> bodies here verbatim.
// Normalize 'assets/...' string literals to '/assets/...'.
```

- [ ] **Step 2: Rewire and REPAIR `about/about.html`**

Remove inline theme `<script>`, `nav.js`, `main.js`, inline scripts, and the two `assets/css` `<link>`s. Add before `</body>`:

```html
<script type="module" src="/src/pages/about.js"></script>
```

Fix the broken references while normalizing to root-absolute paths. Note the
split: the resume/CV PDFs were under `assets/documents/` and so moved to
`public/assets/documents/` in Task 2, but the about page's own image folders
live beside the HTML (`about/about-hero/`, `about/about/IPB/`) — they were NOT
under `assets/`, so Task 2 did not touch them. Confirm current locations first:

```bash
ls about/about-hero about/about/IPB public/assets/documents
```

Move the about-page image folders under `public/assets` in Step 3, then rewrite
every about-page reference to point at the real file, root-absolute:
- `assets/about-hero/*` → `/assets/about-hero/*`
- `assets/about/IPB/*`   → `/assets/about-ipb/*`
- `assets/resume.pdf`    → `/assets/documents/Justin_Hughes_Resume_REVISED_V2.pdf`
- `assets/cv.pdf`        → `/assets/documents/Justin_Hughes_CV_REVISED_V2.pdf`

- [ ] **Step 3: Move nested about assets under `public/assets` if needed**

These folders live beside `about/about.html`, not under `assets/`, so move them
under `public/assets` now (flatten the confusing `about/about/IPB` nesting):

```bash
git mv about/about-hero public/assets/about-hero
git mv about/about/IPB public/assets/about-ipb
rmdir about/about 2>/dev/null; true          # now-empty parent
```

Result: `public/assets/about-hero/*` and `public/assets/about-ipb/*`. Reference
them as `/assets/about-hero/...` and `/assets/about-ipb/...` in the HTML,
matching Step 2.

- [ ] **Step 4: Add an about-page smoke test that guards the fix**

```ts
test('about page renders and hero image loads (no 404)', async ({ page }) => {
  const failures: string[] = [];
  page.on('response', (r) => { if (r.status() === 404) failures.push(r.url()); });
  await page.goto('/about/about.html');
  await expect(page.getByText('STUDIO JUS10')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(failures, `404s: ${failures.join(', ')}`).toHaveLength(0);
});
```

- [ ] **Step 5: Build + test**

Run: `npm run test`
Expected: about test passes with zero 404s (proves the repair).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Migrate and repair About page (fix broken asset/resume/CV paths)"
```

---

## Task 8: Cleanup, Vercel, and full verification

Remove migration scaffolding and confirm the whole site.

**Files:**
- Delete: `assets_js_old/`
- Modify: `vercel.json`

- [ ] **Step 1: Confirm no page references old JS/CSS or inline scripts**

```bash
# Old classic script/style links (should be gone):
grep -rn "assets/js/\|assets/css/" -- *.html about/*.html; echo "exit: $?"
# Bare inline <script> openers — module/src tags won't match this (should be gone):
grep -rn "<script>" -- *.html about/*.html; echo "exit: $?"
# Relative assets/ refs in HTML attrs or JS strings (all should be /assets/ now):
grep -rn 'src="assets/\|href="assets/\|.assets/images\|.assets/videos' -- *.html about/*.html src; echo "exit: $?"
```

Expected: each grep prints nothing and reports `exit: 1` (grep found no matches).

- [ ] **Step 2: Delete the porting source**

```bash
git rm -r assets_js_old
```

- [ ] **Step 3: Update `vercel.json`**

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "cleanUrls": true,
  "trailingSlash": false
}
```

- [ ] **Step 4: Full build + preview parity check**

```bash
npm run build && npm run preview -- --port 4173 --strictPort
```

In `dist/`, confirm every HTML page is present. In the browser, spot-check the home hero/carousel, a photography listing, a video page, and the about page against the pre-migration site. Confirm the injected pre-paint theme `<script>` is present in each page's `<head>` and no other inline script exists:

```bash
grep -rc "<script" dist/index.html   # expect exactly the injected head script + the module tag
```

- [ ] **Step 5: Full quality gate**

```bash
npm run check   # biome
npm run test    # playwright, all pages
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Remove migration scaffolding; point Vercel build at dist/"
```

---

## Task 9: Forgejo Actions CI

**Files:**
- Create: `.forgejo/workflows/ci.yml`

- [ ] **Step 1: Create `.forgejo/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verify:
    runs-on: docker            # adjust to match the Forgejo runner's registered labels
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: false
      - uses: actions/setup-node@v4
        with:
          node-version: 26
          cache: npm
      - run: npm ci
      - run: npx biome ci .
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test
```

- [ ] **Step 2: Simulate the CI steps locally**

```bash
rm -rf node_modules && npm ci
npx biome ci .
npm run build
npm run test
```

Expected: every step succeeds (this mirrors what the runner will do). The real CI run happens once the branch is pushed to Forgejo — deferred to the owner.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add Forgejo Actions CI (lint + build + smoke tests)"
```

---

## Self-review notes (coverage vs. spec)

- Vite MPA + Tailwind-via-PostCSS → Task 1. Runtime nav/theme modules → Task 2. Inline-script extraction (all pages) → Tasks 2–7. `transformIndexHtml` pre-paint snippet → Task 1 (Step 7). Root-absolute `/assets/` + media to `public/` → Tasks 2–8. About-page repair → Task 7. Biome → Task 1/8. Playwright smoke suite → Tasks 2–8. Vercel `dist/` → Task 8. Forgejo CI → Task 9. Deployment left as documented open item (no task) — matches the spec's verify-only decision.
- No push step anywhere: origin is a fresh empty Forgejo repo; pushing is the owner's decision (noted in Global Constraints and Task 9).
```
