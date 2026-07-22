import { defineConfig } from 'vite'

export default defineConfig({
  // Treat the linked chess.ts package like its published node_modules form so
  // Vite applies its normal CommonJS dependency transformation.
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4174',
      '/sync': {
        target: 'ws://127.0.0.1:4174',
        ws: true,
      },
    },
  },
})
