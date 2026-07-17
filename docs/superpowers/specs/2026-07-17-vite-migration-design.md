# Vite Migration + Code-Quality Restructure — Design

**Date:** 2026-07-17
**Branch:** `vite-migration`
**Status:** Approved design — ready for implementation planning

## Goal

Migrate the Studio Jus10 portfolio from a set of static HTML pages with inline
`<script>` blocks to a **Vite** multi-page application, and raise overall code
quality. The migration is **behavior-preserving**: every page should look and
behave identically before and after, page by page.

### Scope decisions (confirmed with owner)

- **Depth:** Full restructure — Vite build, extract all inline scripts into ES
  modules, shared modules, linting/formatting, and smoke tests.
- **Linter/formatter:** **Biome** (not ESLint + Prettier).
- **Shared chrome:** **Runtime ES-module components** — the nav stays injected
  into `#nav-root` at runtime, but as a clean importable module rather than a
  single string-concatenation IIFE. (Build-time HTML partials were considered
  and rejected in favor of staying close to the current rendering model.)
- **Asset paths:** Normalize every reference to **root-absolute `/assets/...`**
  so paths resolve identically regardless of page depth.
- **About page:** Fix its currently-broken asset/resume/CV paths as part of this
  work.
- **Testing:** A small **Playwright smoke suite**.
- **Tailwind:** Stay on **v3** (no v4 upgrade) to limit risk.
- **Git host:** Repo moves to a self-hosted **Forgejo** instance. `origin` →
  `ssh://git@git.daveynet.xyz/davey/studiojus10.git` (was
  `git@github.com:studiojus10/portfolio-test.git`). SSH auth from the dev
  environment is confirmed working; the Forgejo repo is currently empty.
- **CI:** A **Forgejo Actions** workflow runs lint + build + smoke tests on push
  and pull request.

### Out of scope

- Visual redesign or changes to page content/layout.
- Tailwind v4 upgrade.
- Build-time HTML templating / partials (owner chose runtime modules).
- Any change to the 39-page URL structure.

## Current state (baseline)

- **39 static HTML pages** (~18k lines total), deployed on Vercel with
  `outputDirectory: "."`, `cleanUrls: true`, `trailingSlash: false`.
- **Tailwind v3** built via the standalone CLI (`tailwindcss -i src/input.css -o
  assets/css/tailwind.css`). The committed `assets/css/tailwind.css` is an empty
  placeholder regenerated at deploy time.
- **`assets/css/styles.css`** — 137 lines of hand-written CSS, linked per page.
- **`assets/js/nav.js`** — builds the entire nav via string concatenation and
  injects it into `#nav-root`; also owns the theme toggle, mobile menu, and
  hide-on-scroll nav behavior.
- **`assets/js/main.js`** — the home-page room carousel (IIFE).
- **Inline scripts everywhere:** the pre-paint theme snippet is duplicated in
  all 39 `<head>`s; pages carry 2–9 page-specific inline scripts each
  (scroll parallax, video-still seeking, hero animation, etc.).
- **Assets in Git LFS** (by file extension, per `.gitattributes`).
- No bundler, modules, imports, linting, or tests.

### Known defect to fix

`about/about.html` lives in `about/` but references `assets/about-hero/...`
(relative → resolves to the non-existent `about/assets/...`; the files are at
`about/about-hero/...` and `about/about/IPB/...`). It also links
`assets/resume.pdf` and `assets/cv.pdf`, which do not exist — the real files are
`assets/documents/Justin_Hughes_Resume_REVISED_V2.pdf` and
`assets/documents/Justin_Hughes_CV_REVISED_V2.pdf`. All of these will be
corrected during path normalization.

## Target architecture

### Directory layout

```
/ (repo root = Vite root)
├── index.html … about/about.html        # 39 entry HTML files, content only (no inline scripts)
├── src/
│   ├── pages/                            # one entry module per page (imports bootstrap; adds page JS)
│   │   ├── index.js                      # absorbs main.js carousel + home inline scripts
│   │   ├── photography.js
│   │   └── … (per page)
│   ├── lib/                              # shared modules
│   │   ├── bootstrap.js                  # imported first by every page module
│   │   ├── nav.js                        # renderNav()
│   │   ├── theme.js                      # theme toggle + persistence
│   │   ├── carousel-stills.js            # shared video-still seek helper
│   │   └── scroll.js                     # shared scroll/parallax helpers
│   └── styles/
│       ├── main.css                      # @tailwind directives + @import "./site.css"
│       └── site.css                      # current hand-written styles.css
├── public/
│   └── assets/                           # all media: images, video, posters, logo, documents
├── vite.config.js
├── postcss.config.js                     # tailwindcss + autoprefixer
├── tailwind.config.js                    # updated content globs
├── biome.json
├── playwright.config.js
├── tests/                                # smoke.spec.ts
├── vercel.json                           # outputDirectory → dist
└── package.json
```

### Build tooling

- **Vite MPA:** `vite.config.js` lists all 39 HTML files as rollup inputs (via a
  glob of `*.html` + `about/*.html`). HTML files stay at their current paths so
  URLs and `cleanUrls` are unchanged. Vite emits hashed JS/CSS bundles into
  `dist/` and injects the correct `<link>`/`<script>` tags into each page.
- **Tailwind v3 via PostCSS:** `postcss.config.js` runs `tailwindcss` +
  `autoprefixer`. `src/styles/main.css` holds the `@tailwind base/components/
  utilities` directives and `@import`s `site.css`. It is imported from
  `lib/bootstrap.js` so it lives in every page's module graph; Vite extracts it
  to a hashed stylesheet in the production build (no FOUC).
- The empty `assets/css/tailwind.css` placeholder and the standalone
  `build`/`dev` Tailwind CLI scripts are removed.

### Shared modules

- **`lib/nav.js`** exports `renderNav()`. Same markup and active-state detection
  as today, but the single ~130-line string concatenation is decomposed into
  small named template helpers (`desktopLink`, `dropItem`, `mobileTopLink`,
  etc. — already present in spirit) for readability. Still injects into
  `#nav-root` at runtime.
- **`lib/theme.js`** owns theme toggle + `localStorage` persistence (key
  `co-theme`), extracted from nav.js. Exposes the wiring used by the nav's
  toggle buttons and the pre-paint snippet's logic.
- **`lib/bootstrap.js`** is imported first by every page module. It imports the
  CSS entry, calls `renderNav()`, and wires theme + shared nav behavior
  (hide-on-scroll, mobile menu). This replaces the per-page `nav.js` script tag.

### Page modules (inline-script extraction)

- **Every** page gets a `src/pages/<page>.js`, referenced by a single
  `<script type="module" src="/src/pages/<page>.js">` tag that replaces the old
  `nav.js`/`main.js`/inline tags. The module imports `bootstrap.js` first (which
  gives it the CSS, nav, and theme wiring); pages with their own behavior add it
  after. Every existing inline `<script>` for that page moves into this module.
  A page with no bespoke JS still has a one-line module that just imports
  `bootstrap.js`.
- `pages/index.js` absorbs `main.js` (the room carousel) plus the ~8 home-page
  inline scripts. Logic that recurs across pages (the `carousel-still` video
  seek, scroll-driven parallax) is factored into `lib/` helpers and imported.
- **Deliberate exception — the pre-paint theme snippet.** It must run
  synchronously before first paint, so it cannot be a deferred ES module. It is
  centralized via Vite's `transformIndexHtml` hook: defined once in
  `vite.config.js` and injected into every page's `<head>` at build time. Result:
  **zero inline scripts in the source HTML**, while keeping the exact
  pre-paint runtime behavior.

### Assets & path normalization

- Media moves to `public/assets/` via `git mv` (LFS tracks by extension, so
  tracking follows the move). Vite serves `public/` at the site root, so a
  reference like `/assets/carousel/x.jpg` resolves in both dev and build.
- All asset references (images, video, posters, logo, favicon, documents) are
  normalized to **root-absolute `/assets/...`**. This is depth-independent and
  repairs the about page.
- `src/input.css` is replaced by `src/styles/main.css`; `assets/css/*` and
  `assets/js/*` leave `public/` (they become part of the Vite source graph).

### Deployment

- `vercel.json`: `buildCommand` stays `npm run build` (now `vite build`),
  `outputDirectory` → `dist`; `cleanUrls` and `trailingSlash` unchanged.
- Inter-page `<a href="photography.html">` links are plain anchors Vite leaves
  untouched, so Vercel's clean-URL behavior is preserved exactly.
- **Open item — the host move affects Vercel.** Vercel's auto-deploy git
  integration supports GitHub/GitLab/Bitbucket, not Forgejo. With `origin` on
  Forgejo, deploy-on-push will no longer fire. Options (decision pending): keep
  a GitHub mirror purely for Vercel; deploy from Forgejo CI via the Vercel CLI +
  a deploy token; or move hosting off Vercel entirely. CI stays verify-only
  until this is decided; `vercel.json`'s build settings remain valid regardless.

### Quality tooling: Biome

- `biome.json` configures lint + format over `src/`. Scripts: `format`
  (`biome format --write`), `lint` (`biome lint`), `check` (`biome check`).
- Biome formats/lints JS and CSS; HTML is left to manual review (Biome's HTML
  support is partial).

### Testing: Playwright smoke suite

- `tests/smoke.spec.ts` covers the shared behavior the refactor could plausibly
  break — not pixel testing:
  - nav renders (has expected links) on a representative set of pages
    (`index`, a photography listing, `about/about`, a project page);
  - nav links navigate correctly;
  - theme toggle flips `data-theme` and persists across reload;
  - mobile menu opens and closes (mobile viewport);
  - home-page carousel initializes (tracks populated, transform applied).
- `playwright.config.js` runs against `vite preview` (production build) and/or
  the dev server.

### Continuous integration (Forgejo Actions)

The repo now lives on a self-hosted Forgejo instance, so CI uses **Forgejo
Actions** (GitHub-Actions-compatible syntax) at `.forgejo/workflows/ci.yml`. On
push to `main` and on pull requests it:

1. checks out the repo — LFS content is **not** required (the build copies
   `public/` verbatim and the smoke tests don't assert on media bytes), so LFS
   is skipped to save bandwidth;
2. sets up Node and runs `npm ci`;
3. runs `biome ci .` (lint + format check, no writes);
4. runs `npm run build` (`vite build`);
5. installs the Playwright Chromium browser and runs the smoke suite against
   `vite preview`.

Representative workflow:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verify:
    runs-on: docker            # adjust to match the Forgejo runner's labels
    steps:
      - uses: actions/checkout@v4
        with: { lfs: false }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx biome ci .
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test
```

Notes:
- `runs-on` label depends on how the Forgejo runner is registered (`docker`,
  `native`, `ubuntu-latest`, …); it will be set to match the actual runner.
- `actions/checkout` and `actions/setup-node` must be resolvable by the Forgejo
  runner via its configured actions registry (GitHub mirror or vendored).

## Migration sequence

Each step is verified before the next; pages are migrated in small batches so
regressions are localized.

1. **Scaffold** Vite + Tailwind-via-PostCSS + Biome. Confirm `vite dev` serves
   an unmigrated page and `vite build` produces `dist/`.
2. **Extract shared modules** (`nav.js`, `theme.js`, `bootstrap.js`) and wire the
   `transformIndexHtml` pre-paint snippet.
3. **Migrate pages in batches**, starting with `index.html` (the riskiest —
   carousel + 8 inline scripts), then the photography/video/art/projects
   listings, then leaf pages. For each: move inline scripts to a page module,
   swap script tags, normalize asset paths.
4. **Move assets** to `public/assets/` and finish path normalization; fix the
   about page.
5. **Add the Playwright smoke suite**; get it green.
6. **Update `vercel.json`**; run a full `vite build` + `vite preview` parity
   check against the current site.
7. **Add the Forgejo Actions CI workflow** (`.forgejo/workflows/ci.yml`);
   confirm it passes on a push/PR to Forgejo (runner label tuned to the host).

## Verification

- `vite build` succeeds; `vite preview` renders every page with working nav,
  theme toggle, mobile menu, and page-specific interactions.
- `biome check` passes over `src/`.
- Playwright smoke suite passes.
- Visual parity spot-check of the home hero/carousel, a photography listing,
  and the (now-fixed) about page against the pre-migration site.
- No remaining inline `<script>` blocks in source HTML (grep check).
- The Forgejo Actions CI workflow runs green (lint + build + smoke tests) on a
  push/PR to the Forgejo `origin`.
