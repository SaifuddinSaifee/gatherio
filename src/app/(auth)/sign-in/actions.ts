'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export async function signInAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  try {
    await auth.api.signInEmail({ body: { email, password } });
  } catch {
    redirect(`/sign-in?error=${encodeURIComponent('Invalid email or password.')}`);
  }

  redirect('/dashboard');
}
