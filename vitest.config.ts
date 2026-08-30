import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // e2e/ holds Playwright specs (run via `pnpm test:e2e`), not Vitest
    // ones — without this, Vitest's default glob picks up *.spec.ts
    // there too and fails trying to load the Playwright test() global.
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
});
