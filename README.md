# Studio Jus10 工作室

The digital media portfolio of Justin Hughes — photography, video, art, and
software projects, presented bilingually in English and Chinese.

Built as a static [Astro](https://astro.build) site, served by nginx, with a
small Node sidecar that turns contact-form submissions into email. Both ship as
container images built by Forgejo Actions.

---

## Quick start

```sh
pnpm install
pnpm run dev          # http://localhost:4321
```

Requires **Node ≥ 22.12.0** (`.nvmrc` pins 26) and **pnpm 11.3.0** exactly.

Images and video are **not in this repository** — `/public/assets/` is
gitignored and mounted as a volume at runtime. Without it the site builds and
renders fine, but every `/assets/*` URL 404s. Drop media under `./public/assets`
mirroring the URL tree (`./public/assets/carousel/foo.jpg` → `/assets/carousel/foo.jpg`).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm run dev` | Astro dev server with HMR |
| `pnpm run build` | Static build to `dist/` |
| `pnpm run preview` | Serve the built output |
| `pnpm run check` | The full gate — see below |
| `pnpm run format` | Biome formats JS/TS, Prettier formats `.astro` |
| `pnpm run test` | Playwright suite (builds and starts its own preview server) |

`pnpm run check` runs five things in order, and CI runs exactly this:

1. `astro check` — type and template diagnostics
2. `biome check src/scripts tests njs *.js` — lint and format
3. `node scripts/check-raw-colors.mjs` — the colour guard (below)
4. `pnpm --dir mailer test` — mailer unit tests
5. `node --test "njs/**/*.test.js"` — nginx njs tests

Playwright needs browsers once: `pnpm exec playwright install --with-deps chromium`.

## Layout

```
src/
  pages/          40 .astro pages — routes are the file tree
  layouts/Base.astro    the only layout; owns <head>, fonts, theme bootstrap
  components/Nav.astro  the only component; dropdowns, mobile menu, theme toggle
  scripts/        one .js per page + shared nav/theme/hero modules
  styles/         tokens.css (all colour), global.css, site.css
njs/              nginx njs source — the contact-form fallback
mailer/           the SMTP sidecar (its own pnpm root — see mailer/README.md)
scripts/          check-raw-colors.mjs
tests/            Playwright specs
docs/             design docs and implementation plans
```

There are no content collections and no CMS. Page copy lives in the `.astro`
files; gallery image lists are plain arrays in `src/scripts/*.js`.

Sections: `/photography` (six regions, each with leaf galleries), `/video`,
`/art`, `/projects`, plus `/about` and `/contact`.

## Theming and the colour rule

Dark mode is driven by `data-theme="dark"` on `<html>`, set before first paint
from `localStorage['co-theme']` with a `prefers-color-scheme` fallback.

**Every colour lives in `src/styles/tokens.css`.** Tailwind's palette is mapped
onto those tokens as `rgb(var(--c-…) / <alpha-value>)`, and
`scripts/check-raw-colors.mjs` fails the build on any raw hex, `rgb()`/`hsl()`
literal, CSS colour name, default Tailwind palette utility (`bg-neutral-900`),
or `!important` colour rule in `.astro`.

This exists because the sheet it replaced was 35 hand-written `!important`
overrides that only covered utilities somebody remembered to add — the theme
decayed with every new page. See `docs/superpowers/specs/2026-07-31-dark-mode-design.md`.

If a literal is genuinely correct and theme-invariant, annotate it inline:

```astro
style="color:#c0392b; /* fixed: brand alert red, invariant across themes */"
```

The `fixed:` marker is scoped per literal, not per line.

The Playwright suite sweeps all 40 routes in dark mode for light-surface leaks
and asserts WCAG contrast ≥ 4.5:1 (brand red held to ≥ 3:1).

## Contact form

A submission survives the mailer being down, because it is written to disk
before anything else can fail:

```
browser → nginx  /api/contact
            └─ njs spool.js → subrequest → mailer /api/contact → disk queue → SMTP
                              └─ mailer unreachable or 5xx? write to /data/inbox
```

`njs/spool.js` passes any mailer response below 500 straight through — a 400,
413, or 429 is a real judgement about the submission and must not be spooled.
Anything else (connection refused, 5xx, no status) gets spooled to
`$inbox_dir` via write-then-`rename`, and the mailer promotes it on its next
tick. Two submissions were lost to a 502 on 2026-08-02; this is the fix.

The mailer keeps its own disk queue with capped exponential backoff
(30s → 1h, 20 attempts ≈ 14 hours). With `SMTP_USER`/`SMTP_PASS` unset it
accepts and logs but does not deliver — check `/api/health` reports
`"mode":"smtp"` after deploying.

Full endpoint, config, and troubleshooting reference: **[`mailer/README.md`](mailer/README.md)**.

## Running the whole stack

```sh
cp .env.example .env       # SMTP credentials for the mailer
docker compose up -d --build
```

Site on <http://localhost:8080>, health at `curl localhost:8080/api/health`.

The web image is a two-stage build: Node 26 builds the Astro output, then
`nginx:alpine` picks up `nginx-module-njs`, `nginx.conf`, and `njs/spool.js`.
`RUN nginx -t` in the build fails it if the njs doesn't compile.

Both containers have liveness-only healthchecks against `127.0.0.1` — not
`localhost`, because busybox wget tries `::1` first and nginx binds IPv4 only.
Neither asserts `"ok":true`; that flips false whenever anything sits in
`failed/`, and nothing clears it automatically.

`web` deliberately does **not** gate on `service_healthy` for the mailer —
that would take the site, and therefore the njs fallback, down with it.

In production the images come from the registry and are auto-updated by
What's-Up-Docker. Two host-side prerequisites live outside this repo:

```sh
mkdir -p /srv/studiojus10/mailer-queue/inbox
chown -R 99:100 /srv/studiojus10/mailer-queue
```

and `inbox/` must be mounted into `web` **read-write** — nginx writes fallback
submissions there directly.

## CI

`.forgejo/workflows/ci.yml`, on a self-hosted Forgejo runner.

- **verify** — pnpm installed from a SHA256-pinned release tarball, then
  `pnpm run check`, `pnpm run build`, and the Playwright suite.
- **docker** — on `main` and `v*` tags only: builds and pushes
  `forge.daveynet.xyz/davey/studiojus10` and `…/studiojus10-mailer`, tagged
  `sha-<7char>` plus `latest` or the version. Uses an isolated `docker-container`
  buildx builder so `:latest` never lands in the host image store.

Needs repo secrets `REGISTRY_USER` and `REGISTRY_TOKEN` (a `write:package` PAT).

pnpm 11.3.0 is pinned in four places that must move together: `package.json`,
`Dockerfile`, `mailer/Dockerfile`, and `PNPM_VERSION`/`PNPM_SHA256` in the
workflow.

## Stack

Astro 7 · Tailwind CSS 3 (via PostCSS, not `@astrojs/tailwind`) · TypeScript ·
Biome · Prettier (`.astro` only) · Playwright · nginx + njs · Node + nodemailer

## License

Copyright (C) 2026 Justin Hughes and Davey Hughes

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
this program. If not, see <https://www.gnu.org/licenses/>.

The full text is in [`LICENSE.md`](LICENSE.md).

Photographs, video, artwork, and other media are **not** covered by the GPL and
are not distributed with this repository. All rights to those works are
reserved by their author.
