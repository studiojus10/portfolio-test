# Astro Migration (Clean Nested URLs) — Design

**Date:** 2026-07-17
**Branch:** `astro-migration` (off `vite-migration` @ `c214dd7`)
**Status:** Design for owner verification — not yet approved for implementation

## Goal

Migrate the site from the Vite multi-page app (39 hand-authored `.html` files at
the repo root, runtime-injected nav, duplicated `<head>`) to **Astro**, gaining:

- **Clean, deeply-nested URLs** with no `.html` extension
  (`/photography/colorado/twelve-views`, `/video/dublin`, `/about`).
- **A single source of truth for shared chrome** — one `Base.astro` layout owns
  the `<head>`, nav, and footer, ending the per-page duplication the Vite
  migration deliberately left in place.
- **Statically-rendered nav** (built into the HTML) instead of runtime injection.

The migration is **behavior-preserving**: the site looks and behaves the same;
only the source structure, the URLs, and the shared-chrome factoring change.

### Scope decisions (confirmed with owner)

- **Framework:** Astro (latest), static output (`output: 'static'`).
- **Tailwind:** stays **v3**, via the `@astrojs/tailwind` integration
  (`tailwindcss@3 @astrojs/tailwind`). No v4.
- **URLs:** **deep hierarchy** — section / region / series. Region pages are
  folder indexes. Astro's default `build.format: 'directory'` yields the clean
  extension-less URLs; `trailingSlash: 'never'`.
- **Redirects:** **none.** Clean break — old `.html` URLs 404.
- **Images:** keep media in **`public/assets/`**, referenced `/assets/...`,
  unchanged. **`astro:assets` optimization is deferred** to a separate follow-up
  once the LFS media is materialized (see Open Items) — adopting it now would
  fail the build, since `<Image/>` runs real files through `sharp` and the LFS
  bytes are currently pointer stubs.
- **Interactive JS:** vanilla — ported into Astro `<script>` blocks reusing the
  ES modules already extracted in the Vite migration. **No React/UI framework.**
- **Tooling:** Biome lints/formats the JS/TS in `src/scripts`; `.astro` files are
  type-checked by `astro check` and formatted by `prettier` +
  `prettier-plugin-astro` (Biome does not fully support `.astro`). Playwright
  smoke suite carries over with clean URLs.
- **Deployment:** **Docker container** (self-hosted on the owner's server) — a
  multi-stage build (`node` → `astro build`) serving the static `dist/` via
  `nginx:alpine` with clean-URL config. **Vercel is dropped** (`vercel.json`
  removed). No SSR adapter (static output).

### Out of scope

- Visual redesign or content changes.
- `astro:assets` image optimization (deferred follow-up).
- Redirects.
- Tailwind v4.
- Resolving the Git-LFS media (tracked separately; see Open Items).

## Current state (baseline = `vite-migration` @ `c214dd7`)

- 39 pages migrated to a Vite MPA: each root `*.html` (+ `about/about.html`)
  loads one `<script type="module" src="/src/pages/<page>.js">` importing
  `src/lib/bootstrap.js` (CSS + runtime `renderNav()` + theme) then its former
  inline scripts (ported verbatim). Zero inline scripts in source HTML; the
  pre-paint theme snippet is injected by Vite `transformIndexHtml`.
- Shared modules: `src/lib/nav.js` (`renderNav()`), `theme.js` (`initTheme()`),
  `bootstrap.js`, `carousel-stills.js` (`seekStills()`).
- `src/pages/*.js` — one module per page (carousel, scroll parallax, gallery/
  lightbox, video hover, etc.), all clean ES modules.
- Tailwind v3 via PostCSS; `src/styles/{main.css,site.css}`. Media in
  `public/assets/`, all refs root-absolute `/assets/...`. Biome 2, Node 26,
  Playwright smoke suite (13 tests, runs against `dist`).
- **These extracted modules are the raw material for the Astro port** — the JS
  logic is preserved; only its *hosting* changes (component `<script>`s + static
  Nav instead of runtime injection).

## Target architecture

### Project structure

```
src/
├── layouts/
│   └── Base.astro              # <head> (fonts, meta, <title> via prop), pre-paint theme (is:inline),
│                               #   <Nav/>, <slot/>, footer — the single shared-chrome source
├── components/
│   └── Nav.astro               # static nav markup (from renderNav) + a <script> for mobile menu /
│                               #   hide-on-scroll / theme toggle; active state derived from Astro.url
├── pages/                      # deep-nested → clean URLs
│   ├── index.astro             # home; carousel <script>
│   ├── contact.astro
│   ├── about.astro
│   ├── photography/index.astro
│   ├── photography/colorado/index.astro
│   ├── photography/colorado/twelve-views.astro
│   ├── photography/nature/flowers.astro   … (all series)
│   ├── video/index.astro,  video/dublin.astro  …
│   ├── art/index.astro,   art/sketches.astro,  art/composers.astro
│   └── projects/index.astro, projects/peak-pet.astro, projects/career-footprint.astro
├── scripts/                    # shared + page interactive JS (ported from src/lib + src/pages)
│   ├── theme.ts, nav.ts, carousel-stills.ts, home-hero.ts, gallery-lightbox.ts, …
└── styles/
    └── global.css              # @tailwind base/components/utilities + the current site.css
public/assets/                  # media, unchanged (/assets/... paths preserved)
astro.config.mjs                # integrations:[tailwind()], build.format:'directory', trailingSlash:'never'
tailwind.config.js              # content globs → ./src/**/*.{astro,html,js,ts}
```

### Complete page → URL → file map (39)

| Old file | New URL | New Astro file |
|---|---|---|
| `index.html` | `/` | `src/pages/index.astro` |
| `contact.html` | `/contact` | `src/pages/contact.astro` |
| `about/about.html` | `/about` | `src/pages/about.astro` |
| `photography.html` | `/photography` | `src/pages/photography/index.astro` |
| `photography-colorado.html` | `/photography/colorado` | `photography/colorado/index.astro` |
| `photography-colorado-twelve-views.html` | `/photography/colorado/twelve-views` | `photography/colorado/twelve-views.astro` |
| `photography-colorado-rock-ledge.html` | `/photography/colorado/rock-ledge` | `photography/colorado/rock-ledge.astro` |
| `photography-colorado-cornfield.html` | `/photography/colorado/cornfield` | `photography/colorado/cornfield.astro` |
| `photography-colorado-golf.html` | `/photography/colorado/golf` | `photography/colorado/golf.astro` |
| `photography-arizona.html` | `/photography/arizona` | `photography/arizona/index.astro` |
| `photography-arizona-travels.html` | `/photography/arizona/travels` | `photography/arizona/travels.astro` |
| `photography-washington.html` | `/photography/washington` | `photography/washington/index.astro` |
| `photography-washington-seattle.html` | `/photography/washington/seattle` | `photography/washington/seattle.astro` |
| `photography-nature.html` | `/photography/nature` | `photography/nature/index.astro` |
| `photography-nature-landscapes.html` | `/photography/nature/landscapes` | `photography/nature/landscapes.astro` |
| `photography-nature-flowers.html` | `/photography/nature/flowers` | `photography/nature/flowers.astro` |
| `photography-nature-sanctuary.html` | `/photography/nature/sanctuary` | `photography/nature/sanctuary.astro` |
| `photography-nature-museum.html` | `/photography/nature/museum` | `photography/nature/museum.astro` |
| `photography-film.html` | `/photography/film` | `photography/film/index.astro` |
| `photography-film-europe.html` | `/photography/film/europe` | `photography/film/europe.astro` |
| `photography-film-home.html` | `/photography/film/home` | `photography/film/home.astro` |
| `photography-film-memory.html` | `/photography/film/memory` | `photography/film/memory.astro` |
| `photography-europe.html` | `/photography/europe` | `photography/europe/index.astro` |
| `photography-europe-france-protests.html` | `/photography/europe/france-protests` | `photography/europe/france-protests.astro` |
| `video.html` | `/video` | `video/index.astro` |
| `video-collage.html` | `/video/collage` | `video/collage.astro` |
| `video-decadance.html` | `/video/decadance` | `video/decadance.astro` |
| `video-dublin.html` | `/video/dublin` | `video/dublin.astro` |
| `video-murder.html` | `/video/murder` | `video/murder.astro` |
| `video-portrait.html` | `/video/portrait` | `video/portrait.astro` |
| `video-resurrection.html` | `/video/resurrection` | `video/resurrection.astro` |
| `video-single-shot.html` | `/video/single-shot` | `video/single-shot.astro` |
| `video-winter.html` | `/video/winter` | `video/winter.astro` |
| `art.html` | `/art` | `art/index.astro` |
| `art-sketches.html` | `/art/sketches` | `art/sketches.astro` |
| `art-composers.html` | `/art/composers` | `art/composers.astro` |
| `projects.html` | `/projects` | `projects/index.astro` |
| `projects-peak-pet.html` | `/projects/peak-pet` | `projects/peak-pet.astro` |
| `projects-career-footprint.html` | `/projects/career-footprint` | `projects/career-footprint.astro` |

### Shared chrome

- **`Base.astro`** — props: `title`, optional `bodyClass`/`description`. Renders
  `<head>` (fonts, Material Symbols, meta, `<title>{title}</title>`), the
  pre-paint theme `<script is:inline>` (reads `localStorage 'co-theme'`, sets
  `data-theme` before paint), `<Nav/>`, `<slot/>` for page content, and any
  footer. Every page imports and wraps its content in it.
- **`Nav.astro`** — the current `renderNav()` markup expressed as a real Astro
  template. Internal links are the new clean paths (`/photography/colorado`).
  **Active state derived from `Astro.url.pathname`** at build (e.g.
  `pathname.startsWith('/photography')`), which also fixes the pre-existing
  cleanUrls active-state quirk. Interactive behavior (mobile menu open/close,
  hide/reveal-on-scroll, theme toggle) ships as a bundled `<script>` importing
  `src/scripts/nav.ts` + `theme.ts`.

### Interactive JS

- Shared logic ports from `src/lib/*` into `src/scripts/*` (TS or JS); page
  logic ports from each `src/pages/<page>.js` into that page's `.astro`
  `<script>` block. Astro bundles/optimizes `<script>`s by default.
- The home carousel, scroll parallax, gallery/lightbox, and video-hover logic
  move verbatim (behavior-preserving) into the relevant component/page scripts.
- `seekStills()` and similar helpers become shared imports.

### Styles

- `src/styles/global.css` = `@tailwind base/components/utilities;` plus the
  current `site.css` contents (the dark-mode custom properties, nav/menu
  overrides, hero styles). Imported once from `Base.astro`.
- Tailwind v3 via `@astrojs/tailwind`; `tailwind.config.js` `content` globs
  updated to `./src/**/*.{astro,html,js,ts}`.

### Assets

- `public/assets/**` unchanged; every `/assets/...` reference is preserved
  as-is. No `astro:assets` yet (deferred follow-up).

### Build / deploy

- `astro build` → `dist/` with directory-format output (`/photography/index.html`
  → served at `/photography`). `astro preview` for local/CI verification.
- `vercel.json` updated: `buildCommand: "astro build"`, `outputDirectory: "dist"`.
  With directory-format clean URLs, `cleanUrls` is redundant but harmless.
- Static output — works on any static host; no adapter needed. (A Vercel adapter
  can be added later if server features/real 301s are wanted.)

### Testing / CI

- Playwright smoke suite ported to clean URLs: nav renders + links resolve on
  representative pages, theme toggles + persists, mobile menu opens, home
  carousel initializes, about page renders with no 404s. Add an assertion that a
  representative old `.html` URL now 404s (confirms the clean break).
- Runs against `astro build && astro preview`.
- Forgejo Actions CI updated: `astro check` + `biome ci` + `astro build` +
  Playwright. Node 26.

## Migration sequence (phased; each phase verified before the next)

1. **Scaffold Astro** alongside the Vite app: add `astro`, `@astrojs/tailwind`,
   `astro.config.mjs`, `src/layouts/Base.astro`, `src/components/Nav.astro`,
   `src/styles/global.css`, `src/scripts/{theme,nav,carousel-stills}`. Prove the
   toolchain by migrating **one simple page** (`contact` → `/contact`) and
   getting `astro build` + a smoke test green.
2. **Home** (`index.astro`) — the carousel + hero scripts (highest-risk page).
3. **Photography** — nested region indexes + series (batched).
4. **Video**, then **Art + Projects**, then **About**.
5. **Retire the Vite MPA layer**: remove the root `*.html`, `src/pages/*.js`,
   the standalone `vite.config.js`/`postcss.config.js`, and the old
   `src/lib`/`src/styles` files once superseded (Astro brings its own Vite +
   PostCSS, so the *tooling* isn't removed — only our MPA config and the
   hand-authored HTML pages). Update `package.json` scripts, `vercel.json`, and
   the Forgejo CI to Astro (`astro build`/`check`).
6. **Verify**: full `astro build`, Playwright suite green against `dist`, clean
   URLs resolve, old `.html` paths 404, `astro check` + Biome clean.

## Verification

- `astro build` succeeds; `dist/` serves every page at its clean nested URL.
- `astro preview` renders each page with working nav, theme toggle, mobile menu,
  and page interactions (behavior parity with the Vite build — visual parity
  spot-check is limited until LFS media is real).
- No `.html` URLs are served; old paths 404.
- `astro check` passes; `biome ci` clean on `src/scripts`; Playwright green.

## Open items / follow-ups (not blocking this migration)

- **LFS media** — the real image/video bytes are not materialized (GitHub LFS
  quota exceeded; `origin` is the empty Forgejo repo). Tracked separately; the
  Astro migration builds fine on `public/assets` stubs (paths resolve, pixels
  don't). Visual verification waits on this.
- **`astro:assets`** — once real media is present, a follow-up moves images into
  `src/assets` + `<Image/>` for responsive/optimized output.
- **Deployment** — now a self-hosted **Docker** container (nginx serving static
  `dist/`); Vercel dropped. CI stays verify-only; optionally the Forgejo CI could
  build/push the image to Forgejo's container registry (owner's call).
