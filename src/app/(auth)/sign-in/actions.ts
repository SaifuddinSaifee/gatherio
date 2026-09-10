'use server';

import { redirect } from 'next/navigation';
import { APIError } from 'better-auth';
import { auth } from '@/lib/auth';

export async function signInAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  try {
    await auth.api.signInEmail({ body: { email, password } });
  } catch (err) {
    // Only credential failures should read as "Invalid email or password" —
    // an outage (DB unreachable, etc.) surfacing the same message hides the
    // real problem from both the user and anyone debugging it.
    if (err instanceof APIError && err.status === 'UNAUTHORIZED') {
      redirect(`/sign-in?error=${encodeURIComponent('Invalid email or password.')}`);
    }
    console.error('signInAction: unexpected error during sign-in', err);
    redirect(`/sign-in?error=${encodeURIComponent('Something went wrong. Please try again.')}`);
  }

  redirect('/dashboard');
}
