import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [glsl()],
  // no SPA fallback: a URL that doesn't match a real .html returns 404
  // instead of silently serving index.html
  appType: 'mpa',
  server: {
    // `npm run dev` -> :5181 (90° cap), `npm run dev:spin` -> :5182 (free spin);
    // the port is read in main.ts. Both flags come from the package.json scripts.
    port: 5181,
    open: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        hero: 'hero.html',
        heroKerning: 'hero-kerning.html',
        bath: 'bath.html',
        gate: 'gate.html',
        models: 'models.html',
        crumbs: 'crumbs.html',
      },
    },
  },
})
