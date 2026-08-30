import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '@/lib/env';
import * as schema from './schema';

const pool = new Pool({ connectionString: env.DATABASE_URL });

/**
 * Raw, unscoped handle. Do not import this outside src/db — every
 * workspace-scoped table must be read through scoped(workspaceId) in
 * ./scoped.ts (enforced by eslint.config.mjs's no-restricted-imports rule).
 */
export const db = drizzle(pool, { schema });

export type Database = typeof db;
