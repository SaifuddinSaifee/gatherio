/**
 * Split out of actions.ts because a `'use server'` file may only export
 * async functions — a plain constant (or a type) in that file throws
 * "A 'use server' file can only export async functions, found object" at
 * request time, not at build time, which is how this was caught (every
 * POST to a form bound to one of that file's actions 500'd silently).
 */
export interface AnswerFormState {
  error: string | null;
}

export const initialAnswerFormState: AnswerFormState = { error: null };
