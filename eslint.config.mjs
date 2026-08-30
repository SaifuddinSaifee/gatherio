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
    // Reaching for the raw `db` handle outside the db layer bypasses the
    // WHERE workspace_id = ? filter it applies for you.
    //
    // Everything under src/db/ is the db layer itself and is trusted with
    // raw access by definition (scoped.ts, client.ts, schema/**,
    // migrate.ts, seed.ts, reset.ts, session.ts, workspace.ts, ...) — an
    // enumerated file list here needed updating every time a new
    // legitimate db-internal file was added (twice in Stage 4 alone), so
    // this is a directory-level ignore instead.
    //
    // One carve-out outside src/db/, from Stage 4: src/lib/auth.ts.
    // Better Auth's user/session/account/verification tables are
    // intentionally unscoped — a user's identity exists before and
    // independent of any workspace membership.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/db/**', 'src/lib/auth.ts'],
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
          patterns: [
            {
              group: ['**/db/client'],
              importNames: ['db'],
              message:
                'Import scoped(workspaceId) from @/db/scoped instead of the raw db handle, so every query is workspace-filtered. (Caught via relative-path import — use the @/db/client form or, better, scoped().)',
            },
          ],
        },
      ],
    },
  },
];

export default config;
