import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  MdArchive,
  MdArrowBack,
  MdCheckCircle,
  MdContentCopy,
  MdEdit,
  MdEditNote,
  MdError,
  MdPublish,
  MdTaskAlt,
  MdUnarchive,
  MdUpload,
} from 'react-icons/md';
import type { IconType } from 'react-icons';
import { getCurrentSession, requireRole } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import { getTemplate, getLatestVersion, listRequirementDefinitions } from '@/lib/domain/template';
import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { setTemplateArchivedAction, publishVersionAction, createDraftVersionAction } from '../actions';

const ACTION_TYPE_LABEL: Record<string, string> = {
  upload: 'Upload',
  answer: 'Answer',
  acknowledge: 'Acknowledge',
};

const ACTION_TYPE_ICON: Record<string, IconType> = {
  upload: MdUpload,
  answer: MdEditNote,
  acknowledge: MdTaskAlt,
};

const VERSION_STATUS_ICON: Record<string, IconType> = {
  draft: MdEditNote,
  active: MdCheckCircle,
  archived: MdArchive,
};

export default async function TemplateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  const { templateId } = await params;
  const { error } = await searchParams;

  const template = await getTemplate(session.workspaceId, templateId);
  if (!template) notFound();

  const [workspace, version] = await Promise.all([
    getWorkspaceById(session.workspaceId),
    getLatestVersion(session.workspaceId, templateId),
  ]);
  const definitions = version ? await listRequirementDefinitions(session.workspaceId, version.id) : [];
  const isDraft = version?.status === 'draft';

  return (
    <>
      <AppHeader workspaceName={workspace?.name ?? 'Workspace'} role={session.role} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/templates"
          className="flex items-center gap-1 text-body-small text-md-primary hover:underline"
        >
          <MdArrowBack aria-hidden="true" className="h-4.5 w-4.5" />
          Templates
        </Link>

        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-headline-small font-medium text-md-on-surface">{template.name}</h1>
          <div className="flex items-center gap-2">
            {requireRole(session, 'owner') && (
              <Link href={`/templates/${template.id}/edit`}>
                <Button variant="text">
                  <MdEdit aria-hidden="true" className="h-4.5 w-4.5" />
                  Edit template
                </Button>
              </Link>
            )}
            <form action={setTemplateArchivedAction}>
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="archived" value={template.archivedAt ? 'false' : 'true'} />
              <Button type="submit" variant="text">
                {template.archivedAt ? (
                  <MdUnarchive aria-hidden="true" className="h-4.5 w-4.5" />
                ) : (
                  <MdArchive aria-hidden="true" className="h-4.5 w-4.5" />
                )}
                {template.archivedAt ? 'Unarchive' : 'Archive'}
              </Button>
            </form>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-sm bg-md-error-container px-4 py-2 text-body-small text-md-on-error-container"
          >
            <MdError aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
            Error: {error}
          </p>
        )}

        {version ? (
          <Card className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(() => {
                const VersionIcon = VERSION_STATUS_ICON[version.status] ?? MdEditNote;
                return <VersionIcon aria-hidden="true" className="h-5 w-5 text-md-on-surface-variant" />;
              })()}
              <p className="text-body-medium text-md-on-surface">
                Version {version.version} —{' '}
                <span className="font-medium">
                  {version.status === 'draft'
                    ? 'Draft'
                    : version.status === 'active'
                      ? 'Published'
                      : 'Archived'}
                </span>
              </p>
            </div>
            {isDraft ? (
              <form action={publishVersionAction}>
                <input type="hidden" name="templateId" value={template.id} />
                <input type="hidden" name="versionId" value={version.id} />
                <Button type="submit" variant="filled">
                  <MdPublish aria-hidden="true" className="h-4.5 w-4.5" />
                  Publish
                </Button>
              </form>
            ) : (
              <form action={createDraftVersionAction}>
                <input type="hidden" name="templateId" value={template.id} />
                <Button type="submit" variant="outlined">
                  <MdContentCopy aria-hidden="true" className="h-4.5 w-4.5" />
                  Create new draft version
                </Button>
              </form>
            )}
          </Card>
        ) : null}

        <h2 className="mt-8 text-title-medium text-md-on-surface">Requirements</h2>

        {definitions.length === 0 ? (
          <p className="mt-2 text-body-medium text-md-on-surface-variant">No requirements yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {definitions.map((d) => {
              const ActionIcon = ACTION_TYPE_ICON[d.actionType] ?? MdTaskAlt;
              return (
                <li key={d.id}>
                  <Card className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <ActionIcon
                        aria-hidden="true"
                        className="mt-0.5 h-5 w-5 shrink-0 text-md-on-surface-variant"
                      />
                      <div>
                        <p className="text-title-medium text-md-on-surface">
                          {d.title}
                          {!d.required && (
                            <span className="ml-2 text-label-small text-md-on-surface-variant">
                              (optional)
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-body-small text-md-on-surface-variant">
                          {ACTION_TYPE_LABEL[d.actionType]}
                          {d.actionType === 'answer' && d.answerFieldType
                            ? ` · ${d.answerFieldType}`
                            : ''}
                          {d.sensitivity !== 'general' ? ` · ${d.sensitivity.replace('_', ' ')}` : ''}
                        </p>
                      </div>
                    </div>
                    {isDraft && (
                      <Link href={`/templates/${template.id}/requirements/${d.id}/edit`}>
                        <Button variant="text">
                          <MdEdit aria-hidden="true" className="h-4.5 w-4.5" />
                          Edit
                        </Button>
                      </Link>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        {!isDraft && (
          <p className="mt-6 text-body-small text-md-on-surface-variant">
            This version is published and immutable. Create a new draft version to make changes.
          </p>
        )}
      </main>
    </>
  );
}
