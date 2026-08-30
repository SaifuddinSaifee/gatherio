'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { createWorkspaceForUser, deleteOrphanedUser } from '@/db/workspace';

export async function signUpAction(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const workspaceName =
    String(formData.get('workspaceName') ?? '').trim() || `${name || 'My'}'s workspace`;

  let userId: string;
  try {
    const result = await auth.api.signUpEmail({ body: { name, email, password } });
    userId = result.user.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create account.';
    redirect(`/sign-up?error=${encodeURIComponent(message)}`);
  }

  try {
    await createWorkspaceForUser(userId, workspaceName);
  } catch {
    // Compensating action: Better Auth's user commit is a separate
    // library's transaction we can't join, so if workspace creation
    // fails after the user already exists, clean up rather than leave
    // an orphaned account with no workspace.
    await deleteOrphanedUser(userId).catch(() => {});
    redirect(
      `/sign-up?error=${encodeURIComponent('Account created but workspace setup failed. Please try again.')}`,
    );
  }

  redirect('/dashboard');
}
