import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

import { defineConfig } from 'vite'

const chessboardEntry = createRequire(import.meta.url).resolve('chessboard')
const chessboardRoot = resolve(dirname(chessboardEntry), '..')

export default defineConfig({
  // The shared board publishes its piece sets alongside its TypeScript source.
  publicDir: resolve(chessboardRoot, 'piece-sets'),
  // The local package is linked outside this example's node_modules tree.
  // Transform its CommonJS build explicitly while still resolving real pnpm
  // dependency paths (not the synthetic path through the package symlink).
  build: {
    commonjsOptions: {
      include: [/node_modules/, /\/chess\/dist\//],
    },
  },
  optimizeDeps: {
    include: [
      '@jacksonthall22/chess.ts',
      '@jacksonthall22/chess.ts/pgn',
      '@jacksonthall22/chess.ts/pgn/yjs',
      '@jacksonthall22/chess.ts/svg',
      'chessboard',
    ],
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
