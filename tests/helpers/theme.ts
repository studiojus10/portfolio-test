import type { Page } from '@playwright/test';

/** Seed the persisted theme before any page script runs (pre-paint). */
export async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => {
    localStorage.setItem('co-theme', t as string);
  }, theme);
}

/** Read a custom property off <html>. */
export function readVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

/** Computed colour of the first element matching `selector`. */
export function computed(
  page: Page,
  selector: string,
  prop: 'backgroundColor' | 'color' | 'borderTopColor',
): Promise<string> {
  return page.evaluate(
    ([s, p]) => {
      const el = document.querySelector(s as string);
      if (!el) throw new Error(`no element for ${s}`);
      return getComputedStyle(el)[p as 'color'];
    },
    [selector, prop],
  );
}
