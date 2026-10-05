import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Use the automatic JSX runtime so component tests and the components they
  // render compile JSX without an explicit `import React` (matching Next's
  // transform, where React need not be in scope).
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    // Default to the lightweight node environment. Component tests opt into
    // jsdom per-file with a `// @vitest-environment jsdom` docblock so the pure
    // logic tests keep running in node without paying the DOM startup cost.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
    },
  },
});
