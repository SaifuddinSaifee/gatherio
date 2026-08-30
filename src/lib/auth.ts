import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/db/client';
import { env } from '@/lib/env';

/**
 * Requester-side auth only. External parties (recipients) never
 * authenticate through this — they use magic links (Stage 6). "Workspace"
 * is deliberately not modeled here: see the plan's Stage 4 section for
 * why Better Auth's organization plugin was not adopted. Sign-up wires a
 * workspace + workspace_member row as an explicit second step (src/lib/
 * workspace.ts), not through this config.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    camelCase: false,
  }),
  secret: env.AUTH_SECRET,
  baseURL: env.APP_URL,
  emailAndPassword: {
    enabled: true,
  },
  // Must be last — it's what makes a direct server-action call to
  // auth.api.signUpEmail()/signInEmail() (bypassing the HTTP route) still
  // persist the session cookie onto the outgoing Next.js response.
  plugins: [nextCookies()],
});
