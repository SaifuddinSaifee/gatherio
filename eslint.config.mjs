import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
});

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'drizzle/**', '.storage/**', 'playwright-report/**', 'next-env.d.ts'],
  },
  {
    // Tenant isolation (design-md-gather-io plan, Stage 2): every
    // workspace-scoped table must be read through src/db/scoped.ts.
    // Reaching for the raw `db` handle outside that file bypasses the
    // WHERE workspace_id = ? filter it applies for you.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/db/scoped.ts', 'src/db/client.ts', 'src/db/schema/**', 'src/db/migrate.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/db/client',
              importNames: ['db'],
              message:
                'Import scoped(workspaceId) from @/db/scoped instead of the raw db handle, so every query is workspace-filtered.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
