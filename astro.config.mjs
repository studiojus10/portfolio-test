import { defineConfig } from 'astro/config';

export default defineConfig({
  build: { format: 'directory' }, // /photography/index.html -> served at /photography
  trailingSlash: 'never',
});
