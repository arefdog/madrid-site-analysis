import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  // Relative base so the build works on GitHub Pages project subpaths
  // (username.github.io/<repo>/) without hardcoding the repo name.
  base: './',
  server: { port: 4601, host: '127.0.0.1' },
  build: { outDir: 'dist', sourcemap: true },
});
