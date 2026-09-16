import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MdLock } from 'react-icons/md';
import { getCurrentSession, requireRole } from '@/db/session';
import { getTemplate, getLatestVersion, listRequirementDefinitions } from '@/lib/domain/template';
import { Button } from '@/components/ui/button';
import { EditTemplateForm, type InitialRequirement } from './edit-template-form';

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  const { templateId } = await params;
  const template = await getTemplate(session.workspaceId, templateId);
  if (!template) notFound();

  if (!requireRole(session, 'owner')) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-12">
        <p
          role="alert"
          className="flex items-center gap-2 rounded-sm bg-md-error-container px-4 py-3 text-body-medium text-md-on-error-container"
        >
          <MdLock aria-hidden="true" className="h-5 w-5 shrink-0" />
          You do not have the permission to edit this template, please contact your workspace admin
          or owner.
        </p>
      </main>
    );
  }

  const version = await getLatestVersion(session.workspaceId, templateId);
  if (!version) notFound();

  if (version.status !== 'draft') {
    return (
      <main className="mx-auto max-w-7xl px-6 py-12">
        <p className="text-body-medium text-md-on-surface-variant">
          This version is published and immutable. Create a new draft version from the template page
          to make edits.
        </p>
        <Link href={`/templates/${template.id}`} className="mt-4 inline-block">
          <Button variant="outlined">Back to template</Button>
        </Link>
      </main>
    );
  }

  const definitions = await listRequirementDefinitions(session.workspaceId, version.id);

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <h1 className="text-headline-small font-medium text-md-on-surface">Edit template</h1>
      <p className="mt-1 text-body-medium text-md-on-surface-variant">
        Update the template name and its requirements.
      </p>

      <div className="mt-6">
        <EditTemplateForm
          templateId={template.id}
          versionId={version.id}
          name={template.name}
          requirements={definitions.map((d): InitialRequirement => ({
            title: d.title,
            instructions: d.instructions ?? '',
            actionType: d.actionType as InitialRequirement['actionType'],
            answerFieldType: d.answerFieldType ?? 'short_text',
            required: d.required,
            acceptanceCriteria: d.acceptanceCriteria ?? '',
            sensitivity: d.sensitivity,
            options: d.options,
          }))}
        />
      </div>
    </main>
  );
}
