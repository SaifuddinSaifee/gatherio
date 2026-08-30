import { getCurrentSession } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { signOutAction } from '../actions';

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) return null; // AppLayout already redirects; narrows the type below.

  const workspace = await getWorkspaceById(session.workspaceId);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-headline-small font-medium text-md-on-surface">
            {workspace?.name ?? 'Workspace'}
          </h1>
          <p className="mt-1 text-body-medium text-md-on-surface-variant">
            Signed in as {session.role}.
          </p>
        </div>

        <form action={signOutAction}>
          <Button type="submit" variant="text">
            Sign out
          </Button>
        </form>
      </div>

      <Card className="mt-8">
        <p className="text-body-medium text-md-on-surface-variant">
          Cases — built in Stage 9. Will show what is blocking each case.
        </p>
      </Card>
    </main>
  );
}
