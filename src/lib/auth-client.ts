import { createAuthClient } from 'better-auth/react';

/**
 * Client-side auth for sign-in/sign-up/sign-out forms. baseURL omitted —
 * these calls are always same-origin (the app and the /api/auth route it
 * hits are the same Next.js deployment).
 */
export const authClient = createAuthClient();
