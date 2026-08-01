/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,ts}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Tailwind's default palette (slate…rose, plus white/black) stays
        // live under `extend` — it isn't replaced, only added to — so every
        // default-palette utility still compiles and bypasses the token
        // layer. `white`/`black` are declared here explicitly, at the same
        // values Tailwind already ships, purely so the 51 existing uses
        // (50 text-white + 1 bg-black, all sitting on bg-primary or a photo
        // scrim, audited as legitimately theme-invariant) are a documented,
        // deliberate choice rather than an accidental one. Nothing else in
        // the default palette is declared: scripts/check-raw-colors.mjs
        // flags any other default-palette utility (text-red-500,
        // bg-neutral-900, …) as an offender, since those bypass the token
        // layer without the same audit.
        white: '#ffffff',
        black: '#000000',
        background: 'rgb(var(--c-background) / <alpha-value>)',
        error: 'rgb(var(--c-error) / <alpha-value>)',
        'error-container': 'rgb(var(--c-error-container) / <alpha-value>)',
        'inverse-on-surface':
          'rgb(var(--c-inverse-on-surface) / <alpha-value>)',
        'inverse-primary': 'rgb(var(--c-inverse-primary) / <alpha-value>)',
        'inverse-surface': 'rgb(var(--c-inverse-surface) / <alpha-value>)',
        'on-background': 'rgb(var(--c-on-background) / <alpha-value>)',
        'on-error': 'rgb(var(--c-on-error) / <alpha-value>)',
        'on-error-container':
          'rgb(var(--c-on-error-container) / <alpha-value>)',
        'on-primary': 'rgb(var(--c-on-primary) / <alpha-value>)',
        'on-primary-container':
          'rgb(var(--c-on-primary-container) / <alpha-value>)',
        'on-primary-fixed': 'rgb(var(--c-on-primary-fixed) / <alpha-value>)',
        'on-primary-fixed-variant':
          'rgb(var(--c-on-primary-fixed-variant) / <alpha-value>)',
        'on-secondary': 'rgb(var(--c-on-secondary) / <alpha-value>)',
        'on-secondary-container':
          'rgb(var(--c-on-secondary-container) / <alpha-value>)',
        'on-secondary-fixed-variant':
          'rgb(var(--c-on-secondary-fixed-variant) / <alpha-value>)',
        'on-surface': 'rgb(var(--c-on-surface) / <alpha-value>)',
        'on-surface-variant':
          'rgb(var(--c-on-surface-variant) / <alpha-value>)',
        'on-tertiary': 'rgb(var(--c-on-tertiary) / <alpha-value>)',
        'on-tertiary-container':
          'rgb(var(--c-on-tertiary-container) / <alpha-value>)',
        'on-tertiary-fixed': 'rgb(var(--c-on-tertiary-fixed) / <alpha-value>)',
        'on-tertiary-fixed-variant':
          'rgb(var(--c-on-tertiary-fixed-variant) / <alpha-value>)',
        outline: 'rgb(var(--c-outline) / <alpha-value>)',
        'outline-variant': 'rgb(var(--c-outline-variant) / <alpha-value>)',
        primary: 'rgb(var(--c-primary) / <alpha-value>)',
        'primary-container': 'rgb(var(--c-primary-container) / <alpha-value>)',
        'primary-fixed': 'rgb(var(--c-primary-fixed) / <alpha-value>)',
        'primary-fixed-dim': 'rgb(var(--c-primary-fixed-dim) / <alpha-value>)',
        secondary: 'rgb(var(--c-secondary) / <alpha-value>)',
        'secondary-container':
          'rgb(var(--c-secondary-container) / <alpha-value>)',
        'secondary-fixed': 'rgb(var(--c-secondary-fixed) / <alpha-value>)',
        'secondary-fixed-dim':
          'rgb(var(--c-secondary-fixed-dim) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-bright': 'rgb(var(--c-surface-bright) / <alpha-value>)',
        'surface-container': 'rgb(var(--c-surface-container) / <alpha-value>)',
        'surface-container-high':
          'rgb(var(--c-surface-container-high) / <alpha-value>)',
        'surface-container-highest':
          'rgb(var(--c-surface-container-highest) / <alpha-value>)',
        'surface-container-low':
          'rgb(var(--c-surface-container-low) / <alpha-value>)',
        'surface-container-low-hover':
          'rgb(var(--c-surface-container-low-hover) / <alpha-value>)',
        'surface-container-lowest':
          'rgb(var(--c-surface-container-lowest) / <alpha-value>)',
        'surface-dim': 'rgb(var(--c-surface-dim) / <alpha-value>)',
        'surface-tint': 'rgb(var(--c-surface-tint) / <alpha-value>)',
        'surface-variant': 'rgb(var(--c-surface-variant) / <alpha-value>)',
        tertiary: 'rgb(var(--c-tertiary) / <alpha-value>)',
        'tertiary-container':
          'rgb(var(--c-tertiary-container) / <alpha-value>)',
        'tertiary-fixed': 'rgb(var(--c-tertiary-fixed) / <alpha-value>)',
        'tertiary-fixed-dim':
          'rgb(var(--c-tertiary-fixed-dim) / <alpha-value>)',
        rule: 'rgb(var(--c-rule) / <alpha-value>)',
        'rule-strong': 'rgb(var(--c-rule-strong) / <alpha-value>)',
        'fixed-dark': 'rgb(var(--c-fixed-dark) / <alpha-value>)',
        'on-fixed-dark': 'rgb(var(--c-on-fixed-dark) / <alpha-value>)',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      boxShadow: {
        // Token-backed nav dropdown shadow (Follow-up 1): light reproduces
        // shadow-lg exactly, dark restores the depth cue the deleted
        // !important override sheet used to provide. See tokens.css.
        panel: 'var(--shadow-panel)',
      },
      spacing: {
        'element-gap': '32px',
        'section-gap': '120px',
        'margin-mobile': '20px',
        gutter: '24px',
        'margin-desktop': '64px',
      },
      fontFamily: {
        'body-lg': ['Hanken Grotesk'],
        'display-lg': ['Old Standard TT'],
        'label-mono': ['Space Grotesk'],
        'label-caps': ['Space Grotesk'],
        'headline-md': ['Old Standard TT'],
        'headline-lg': ['Old Standard TT'],
        'body-md': ['Hanken Grotesk'],
        'headline-lg-mobile': ['Old Standard TT'],
        cjk: ['Noto Serif SC', 'serif'],
      },
      fontSize: {
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'display-lg': [
          '84px',
          { lineHeight: '92px', letterSpacing: '-0.02em', fontWeight: '700' },
        ],
        'label-mono': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-caps': [
          '12px',
          { lineHeight: '16px', letterSpacing: '0.1em', fontWeight: '700' },
        ],
        'headline-md': ['32px', { lineHeight: '40px', fontWeight: '500' }],
        'headline-lg': ['48px', { lineHeight: '56px', fontWeight: '600' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'headline-lg-mobile': [
          '32px',
          { lineHeight: '38px', fontWeight: '600' },
        ],
        xs: '14px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
