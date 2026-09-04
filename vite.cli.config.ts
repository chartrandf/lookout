import { defineConfig } from 'vite'

// The CLI is a separate Node bundle, not part of the app build: one file, node builtins external,
// so it needs no install step and no dependency of its own beyond Node itself.
export default defineConfig({
  publicDir: false, // the app's static assets have no business in a CLI bundle
  build: {
    ssr: 'src/cli/index.ts',
    outDir: 'dist-cli',
    target: 'node22',
    minify: false,
    emptyOutDir: true,
    rollupOptions: {
      output: { entryFileNames: 'lookout.mjs', banner: '#!/usr/bin/env node' },
    },
  },
})
