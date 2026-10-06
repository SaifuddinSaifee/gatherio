import Link from 'next/link';
import { MdAdd, MdArchive, MdCheckCircle, MdDescription, MdEditNote } from 'react-icons/md';
import type { IconType } from 'react-icons';
import { getCurrentSession } from '@/db/session';
import { listTemplates } from '@/lib/domain/template';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  active: 'Published',
  archived: 'Archived',
};

const STATUS_ICON: Record<string, IconType> = {
  draft: MdEditNote,
  active: MdCheckCircle,
  archived: MdArchive,
};

export default async function TemplatesPage() {
  const session = await getCurrentSession();
  if (!session) return null;

  const rows = await listTemplates(session.workspaceId);

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-headline-small font-medium text-md-on-surface">Templates</h1>
        <Link href="/templates/new">
          <Button variant="filled">
            <MdAdd aria-hidden="true" className="h-4.5 w-4.5" />
            New template
          </Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card className="mt-8 flex items-center gap-3">
          <MdDescription
            aria-hidden="true"
            className="h-6 w-6 shrink-0 text-md-on-surface-variant"
          />
          <p className="text-body-medium text-md-on-surface-variant">
            No templates yet. Create one to start instantiating cases.
          </p>
        </Card>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {rows.map(({ template, latestVersion, requirementCount }) => {
            const StatusIcon = latestVersion ? STATUS_ICON[latestVersion.status] : null;
            return (
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
                        <p className="mt-1 flex items-center gap-1.5 text-body-small text-md-on-surface-variant">
                          {StatusIcon && <StatusIcon aria-hidden="true" className="h-4.5 w-4.5" />}
                          {latestVersion
                            ? `${STATUS_LABEL[latestVersion.status]} · v${latestVersion.version} · ${requirementCount} requirement${requirementCount === 1 ? '' : 's'}`
                            : 'No versions'}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
