import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [glsl()],
  // no SPA fallback: a URL that doesn't match a real .html returns 404
  // instead of silently serving index.html
  appType: 'mpa',
  server: {
    port: 5180,
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
