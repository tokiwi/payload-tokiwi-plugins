import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Vitest would otherwise root itself at this file's directory and resolve every
  // glob below inside `test/`.
  root: path.resolve(dirname, '..'),
  plugins: [tsconfigPaths(), react()],
  test: {
    include: [
      // One integration suite per package, plus the application's own. Each
      // consumes a package through its exports map, never its src.
      'test/*/**/*.int.spec.ts',
      // A package's own unit tests live with the package, because they import
      // internal modules that the exports map deliberately does not publish.
      'packages/*/test/**/*.spec.ts',
    ],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Each file boots Payload against its own database file.
    fileParallelism: false,
  },
})
