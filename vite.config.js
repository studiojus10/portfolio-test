import { resolve } from 'node:path';
import fg from 'fast-glob';
import { defineConfig } from 'vite';

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
