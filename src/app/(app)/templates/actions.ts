'use server';

import { redirect } from 'next/navigation';
import { getCurrentSession, requireRole } from '@/db/session';
import * as templates from '@/lib/domain/template';
import type { RequirementDefinitionInput } from '@/lib/domain/template';

async function requireSession() {
  const session = await getCurrentSession();
  if (!session) redirect('/sign-in');
  return session;
}

export interface CreateTemplateInput {
  name: string;
  requirements: RequirementDefinitionInput[];
}

/**
 * Called directly from the new-template client component (not bound to a
 * <form action>), since that form is a JS-driven multi-row builder with no
 * FormData to submit. Returns an error string instead of redirecting on
 * failure, so the client keeps the requester's in-progress rows on screen
 * instead of losing them to a full-page redirect — a real UX improvement
 * over the old ?error= query-param pattern, made possible because this
 * page needs client JS anyway.
 */
export async function createTemplateWithRequirementsAction(
  input: CreateTemplateInput,
): Promise<{ templateId: string } | { error: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  const name = input.name.trim();
  if (!name) return { error: 'Template name is required.' };

  const requirements = input.requirements.map((r) => ({ ...r, title: r.title.trim() }));
  if (requirements.length === 0) return { error: 'Add at least one requirement.' };
  const missingTitleIndex = requirements.findIndex((r) => !r.title);
  if (missingTitleIndex !== -1) {
    return { error: `Requirement ${missingTitleIndex + 1} needs a title.` };
  }

  try {
    const { template } = await templates.createTemplateWithRequirements(
      session.workspaceId,
      name,
      requirements,
    );
    return { templateId: template.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not create template.' };
  }
}

export async function setTemplateArchivedAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const templateId = String(formData.get('templateId') ?? '');
  if (!requireRole(session, 'owner')) {
    redirect(`/templates/${templateId}?error=Only+the+workspace+owner+can+archive+templates`);
  }
  const archived = formData.get('archived') === 'true';
  await templates.setTemplateArchived(session.workspaceId, templateId, archived);
  redirect(`/templates/${templateId}`);
}

export async function publishVersionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const templateId = String(formData.get('templateId') ?? '');
  const versionId = String(formData.get('versionId') ?? '');
  if (!requireRole(session, 'owner')) {
    redirect(`/templates/${templateId}?error=Only+the+workspace+owner+can+publish+a+version`);
  }
  try {
    await templates.publishVersion(session.workspaceId, versionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not publish this version.';
    redirect(`/templates/${templateId}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/templates/${templateId}`);
}

export async function createDraftVersionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const templateId = String(formData.get('templateId') ?? '');
  await templates.createDraftFromLatest(session.workspaceId, templateId);
  redirect(`/templates/${templateId}`);
}

function readDefinitionInput(formData: FormData): RequirementDefinitionInput {
  const actionType = String(formData.get('actionType') ?? 'upload') as RequirementDefinitionInput['actionType'];
  const rawAnswerFieldType = String(formData.get('answerFieldType') ?? '');
  return {
    actionType,
    answerFieldType:
      actionType === 'answer'
        ? (rawAnswerFieldType as RequirementDefinitionInput['answerFieldType']) || 'short_text'
        : null,
    title: String(formData.get('title') ?? '').trim(),
    instructions: String(formData.get('instructions') ?? '').trim() || null,
    required: formData.get('required') === 'on',
    sequence: Number(formData.get('sequence') ?? 0) || 0,
    acceptanceCriteria: String(formData.get('acceptanceCriteria') ?? '').trim() || null,
    sensitivity: String(
      formData.get('sensitivity') ?? 'general',
    ) as RequirementDefinitionInput['sensitivity'],
  };
}

export async function addRequirementDefinitionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const templateId = String(formData.get('templateId') ?? '');
  const versionId = String(formData.get('versionId') ?? '');
  const input = readDefinitionInput(formData);

  if (!input.title) redirect(`/templates/${templateId}?error=Title+is+required`);

  try {
    await templates.addRequirementDefinition(session.workspaceId, versionId, input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not add requirement.';
    redirect(`/templates/${templateId}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/templates/${templateId}`);
}

export async function updateRequirementDefinitionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const templateId = String(formData.get('templateId') ?? '');
  const versionId = String(formData.get('versionId') ?? '');
  const definitionId = String(formData.get('definitionId') ?? '');
  const input = readDefinitionInput(formData);

  try {
    await templates.updateRequirementDefinition(session.workspaceId, versionId, definitionId, input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update requirement.';
    redirect(
      `/templates/${templateId}/requirements/${definitionId}/edit?error=${encodeURIComponent(message)}`,
    );
  }
  redirect(`/templates/${templateId}`);
}

export async function deleteRequirementDefinitionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const templateId = String(formData.get('templateId') ?? '');
  const versionId = String(formData.get('versionId') ?? '');
  const definitionId = String(formData.get('definitionId') ?? '');

  try {
    await templates.deleteRequirementDefinition(session.workspaceId, versionId, definitionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not delete requirement.';
    redirect(`/templates/${templateId}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/templates/${templateId}`);
}
