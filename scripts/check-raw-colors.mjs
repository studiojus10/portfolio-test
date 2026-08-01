// Fails when a template introduces a raw colour literal. Colour belongs in
// src/styles/tokens.css so both themes stay in step; the override sheet this
// replaced decayed precisely because literals bypassed it.
//
// Escape hatch: put `fixed:` in a comment on the same line for colours that
// are deliberately theme-invariant (brand red, scrims over photography).
// The marker is scoped PER LITERAL, not per line: walking the line's
// literals in order, a literal is exempt only if a `fixed:` marker appears
// somewhere between it and the next literal (or end of line). One trailing
// marker no longer waves through every literal that came before it on a
// shared line — each colour needs its own marker, so a line can carry a mix
// of exempt and offending literals.
import { globSync, readFileSync } from 'node:fs';

// ---- literal detectors --------------------------------------------------

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
// Content is restricted to digits/whitespace/comma/dot/slash/percent/minus —
// the same restriction the original rgba-only regex used — so this still
// only matches literal channel values. It must NOT match a token reference
// like `rgb(var(--c-primary))`: `var(--c-primary)` contains letters, so it
// falls outside the character class and the whole function call fails to
// match, same as the original regex already relied on for plain rgb()/rgba().
const FUNCTIONAL_COLOR = /\b(?:rgba?|hsla?|oklch|hwb|lab|lch)\([\d\s,./%-]+\)/g;

// A small set of actual CSS named colours. Matched only in CSS value
// position (immediately after one of the properties below) so bare words in
// prose or class names ("White Sands", "text-gray-500" as a *string*, etc.)
// don't false-positive. `transparent` / `currentColor` are deliberately
// excluded: neither carries an RGB literal, so neither can diverge between
// themes.
const NAMED_COLORS = new Set([
  'white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
  'pink', 'gray', 'grey', 'brown', 'cyan', 'magenta', 'navy', 'teal',
  'maroon', 'olive', 'lime', 'aqua', 'silver', 'gold', 'indigo', 'violet',
  'crimson', 'coral', 'salmon', 'khaki', 'plum', 'beige', 'tan', 'turquoise',
  'fuchsia',
]);
const COLOR_PROPERTY_VALUE =
  /\b(?:color|background|background-color|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|outline-color|text-decoration-color|fill|stroke)\s*:\s*([a-zA-Z][\w-]*)/gd;

// Tailwind's entire default palette (slate…rose, each with 50-950 shades)
// stays live under `theme.extend`, so `text-red-500` / `bg-neutral-900`
// compile fine and bypass the token layer entirely. `white` and `black` are
// declared explicitly in tailwind.config.js as invariant tokens instead
// (same values, zero visual change) and so are exempt here by construction:
// they're standalone keywords, not a family+shade pair, and this regex only
// matches the latter.
const DEFAULT_PALETTE_FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber',
  'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue',
  'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];
const DEFAULT_PALETTE_UTILITY = new RegExp(
  String.raw`(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|ring-offset|divide|placeholder|caret|accent|outline|decoration|shadow|from|via|to|fill|stroke)-(?:${DEFAULT_PALETTE_FAMILIES.join('|')})-(?:50|100|200|300|400|500|600|700|800|900|950)(?![\w-])`,
  'g',
);

// Tailwind arbitrary-value shadows (shadow-[0_2px_8px_rgba(0,0,0,.1)]) carry
// a literal that cannot be annotated: a class attribute has no comment
// syntax, so there is nowhere to put `fixed:`. Only the specific decorative
// shape actually in use — a zero x-offset, px y-offset/blur, and a *black*
// rgba (the only colour that shape covers across the codebase) — is
// stripped before scanning. That keeps the exemption narrow on purpose: a
// shadow carrying any other colour (e.g. a brand-red ring smuggled in as
// `shadow-[0_0_0_1px_#e03c31]`) is NOT this shape, survives stripping, and
// still gets caught. `bg-[#fff]` and friends were never touched by this
// exemption regardless.
const SHADOW_ARBITRARY =
  /shadow-\[0(?:_\d+px){2}_rgba\(0,\s*0,\s*0,\s*(?:0|1|0?\.\d+)\)\]/g;

const offenders = [];

// ---- per-line literal + marker matching ----------------------------------

function findLiterals(line) {
  const hits = [];
  for (const m of line.matchAll(HEX)) hits.push([m.index, m.index + m[0].length]);
  for (const m of line.matchAll(FUNCTIONAL_COLOR)) {
    hits.push([m.index, m.index + m[0].length]);
  }
  for (const m of line.matchAll(COLOR_PROPERTY_VALUE)) {
    if (NAMED_COLORS.has(m[1].toLowerCase())) {
      const [start, end] = m.indices[1];
      hits.push([start, end]);
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  return hits;
}

function uncoveredLiterals(line) {
  const literals = findLiterals(line);
  if (literals.length === 0) return [];
  const markers = [...line.matchAll(/fixed:/g)].map((m) => m.index);
  return literals.filter(([, end], i) => {
    const nextStart = i + 1 < literals.length ? literals[i + 1][0] : line.length;
    return !markers.some((p) => p >= end && p < nextStart);
  });
}

// ---- file scan -------------------------------------------------------

const files = [
  ...globSync('src/**/*.astro'),
  ...globSync('src/scripts/**/*.js'),
  // tokens.css is the sanctioned home for colour — the token layer's single
  // source of truth — and is excluded by path, not by annotating every line.
  ...globSync('src/styles/**/*.css').filter((f) => f !== 'src/styles/tokens.css'),
];

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((rawLine, i) => {
    const stripped = rawLine.replace(SHADOW_ARBITRARY, '');

    if (uncoveredLiterals(stripped).length > 0) {
      offenders.push(`${file}:${i + 1}  ${rawLine.trim().slice(0, 100)}`);
      return;
    }

    for (const m of stripped.matchAll(DEFAULT_PALETTE_UTILITY)) {
      offenders.push(
        `${file}:${i + 1}  default-palette utility \`${m[0]}\` bypasses the token layer  ${rawLine.trim().slice(0, 80)}`,
      );
    }
  });
}

// ---- !important on colour-affecting properties --------------------------
//
// All 364 !important rules this migration deleted lived in per-page
// <style is:global> blocks overriding colour. Nothing above catches them
// coming back: the literal-colour check only looks at values (and would
// wave through `color: rgb(var(--c-primary)) !important` — a token
// reference, not a raw literal), and tests/dark-mode.spec.ts only reads
// site.css. This closes that gap at the source rather than downstream.
//
// Scoped to .astro files only. site.css's sanctioned nav blur panel
// (background-color/border-color/backdrop-filter !important, see that
// file) is a deliberate, reviewed exception — it stays allowed because
// it's a .css file, out of scope by construction, rather than by adding a
// special-case exemption here that could quietly widen over time.
const COLOR_PROPERTIES = [
  'background-color',
  'background',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-color',
  'border',
  'text-decoration-color',
  'box-shadow',
  'outline',
  'fill',
  'stroke',
  'color',
];
// (?<![\w-]) / (?![\w-]) treat a hyphen as part of the "word" for boundary
// purposes, so `color` doesn't false-match inside `background-color`
// (JS's plain \b treats `-` as a break, so a bare \bcolor\b would wrongly
// fire there too) and `border` doesn't false-match inside `border-width`,
// `border-radius`, or the non-colour `border-top`/`border-right`/
// `border-bottom`/`border-left` shorthands (deliberately not in the list
// above — only the *-color longhands are).
const IMPORTANT_COLOR_PROPERTY = new RegExp(
  `(?<![\\w-])(?:${COLOR_PROPERTIES.join('|')})(?![\\w-])\\s*:\\s*[^;"}]*!important`,
  'g',
);

const astroFiles = globSync('src/**/*.astro');
for (const file of astroFiles) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((rawLine, i) => {
    for (const m of rawLine.matchAll(IMPORTANT_COLOR_PROPERTY)) {
      offenders.push(
        `${file}:${i + 1}  !important on a colour property \`${m[0].trim()}\`  ${rawLine.trim().slice(0, 80)}`,
      );
    }
  });
}

if (offenders.length) {
  console.error(
    `Colour-guard violations found in ${offenders.length} place(s).\n` +
      'Raw literals: move them into src/styles/tokens.css, or mark the line ' +
      '`fixed:` (per literal) if the colour is deliberately the same in ' +
      'both themes. Default-palette utility classes (text-red-500, ' +
      'bg-neutral-900, …) cannot be annotated — use a token utility ' +
      '(bg-primary, ...) or, if genuinely invariant, declare it explicitly ' +
      'in tailwind.config.js the way white/black are. `!important` on a ' +
      'colour property in an .astro file: express the override as a token ' +
      'in tokens.css instead (see --shadow-panel for an example) — this is ' +
      'exactly how the 364-rule override sheet this migration replaced ' +
      'came to exist.\n\n' +
      offenders.join('\n'),
  );
  process.exit(1);
}
console.log(
  'No unapproved raw colour literals or !important colour rules.',
);
