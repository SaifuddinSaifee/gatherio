import { MdAdd, MdError } from 'react-icons/md';
import { getCurrentSession } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Button } from '@/components/ui/button';
import { createTemplateAction } from '../actions';

export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;
  const [workspace, { error }] = await Promise.all([
    getWorkspaceById(session.workspaceId),
    searchParams,
  ]);

  return (
    <>
      <AppHeader workspaceName={workspace?.name ?? 'Workspace'} role={session.role} />
      <main className="mx-auto max-w-md px-6 py-12">
        <Card className="p-8">
          <h1 className="text-title-large font-medium text-md-on-surface">New template</h1>
          <p className="mt-1 text-body-medium text-md-on-surface-variant">
            You&apos;ll add requirements next, then publish it before it can be used for a case.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-sm bg-md-error-container px-4 py-2 text-body-small text-md-on-error-container"
            >
              <MdError aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
              Error: {error}
            </p>
          )}

          <form action={createTemplateAction} className="mt-6 flex flex-col gap-4">
            <TextField
              label="Template name"
              name="name"
              placeholder="e.g. Monthly Bookkeeping Close"
              required
            />
            <Button type="submit" variant="filled" fullWidth className="mt-2">
              <MdAdd aria-hidden="true" className="h-4.5 w-4.5" />
              Create template
            </Button>
          </form>
        </Card>
      </main>
    </>
  );
}
