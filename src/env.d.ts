/**
 * `onNavThemeChange` is the hook the theme toggle uses to reach page-specific
 * code. src/scripts/theme.js calls `window.onNavThemeChange?.()` after flipping
 * `data-theme`; each page script that has layout to recompute on a theme change
 * (the photography pages' hero sizing, for instance) assigns it.
 *
 * The two sides are bundled separately and neither imports the other -- that is
 * the point, since theme.js must not know which page it is on -- so the contract
 * between them lives here rather than in either file's exports.
 */
interface Window {
  onNavThemeChange?: () => void;
}
