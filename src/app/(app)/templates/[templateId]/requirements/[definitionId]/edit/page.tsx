import { notFound, redirect } from 'next/navigation';
import { MdDelete, MdError, MdSave } from 'react-icons/md';
import { getCurrentSession } from '@/db/session';
import { getWorkspaceById } from '@/db/workspace';
import { getRequirementDefinition, getVersion } from '@/lib/domain/template';
import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  updateRequirementDefinitionAction,
  deleteRequirementDefinitionAction,
} from '@/app/(app)/templates/actions';

export default async function EditRequirementDefinitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string; definitionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) return null;

  const { templateId, definitionId } = await params;
  const { error } = await searchParams;

  const definition = await getRequirementDefinition(session.workspaceId, definitionId);
  if (!definition) notFound();

  const version = await getVersion(session.workspaceId, definition.templateVersionId);
  if (!version) notFound();
  if (version.status !== 'draft') redirect(`/templates/${templateId}`);

  const workspace = await getWorkspaceById(session.workspaceId);

  return (
    <>
      <AppHeader workspaceName={workspace?.name ?? 'Workspace'} role={session.role} />
      <main className="mx-auto max-w-md px-6 py-12">
        <Card className="p-8">
          <h1 className="text-title-large font-medium text-md-on-surface">Edit requirement</h1>

          {error && (
            <p
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-sm bg-md-error-container px-4 py-2 text-body-small text-md-on-error-container"
            >
              <MdError aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
              Error: {error}
            </p>
          )}

          <form action={updateRequirementDefinitionAction} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="versionId" value={version.id} />
            <input type="hidden" name="definitionId" value={definition.id} />
            <TextField label="Title" name="title" defaultValue={definition.title} required />
            <TextField
              label="Instructions (optional)"
              name="instructions"
              defaultValue={definition.instructions ?? ''}
            />
            <Select label="Action type" name="actionType" defaultValue={definition.actionType}>
              <option value="upload">Upload</option>
              <option value="answer">Answer</option>
              <option value="acknowledge">Acknowledge</option>
            </Select>
            <Select
              label="Answer type (only used when action type is Answer)"
              name="answerFieldType"
              defaultValue={definition.answerFieldType ?? 'short_text'}
            >
              <option value="short_text">Short text</option>
              <option value="long_text">Long text</option>
              <option value="date">Date</option>
              <option value="choice">Choice</option>
              <option value="yes_no">Yes/No</option>
            </Select>
            <label className="block">
              <span className="mb-1 block text-body-small text-md-on-surface-variant">
                Options (one per line — only used when answer type is Choice)
              </span>
              <textarea
                name="options"
                defaultValue={(definition.options ?? []).join('\n')}
                rows={3}
                className="w-full rounded-t-xs border-b-2 border-md-outline bg-md-surface-container-low px-4 py-3 text-body-large text-md-on-surface outline-none transition-colors duration-(--duration-effects-default) focus:border-md-primary focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2"
              />
            </label>
            <Select label="Sensitivity" name="sensitivity" defaultValue={definition.sensitivity}>
              <option value="general">General</option>
              <option value="routine_business">Routine business</option>
              <option value="tax_identity">Tax / identity</option>
              <option value="banking">Banking</option>
              <option value="high_value_agreement">High-value agreement</option>
            </Select>
            <TextField label="Sequence" name="sequence" type="number" defaultValue={definition.sequence} />
            <TextField
              label="Acceptance criteria (optional)"
              name="acceptanceCriteria"
              defaultValue={definition.acceptanceCriteria ?? ''}
            />
            <label className="flex items-center gap-2 text-body-medium text-md-on-surface">
              <input
                type="checkbox"
                name="required"
                defaultChecked={definition.required}
                className="h-4 w-4 accent-md-primary"
              />
              Required
            </label>
            <Button type="submit" variant="filled" className="mt-2">
              <MdSave aria-hidden="true" className="h-4.5 w-4.5" />
              Save changes
            </Button>
          </form>

          <form action={deleteRequirementDefinitionAction} className="mt-3">
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="versionId" value={version.id} />
            <input type="hidden" name="definitionId" value={definition.id} />
            <Button type="submit" variant="text" fullWidth className="text-md-error">
              <MdDelete aria-hidden="true" className="h-4.5 w-4.5" />
              Delete requirement
            </Button>
          </form>
        </Card>
      </main>
    </>
  );
}
