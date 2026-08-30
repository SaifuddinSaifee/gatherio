import Link from 'next/link';
import { getCurrentSession } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import { listTemplates } from '@/lib/domain/template';
import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  active: 'Published',
  archived: 'Archived',
};

export default async function TemplatesPage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const [workspace, rows] = await Promise.all([
    getWorkspaceById(session.workspaceId),
    listTemplates(session.workspaceId),
  ]);

  return (
    <>
      <AppHeader workspaceName={workspace?.name ?? 'Workspace'} role={session.role} />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-headline-small font-medium text-md-on-surface">Templates</h1>
          <Link href="/templates/new">
            <Button variant="filled">New template</Button>
          </Link>
        </div>

        {rows.length === 0 ? (
          <Card className="mt-8">
            <p className="text-body-medium text-md-on-surface-variant">
              No templates yet. Create one to start instantiating cases.
            </p>
          </Card>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {rows.map(({ template, latestVersion, requirementCount }) => (
              <li key={template.id}>
                <Link href={`/templates/${template.id}`}>
                  <Card className="transition-colors duration-(--duration-effects-fast) hover:bg-md-surface-container-high">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-title-medium text-md-on-surface">
                          {template.name}
                          {template.archivedAt && (
                            <span className="ml-2 text-label-small text-md-on-surface-variant">
                              (archived)
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-body-small text-md-on-surface-variant">
                          {latestVersion
                            ? `${STATUS_LABEL[latestVersion.status]} · v${latestVersion.version} · ${requirementCount} requirement${requirementCount === 1 ? '' : 's'}`
                            : 'No versions'}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
