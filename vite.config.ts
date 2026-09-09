import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [glsl()],
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
        big: 'big.html',
        hero: 'hero.html',
        heroKerning: 'hero-kerning.html',
        models: 'models.html',
        crumbs: 'crumbs.html',
      },
    },
  },
})
