# Astro Migration (Clean Nested URLs) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 39-page Vite MPA to Astro with deep-nested clean URLs (no `.html`), a single `Base.astro` layout (ending head/nav duplication), and a statically-rendered nav — behavior-preserving.

**Architecture:** Astro static site (`build.format:'directory'` → extension-less nested URLs). Every page is a `.astro` file under `src/pages/**` that wraps its body in `Base.astro` (head + `<Nav/>` + `<slot/>`). Interactive JS is reused from the Vite migration's extracted modules, hosted in Astro `<script>` blocks. Media stays in `public/assets/` (astro:assets deferred).

**Tech Stack:** Astro (latest, v7+), Tailwind v3 via **PostCSS** (`postcss.config.cjs`, no `@astrojs/tailwind` — it caps Astro at ≤5), Biome (JS/TS), Prettier + prettier-plugin-astro (.astro), Playwright, Node 26.

## Global Constraints

- **Behavior-preserving.** No visual/content change. Page body markup + interactive JS port verbatim (only inter-page link paths change to clean URLs).
- **Tailwind stays v3**, wired via **PostCSS** (`postcss.config.cjs` with `tailwindcss` + `autoprefixer`) — NOT `@astrojs/tailwind` (which caps Astro at ≤5). Astro (latest v7+) auto-runs the PostCSS config over `global.css`'s `@tailwind` directives.
- **Deep-nested clean URLs**, no `.html`. `build.format:'directory'`, `trailingSlash:'never'`. Region pages = folder `index.astro`.
- **No redirects** — old `.html` URLs 404.
- **Media stays in `public/assets/`**, referenced root-absolute `/assets/...`. No `astro:assets` (deferred).
- **Vanilla JS** in Astro `<script>`s — no React/framework.
- **Theme:** pre-paint `<script is:inline>` in `Base.astro` head; storage key `co-theme`; dark = `html[data-theme="dark"]`. Toggle wiring in `Nav.astro`'s `<script>`.
- **Node 26**; commit after each task; **do NOT push**.
- The full page→URL→file map is in the spec (`docs/superpowers/specs/2026-07-17-astro-migration-design.md`) — the authoritative route list.

## File structure (target)

```
src/
├── layouts/Base.astro
├── components/Nav.astro
├── pages/**                      # 39 .astro pages, deep-nested (see spec map)
├── scripts/                      # ported interactive JS (from src/lib + src/pages)
│   ├── theme.js, nav.js, carousel-stills.js, + per-page script modules
└── styles/
    ├── global.css                # @tailwind base/components/utilities
    └── site.css                  # (moved from Vite migration, unchanged)
public/assets/**                  # unchanged
astro.config.mjs
tailwind.config.js                # content globs → ./src/**/*.{astro,js,ts}
package.json / vercel.json / .forgejo/workflows/ci.yml   # updated in the retire task
```

---

## Task 1: Scaffold Astro + shared chrome + first page (contact)

Stand up Astro with Tailwind v3, the `Base` layout, the static `Nav`, global styles, and the shared scripts; prove it end-to-end by migrating the simplest page (`contact` → `/contact`) with a smoke test.

**Files:**
- Modify: `package.json` (deps + scripts)
- Create: `astro.config.mjs`, `tsconfig.json`, `src/layouts/Base.astro`, `src/components/Nav.astro`, `src/styles/global.css`, `src/scripts/theme.js`, `src/scripts/nav.js`, `src/scripts/carousel-stills.js`, `src/pages/contact.astro`
- Move: `src/styles/site.css` (already exists from the Vite migration — keep in place)
- Modify: `playwright.config.js`; Create: `tests/astro-smoke.spec.ts`; Delete: `tests/smoke.spec.ts` (the Vite suite — it targets `/contact.html` etc. and is superseded now)
- Modify: `tailwind.config.js` (content globs)

**Interfaces (Produces):**
- `Base.astro` props: `{ title: string; description?: string; bodyClass?: string; bodyStyle?: string }` — renders full `<head>` (fonts/meta/favicon/title), the pre-paint theme `is:inline` script, `<Nav/>`, `<slot/>`.
- `Nav.astro` — no required props; derives active state from `Astro.url.pathname`; renders the nav markup with clean-path links + a bundled `<script>` wiring mobile menu / hide-on-scroll / theme toggle (importing `../scripts/nav.js` + `../scripts/theme.js`).
- `src/scripts/theme.js` → `export function initTheme()` (ported from `src/lib/theme.js`, unchanged).
- `src/scripts/nav.js` → `export function initNav()` — the mobile-menu + hide/reveal-on-scroll wiring ported from `src/lib/nav.js` (everything AFTER the markup injection; the markup itself becomes `Nav.astro`). Drops the `#nav-root` outerHTML injection (nav is now static).
- `src/scripts/carousel-stills.js` → `export function seekStills(root=document)` (copied from `src/lib/carousel-stills.js`).

- [ ] **Step 1: Install Astro + Tailwind v3 integration + Astro tooling**

```bash
npm install astro@latest
npm install -D prettier prettier-plugin-astro @astrojs/check typescript
```
Do NOT install `@astrojs/tailwind` (it caps Astro at ≤5). Tailwind v3 is wired via PostCSS in Step 3. `tailwindcss@3`, `autoprefixer`, `postcss`, `@biomejs/biome`, `@playwright/test` are already present.

- [ ] **Step 2: Update `package.json` scripts**

```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "check": "astro check && biome check src/scripts tests *.js",
  "format": "biome format --write src/scripts tests *.js && prettier --write \"src/**/*.astro\"",
  "test": "playwright test"
}
```

- [ ] **Step 3: Create `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  build: { format: 'directory' }, // /photography/index.html -> served at /photography
  trailingSlash: 'never',
});
```

And create `postcss.config.cjs` (Astro auto-detects it and runs it over `global.css`'s `@tailwind` directives — this is what wires Tailwind v3, replacing `@astrojs/tailwind`):
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Also create `tsconfig.json` with **path aliases** so every page imports the layout/scripts the same way regardless of how deeply it's nested (this eliminates the error-prone `../../../` relative-depth counting):

```json
{
  "extends": "astro/tsconfigs/base",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@layouts/*": ["src/layouts/*"],
      "@components/*": ["src/components/*"],
      "@scripts/*": ["src/scripts/*"],
      "@styles/*": ["src/styles/*"]
    }
  }
}
```
Astro resolves these aliases in `.astro`, `.ts`, `.js`, and CSS imports. **All pages/components below import via these aliases**, never relative depth.

- [ ] **Step 4: Update `tailwind.config.js` content globs**

Change `content` to:
```js
  content: ['./src/**/*.{astro,html,js,ts}'],
```
Leave the rest of `tailwind.config.js` unchanged (theme colors/fonts/spacing carry over verbatim).

- [ ] **Step 5: Create `src/styles/global.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
(`src/styles/site.css` already exists from the Vite migration — leave it; `Base.astro` imports both, in order.)

- [ ] **Step 5b: Relocate the Vite page modules out of Astro's routing directory**

Astro treats **every file in `src/pages/` as a route** — the Vite migration's `src/pages/*.js` modules would be misread as endpoints and break `astro build`. Move them to a holding dir (the porting source for this migration; deleted in Task 7); `src/pages/` then starts empty for the new `.astro` pages:

```bash
git mv src/pages vite-src-old
```

Result: the page scripts live at `vite-src-old/<page>.js`; `src/lib/*` stays put (not in `src/pages/`, so Astro ignores it) as a reference until Task 7. **All "porting source" references below point at `vite-src-old/<page>.js`.**

- [ ] **Step 6: Create `src/scripts/theme.js` and `carousel-stills.js`**

Copy `src/lib/theme.js` → `src/scripts/theme.js` and `src/lib/carousel-stills.js` → `src/scripts/carousel-stills.js` **verbatim** (they are already clean ES modules; `initTheme()` and `seekStills()` are unchanged).

- [ ] **Step 7: Create `src/scripts/nav.js`**

Port from `src/lib/nav.js` the post-injection behavior ONLY — the mobile-menu open/close, dropdown wheel-block, and hide/reveal-on-scroll wiring (everything after `renderNav()` built + injected the markup). Wrap it as `export function initNav()`. Do NOT port the markup string-building (that becomes `Nav.astro`) and do NOT port the theme block (stays in `theme.js`). Keep `window._navReveal` assignment. The selectors it queries (`#mobile-menu-toggle`, `#mobile-menu`, `#mobile-menu-overlay`, `nav`, `.group > div.absolute`, `#theme-toggle`, `#theme-toggle-mobile`) must match the markup `Nav.astro` renders (Step 9).

- [ ] **Step 7b: Tooling config for the new tree**

The `check`/`format` scripts scope Biome to `src/scripts tests *.js` and hand `.astro` to Prettier. Two config updates:
1. **Biome** (`biome.json`): the ported scripts in `src/scripts` are verbatim legacy code (`var`/IIFE), so repoint the existing ported-code leniency `overrides` entry to match `**/src/scripts/*.js` (replacing the now-dead `src/pages/*.js`/`src/lib` globs). `astro check`/Prettier own `.astro`; Biome never lints `.astro`.
2. **Prettier** (`.prettierrc.json`):
```json
{
  "plugins": ["prettier-plugin-astro"],
  "overrides": [{ "files": "*.astro", "options": { "parser": "astro" } }]
}
```

- [ ] **Step 8: Create `src/layouts/Base.astro`**

```astro
---
import '@styles/global.css';
import '@styles/site.css';
import Nav from '@components/Nav.astro';

interface Props {
  title: string;
  description?: string;
  bodyClass?: string;
  bodyStyle?: string;
}
const {
  title,
  description = 'STUDIO JUS10 — Art & Design Portfolio',
  bodyClass = 'text-on-surface font-body-md antialiased selection:bg-primary selection:text-white',
  bodyStyle = '',
} = Astro.props;

const THEME_SNIPPET =
  "(function(){var t=localStorage.getItem('co-theme');" +
  "if(t==='dark')document.documentElement.setAttribute('data-theme','dark');})();";
---
<!doctype html>
<html lang="en" class="scroll-smooth">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/assets/logo/StudioJus10_LOGO_Base.svg" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,100..900;1,100..900&family=Noto+Serif+SC:wght@200..900&family=Old+Standard+TT:ital,wght@0,400;0,700;1,400;1,700&family=Space+Grotesk:wght@300..700&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
    <script is:inline set:html={THEME_SNIPPET}></script>
  </head>
  <body class={bodyClass} style={bodyStyle}>
    <Nav />
    <slot />
  </body>
</html>
```

- [ ] **Step 9: Create `src/components/Nav.astro`**

Port the nav markup from `src/lib/nav.js`'s `renderNav()` string concatenation into an Astro template (the `<nav>…</nav>` + mobile menu + overlay). Transformations while porting:
- **Internal links → clean paths:** `index.html`→`/`, `photography.html`→`/photography`, `photography-colorado.html`→`/photography/colorado`, `photography-arizona.html`→`/photography/arizona`, `photography-washington.html`→`/photography/washington`, `photography-nature.html`→`/photography/nature`, `photography-film.html`→`/photography/film`, `photography-europe.html`→`/photography/europe`, `video.html`→`/video`, `art.html`→`/art`, `art-sketches.html`→`/art/sketches`, `art-composers.html`→`/art/composers`, `projects.html`→`/projects`, `about/about.html`→`/about`, `contact.html`→`/contact`.
- **Active state from the route** (frontmatter), replacing the old filename detection:
  ```astro
  ---
  const p = Astro.url.pathname;
  const photo = p.startsWith('/photography');
  const video = p.startsWith('/video');
  const art = p.startsWith('/art');
  const projects = p.startsWith('/projects');
  const about = p === '/about';
  const co = p.startsWith('/photography/colorado');
  const az = p.startsWith('/photography/arizona');
  const wa = p.startsWith('/photography/washington');
  const nat = p.startsWith('/photography/nature');
  const film = p.startsWith('/photography/film');
  const eu = p.startsWith('/photography/europe');
  const sketches = p === '/art/sketches';
  const composers = p === '/art/composers';
  ---
  ```
  Use these booleans to add the `text-primary`/active classes exactly as `renderNav()` did (same class strings).
- Keep all Tailwind classes, CJK spans, and structure byte-identical otherwise.
- At the end, a bundled script:
  ```astro
  <script>
    import { initNav } from '@scripts/nav.js';
    import { initTheme } from '@scripts/theme.js';
    initTheme();
    initNav();
  </script>
  ```

- [ ] **Step 10: Create `src/pages/contact.astro`**

```astro
---
import Base from '@layouts/Base.astro';
---
<Base title="STUDIO JUS10 - Contact" bodyClass="text-on-surface font-body-md antialiased selection:bg-primary selection:text-white" bodyStyle="background: #0a0a0a;">
  <!-- Paste contact.html's <body> inner content here (everything except <script>/nav/theme), /assets paths unchanged. -->
  <!-- Then contact's page script: -->
  <script>
    // Move contact.html's page-specific inline script bodies here (from vite-src-old/contact.js, minus the bootstrap import).
  </script>
</Base>
```
Read `contact.html` + `vite-src-old/contact.js` for the exact content/script. Preserve the `<body>` class/style from `contact.html`. Any inter-page links in the content → clean paths.

- [ ] **Step 11: Update `playwright.config.js` for Astro**

```js
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173/contact',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: 'http://localhost:4173' },
});
```

- [ ] **Step 12: Write `tests/astro-smoke.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

test('contact renders at clean URL /contact with static nav', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.locator('nav')).toBeVisible();
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await expect(page.locator('nav a[href="/photography"]').first()).toBeVisible();
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
```
Also remove the superseded Vite suite so `npm run test` runs only the Astro suite from here on:
```bash
git rm tests/smoke.spec.ts
```

- [ ] **Step 13: Build + test**

Run: `npm run build`
Expected: Astro builds; `dist/contact/index.html` exists; `dist/` has no `contact.html`.

Run: `npm run test`
Expected: 3/3 pass (clean URL + static nav, theme persists, old URL 404s).

Run: `npm run check`
Expected: `astro check` + biome clean.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "Scaffold Astro + Tailwind v3, Base layout, static Nav, migrate contact page"
```

---

## Task 2: Migrate the home page (`/`)

The carousel + hero — highest-risk page.

**Files:**
- Create: `src/pages/index.astro`, `src/scripts/home-hero.js` (+ any home helper modules)

- [ ] **Step 1: Create `src/scripts/home-hero.js`**

Port the home carousel + hero logic from `vite-src-old/index.js` into `src/scripts/home-hero.js`, exported as `export function initHome()` (or keep the IIFEs and export an init). Reuse `seekStills` from `carousel-stills.js`. Behavior verbatim; `/assets` paths unchanged.

- [ ] **Step 2: Create `src/pages/index.astro`**

```astro
---
import Base from '@layouts/Base.astro';
---
<Base title="STUDIO JUS10 - Art & Design Portfolio" bodyClass="bg-surface-container-low text-on-surface font-body-md antialiased selection:bg-primary selection:text-white">
  <style is:global>
    /* Paste index.html's page-specific <style> block here (room-wall, floor-reflection, vert-card, etc.). */
  </style>
  <!-- Paste index.html's <body> inner content (hero section, carousel, page-bg, etc.), /assets unchanged, inter-page links -> clean paths. -->
  <script>
    import { initHome } from '@scripts/home-hero.js';
    initHome();
  </script>
</Base>
```
Read `index.html` + `vite-src-old/index.js` for exact content. The page loader / nav-reveal coordination that referenced `window._navReveal` still works (Nav's script sets it).

- [ ] **Step 3: Add a home smoke test**

```ts
test('home carousel initializes at /', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect(page.locator('#carousel-track > *').first()).toBeVisible();
});
```

- [ ] **Step 4: Build + test + manual check**

`npm run build` (dist has `index.html` at root). `npx playwright test` (home test + prior pass). `npm run dev`, open `/`, confirm carousel/scroll/theme behave (visual limited by LFS stubs — verify DOM/behavior, note pixels).

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "Migrate home page to Astro (/)"
```

---

## Task 3: Migrate the Photography section (21 pages)

Nested region indexes + series. Executed in sub-batches during implementation (listings → leaves), following the per-page procedure below.

**Pages → files** (see spec map): `photography/index.astro`, `photography/{colorado,arizona,washington,nature,film,europe}/index.astro`, and the 14 series pages (`photography/colorado/twelve-views.astro`, `photography/nature/flowers.astro`, …).

**Per-page procedure (each page):**

- [ ] **Step 1: Create the nested `.astro` file** at its mapped path:
```astro
---
import Base from '@layouts/Base.astro';
---
<Base title="<the page's <title>>" bodyClass="<the page's body class>" bodyStyle="<the page's body style, if any>">
  <style is:global>/* page-specific <style> block, if any */</style>
  <!-- <body> inner content from the old <page>.html, /assets paths unchanged, inter-page links -> clean nested paths -->
  <script>import '@scripts/<page>.js';</script>   <!-- omit entirely if the page had no page-specific script -->
</Base>
```
**Page scripts go in EXTERNAL modules, not inline.** Create `src/scripts/<page>.js` = the verbatim body of `vite-src-old/<old-page>.js` (its IIFEs, minus the `bootstrap.js` import; `import { seekStills } from './carousel-stills.js'` if used), and the `.astro` just imports it. Rationale: Astro type-checks inline `<script>` blocks as strict TS (forcing dozens of casts into ported code), but does NOT strict-check imported `.js` modules — so external modules keep the port truly verbatim and match the home page's `home-hero.js`. Pages with no page-specific script (bootstrap-only in the Vite baseline) get **no `<script>` at all**.

Source content: the old `<page>.html` body + `vite-src-old/<page>.js`. Thanks to the `@layouts`/`@scripts` aliases (Task 1), imports are identical no matter how deep the page is nested — no `../../../` counting.

- [ ] **Step 2: Update inter-page links** in that page's content to clean nested paths (e.g., a region listing linking to its series → `/photography/colorado/twelve-views`). Grep the file afterward for any residual `.html` href → none.

- [ ] **Step 3 (once for the section): extend the smoke suite**
```ts
for (const path of ['/photography', '/photography/colorado', '/photography/nature/flowers']) {
  test(`nav renders on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
    await expect(page.locator('nav a[href="/photography"]').first()).toBeVisible();
  });
}
```

- [ ] **Step 4: Build + test** — `npm run build` succeeds, dist has the nested pages; `npx playwright test` green; spot-check `/photography` and a series page in `npm run dev`.

- [ ] **Step 5: Commit** (per sub-batch) — `git commit -am "Migrate photography <sub-batch> to Astro nested routes"`.

---

## Task 4: Migrate the Video section (9 pages)

`video/index.astro` + `video/{collage,decadance,dublin,murder,portrait,resurrection,single-shot,winter}.astro`.

- [ ] **Step 1–2:** Apply the Task 3 per-page procedure to each (imports via `@layouts`/`@scripts` aliases — no depth counting). Extract each page's script to an external `src/scripts/<page>.js` module and `import '@scripts/<page>.js'` from the `.astro`. Most video detail pages have no page-specific script (bootstrap-only) → omit the `<script>` entirely. `video.html`'s hover/parallax script → `src/scripts/video.js`.
- [ ] **Step 3: smoke** — add `test('nav renders on /video')` and `test('nav renders on /video/dublin')` (scoped-to-nav pattern).
- [ ] **Step 4: Build + test + spot check.**
- [ ] **Step 5: Commit** — `git commit -am "Migrate video section to Astro nested routes"`.

---

## Task 5: Migrate Art + Projects (6 pages)

`art/index.astro`, `art/{sketches,composers}.astro`, `projects/index.astro`, `projects/{peak-pet,career-footprint}.astro`.

- [ ] **Step 1–2:** Task 3 per-page procedure (imports via `@layouts`/`@scripts` aliases). Extract each page's script (art-sketches 3D tiles, projects hero/lightbox) to an external `src/scripts/<page>.js` module and `import '@scripts/<page>.js'` from the `.astro`.
- [ ] **Step 3: smoke** — `test('nav renders on /art')`, `test('nav renders on /projects')`.
- [ ] **Step 4: Build + test + spot check** (`/art/sketches`, `/projects/peak-pet`).
- [ ] **Step 5: Commit** — `git commit -am "Migrate art + projects sections to Astro nested routes"`.

---

## Task 6: Migrate the About page (`/about`)

- [ ] **Step 1:** Create `src/pages/about.astro` (`import Base from '@layouts/Base.astro'`). Move `about/about.html`'s body content + `vite-src-old/about.js`'s script. All `/assets/...` refs (already repaired in the Vite migration to root-absolute) carry over unchanged.
- [ ] **Step 2: smoke** — add the 404-guard test at the clean URL:
```ts
test('about renders at /about with no 404s', async ({ page }) => {
  const failures: string[] = [];
  page.on('response', (r) => { if (r.status() === 404) failures.push(r.url()); });
  await page.goto('/about');
  await expect(page.locator('nav').getByText('STUDIO JUS10')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(failures, `404s: ${failures.join(', ')}`).toHaveLength(0);
});
```
- [ ] **Step 3: Build + test.**
- [ ] **Step 4: Commit** — `git commit -am "Migrate About page to Astro (/about)"`.

---

## Task 7: Retire the Vite MPA, wire CI/Vercel, full verification

**Files:**
- Delete: all root `*.html` + `about/about.html`, `vite-src-old/` (the Vite page modules), `src/lib/*`, `vite.config.js`, `src/styles/main.css`, `vercel.json` (Vercel dropped)
- Create: `Dockerfile`, `nginx.conf`, `.dockerignore`
- Modify: `.forgejo/workflows/ci.yml`, `biome.json` (scope)
- (Keep `postcss.config.cjs` — it drives Tailwind v3; see Task 1.)

- [ ] **Step 1: Confirm every route exists as an `.astro` page**

```bash
# 39 pages expected under src/pages (index + 38)
find src/pages -name '*.astro' | wc -l
```
Cross-check against the spec's URL map — every old page has an `.astro` file.

- [ ] **Step 2: Delete the Vite MPA layer**

```bash
git rm about/about.html $(ls *.html) src/lib/*.js vite.config.js src/styles/main.css
git rm -r vite-src-old
```
**KEEP `postcss.config.cjs`** — it is the Tailwind v3 driver now (do NOT delete it). Astro brings its own Vite, so the standalone `vite.config.js` is dead and removed; `src/styles/main.css` is superseded by `global.css`; `src/lib/*` is superseded by `src/scripts/*` + `Nav.astro`. Optionally also drop now-unused devDeps from `package.json` (`vite`, `fast-glob` — they were only used by the deleted `vite.config.js`; Astro pins its own Vite), then `npm install` to update the lockfile.

- [ ] **Step 3: Update `biome.json`** — point the ignore/scope at the new tree: Biome checks `src/scripts`, `tests`, config `*.js`; `.astro` files are not linted by Biome (handled by `astro check` + Prettier). Remove now-dead `src/pages/*.js`/`src/lib` leniency overrides (or repoint them at `src/scripts` if any ported module still needs the `var`/IIFE leniency). Re-run `npm run check` → clean.

- [ ] **Step 4: Dockerize (self-hosted deploy, Vercel dropped)**

`git rm vercel.json`. Create a multi-stage `Dockerfile` (build with Node, serve static `dist/` with nginx):

```dockerfile
# ---- build ----
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- serve ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

`nginx.conf` — clean URLs for Astro's directory-format output (`/photography` → `/photography/index.html`):
```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    try_files $uri $uri/ =404;   # directory index resolves /photography/ -> index.html
  }
  error_page 404 /404.html;       # Astro emits dist/404.html
}
```

`.dockerignore`:
```
node_modules
dist
.git
.superpowers
vite-src-old
test-results
playwright-report
```

Verify locally: `docker build -t studiojus10 . && docker run --rm -p 8080:80 studiojus10`, then curl `http://localhost:8080/photography` (200) and `http://localhost:8080/photography.html` (404). (If Docker isn't available in the environment, `astro build` + `nginx -t` config check + note the manual docker step.)

Note: the LFS media are pointer stubs, so the image serves stub images until LFS is materialized — structurally correct, pixels pending.

- [ ] **Step 5: Update `.forgejo/workflows/ci.yml`** — replace the build/test steps:
```yaml
      - run: npm ci
      - run: npm run check          # astro check + biome
      - run: npm run build          # astro build
      - run: npx playwright install --with-deps chromium
      - run: npm run test
```
(Keep `runs-on`, Node 26, `lfs: false`.)

- [ ] **Step 6: Full verification**

```bash
npm run build           # astro build, all 39 routes
find dist -name '*.html' | wc -l     # expect 39 (each at <route>/index.html; home at dist/index.html)
npm run check           # astro check + biome clean
npm run test            # full Playwright suite (default + --workers=4)
```
Manually: `npm run preview`, spot-check a nested series URL (`/photography/colorado/twelve-views`), confirm no `.html` URL resolves, nav/theme/mobile-menu/carousel behave. (Pixels limited by LFS stubs.)

- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "Retire Vite MPA; wire Astro build for Vercel + Forgejo CI"
```

---

## Self-review notes (coverage vs. spec)

- Astro + Tailwind v3 scaffold → Task 1. Base layout (kills head dup) + static Nav (fixes active-state) → Task 1. Clean nested URLs (build.format:'directory') → Task 1 config, realized per page in Tasks 2–6. Interactive JS reuse → Tasks 1–6 (scripts ported from src/lib + src/pages). No redirects (old .html 404) → asserted in Task 1 smoke. public/assets kept (astro:assets deferred) → Global Constraints. Retire Vite + CI/Vercel → Task 7.
- Import-depth correctness for nested pages is called out explicitly (Task 3 Step 1) — the most error-prone mechanical detail.
- No push anywhere (branch `astro-migration`, off `vite-migration`).
- LFS media / astro:assets are documented open items (spec), not tasks.
```
