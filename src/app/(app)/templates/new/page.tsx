import { getCurrentSession } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import { AppHeader } from '@/components/app-header';
import { NewTemplateForm } from './new-template-form';

export default async function NewTemplatePage() {
  const session = await getCurrentSession();
  if (!session) return null;
  const workspace = await getWorkspaceById(session.workspaceId);

  return (
    <>
      <AppHeader workspaceName={workspace?.name ?? 'Workspace'} role={session.role} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-headline-small font-medium text-md-on-surface">New template</h1>
        <p className="mt-1 text-body-medium text-md-on-surface-variant">
          Add your first requirements now. You can publish, edit, or add more once it&apos;s created.
        </p>

        <div className="mt-6">
          <NewTemplateForm />
        </div>
      </main>
    </>
  );
}
