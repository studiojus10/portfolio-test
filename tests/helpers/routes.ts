import { globSync } from 'node:fs';

/**
 * Every static route the site serves, derived from the page tree rather than
 * hand-listed, so it can't silently drift as pages are added/removed.
 *
 * Mirrors astro.config.mjs: `build.format: 'directory'` means an
 * `x/index.astro` collapses onto `/x`, and `trailingSlash: 'never'` means no
 * route carries a trailing slash. Both were confirmed against a real
 * `astro build` + `astro preview`: requesting the trailing-slash form of a
 * route (e.g. `/art/`) 404s. That matters because a leak/contrast sweep that
 * requests the wrong URL shape gets a 404 for nearly every route, and if the
 * sweep doesn't check the response status, those 404s can still "pass" a
 * leak check (the branded 404 page is itself styled fine for dark mode) —
 * all green, testing nothing. Every caller of `siteRoutes()` must assert on
 * the navigation response, not just on computed styles.
 */
export function siteRoutes(): string[] {
  const files = globSync('src/pages/**/*.astro').sort();
  return files.map((f) => {
    let route = f.replace(/^src[/\\]pages/, '').replace(/\.astro$/, '');
    route = route.replace(/\/index$/, '');
    return route === '' ? '/' : route;
  });
}
