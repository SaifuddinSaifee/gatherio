import { getCurrentSession } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import { signOutAction } from '../actions';

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) return null; // AppLayout already redirects; narrows the type below.

  const workspace = await getWorkspaceById(session.workspaceId);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-md-on-background">
            {workspace?.name ?? 'Workspace'}
          </h1>
          <p className="mt-1 text-sm text-md-on-surface-variant">
            Signed in as {session.role}.
          </p>
        </div>

        <form action={signOutAction}>
          <button
            type="submit"
            className="h-10 rounded-full px-6 text-sm font-medium text-md-primary transition-all duration-300 ease-md-standard hover:bg-md-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 active:scale-95 active:bg-md-primary/5"
          >
            Sign out
          </button>
        </form>
      </div>

      <div className="mt-8 rounded-md-lg bg-md-surface-container p-8 shadow-sm">
        <p className="text-md-on-surface-variant">
          Cases — built in Stage 9. Will show what is blocking each case.
        </p>
      </div>
    </main>
  );
}
