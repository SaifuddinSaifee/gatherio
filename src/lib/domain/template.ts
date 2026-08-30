import { and, asc, desc, eq, max } from 'drizzle-orm';
import { scoped, type WorkspaceId } from '@/db/scoped';
import * as schema from '@/db/schema';

export interface RequirementDefinitionInput {
  actionType: 'upload' | 'answer' | 'acknowledge';
  answerFieldType: 'short_text' | 'long_text' | 'date' | 'choice' | 'yes_no' | null;
  title: string;
  instructions: string | null;
  required: boolean;
  sequence: number;
  acceptanceCriteria: string | null;
  sensitivity: 'general' | 'routine_business' | 'tax_identity' | 'banking' | 'high_value_agreement';
}

/** Thrown when an action would mutate a published (non-draft) version. Versions are immutable once active — see design decision in plan-1a.md Stage 5. */
export class VersionNotDraftError extends Error {
  constructor() {
    super('This template version is published and immutable. Create a new draft version to make changes.');
  }
}

export async function listTemplates(workspaceId: WorkspaceId) {
  const s = scoped(workspaceId);
  const templates = await s.db
    .select()
    .from(schema.workflowTemplate)
    .where(s.where(schema.workflowTemplate.workspaceId))
    .orderBy(desc(schema.workflowTemplate.createdAt));

  const results = [];
  for (const template of templates) {
    const latest = await getLatestVersion(workspaceId, template.id);
    const requirementCount = latest
      ? (
          await s.db
            .select()
            .from(schema.requirementDefinition)
            .where(eq(schema.requirementDefinition.templateVersionId, latest.id))
        ).length
      : 0;
    results.push({ template, latestVersion: latest, requirementCount });
  }
  return results;
}

export async function createTemplate(workspaceId: WorkspaceId, name: string) {
  const s = scoped(workspaceId);
  return s.db.transaction(async (tx) => {
    const [template] = await tx
      .insert(schema.workflowTemplate)
      .values({ workspaceId, name })
      .returning();
    if (!template) throw new Error('Failed to create template.');

    const [version] = await tx
      .insert(schema.templateVersion)
      .values({ workspaceId, templateId: template.id, version: 1, status: 'draft' })
      .returning();
    if (!version) throw new Error('Failed to create template version.');

    return { template, version };
  });
}

export async function getTemplate(workspaceId: WorkspaceId, templateId: string) {
  const s = scoped(workspaceId);
  const [template] = await s.db
    .select()
    .from(schema.workflowTemplate)
    .where(s.where(schema.workflowTemplate.workspaceId, eq(schema.workflowTemplate.id, templateId)))
    .limit(1);
  return template ?? null;
}

export async function listVersions(workspaceId: WorkspaceId, templateId: string) {
  const s = scoped(workspaceId);
  return s.db
    .select()
    .from(schema.templateVersion)
    .where(
      s.where(schema.templateVersion.workspaceId, eq(schema.templateVersion.templateId, templateId)),
    )
    .orderBy(desc(schema.templateVersion.version));
}

export async function getLatestVersion(workspaceId: WorkspaceId, templateId: string) {
  const versions = await listVersions(workspaceId, templateId);
  return versions[0] ?? null;
}

export async function getVersion(workspaceId: WorkspaceId, versionId: string) {
  const s = scoped(workspaceId);
  const [version] = await s.db
    .select()
    .from(schema.templateVersion)
    .where(s.where(schema.templateVersion.workspaceId, eq(schema.templateVersion.id, versionId)))
    .limit(1);
  return version ?? null;
}

export async function listRequirementDefinitions(workspaceId: WorkspaceId, versionId: string) {
  const s = scoped(workspaceId);
  return s.db
    .select()
    .from(schema.requirementDefinition)
    .where(
      s.where(
        schema.requirementDefinition.workspaceId,
        eq(schema.requirementDefinition.templateVersionId, versionId),
      ),
    )
    .orderBy(asc(schema.requirementDefinition.sequence));
}

/**
 * Publishing is the only draft -> active transition. Published versions
 * are then permanently immutable (enforced by every mutation function
 * below checking status === 'draft') — this is what lets a case
 * reference a version without it shifting under an already-issued link.
 */
export async function publishVersion(workspaceId: WorkspaceId, versionId: string) {
  const s = scoped(workspaceId);
  const version = await getVersion(workspaceId, versionId);
  if (!version) throw new Error('Version not found.');
  if (version.status !== 'draft') throw new VersionNotDraftError();

  const definitions = await listRequirementDefinitions(workspaceId, versionId);
  if (definitions.length === 0) {
    throw new Error('Add at least one requirement before publishing.');
  }

  await s.db
    .update(schema.templateVersion)
    .set({ status: 'active' })
    .where(s.where(schema.templateVersion.workspaceId, eq(schema.templateVersion.id, versionId)));
}

/**
 * Clones the latest version's requirement definitions into a brand-new
 * draft version. This is the explicit, user-triggered path to "editing"
 * a published template — never an implicit auto-clone-on-edit-attempt,
 * because that would leave ambiguous which definition in the clone
 * corresponds to the one the user meant to edit. The new draft gets its
 * own fresh ids and is edited directly, with no such ambiguity.
 */
export async function createDraftFromLatest(workspaceId: WorkspaceId, templateId: string) {
  const s = scoped(workspaceId);
  const latest = await getLatestVersion(workspaceId, templateId);
  if (!latest) throw new Error('Template has no versions.');
  if (latest.status === 'draft') return latest; // already editable

  const definitions = await listRequirementDefinitions(workspaceId, latest.id);

  return s.db.transaction(async (tx) => {
    const [nextVersionRow] = await tx
      .select({ max: max(schema.templateVersion.version) })
      .from(schema.templateVersion)
      .where(eq(schema.templateVersion.templateId, templateId));
    const nextVersion = (nextVersionRow?.max ?? latest.version) + 1;

    const [draft] = await tx
      .insert(schema.templateVersion)
      .values({ workspaceId, templateId, version: nextVersion, status: 'draft' })
      .returning();
    if (!draft) throw new Error('Failed to create draft version.');

    if (definitions.length > 0) {
      await tx.insert(schema.requirementDefinition).values(
        definitions.map((d) => ({
          workspaceId,
          templateVersionId: draft.id,
          actionType: d.actionType,
          answerFieldType: d.answerFieldType,
          title: d.title,
          instructions: d.instructions,
          required: d.required,
          sequence: d.sequence,
          acceptanceCriteria: d.acceptanceCriteria,
          sensitivity: d.sensitivity,
        })),
      );
    }

    return draft;
  });
}

async function assertDraft(workspaceId: WorkspaceId, versionId: string) {
  const version = await getVersion(workspaceId, versionId);
  if (!version) throw new Error('Version not found.');
  if (version.status !== 'draft') throw new VersionNotDraftError();
  return version;
}

export async function addRequirementDefinition(
  workspaceId: WorkspaceId,
  versionId: string,
  input: RequirementDefinitionInput,
) {
  await assertDraft(workspaceId, versionId);
  const s = scoped(workspaceId);
  const [definition] = await s.db
    .insert(schema.requirementDefinition)
    .values({ workspaceId, templateVersionId: versionId, ...input })
    .returning();
  return definition;
}

export async function updateRequirementDefinition(
  workspaceId: WorkspaceId,
  versionId: string,
  definitionId: string,
  input: RequirementDefinitionInput,
) {
  await assertDraft(workspaceId, versionId);
  const s = scoped(workspaceId);
  await s.db
    .update(schema.requirementDefinition)
    .set(input)
    .where(
      s.where(
        schema.requirementDefinition.workspaceId,
        and(
          eq(schema.requirementDefinition.id, definitionId),
          eq(schema.requirementDefinition.templateVersionId, versionId),
        ),
      ),
    );
}

export async function getRequirementDefinition(workspaceId: WorkspaceId, definitionId: string) {
  const s = scoped(workspaceId);
  const [definition] = await s.db
    .select()
    .from(schema.requirementDefinition)
    .where(
      s.where(
        schema.requirementDefinition.workspaceId,
        eq(schema.requirementDefinition.id, definitionId),
      ),
    )
    .limit(1);
  return definition ?? null;
}

export async function deleteRequirementDefinition(
  workspaceId: WorkspaceId,
  versionId: string,
  definitionId: string,
) {
  await assertDraft(workspaceId, versionId);
  const s = scoped(workspaceId);
  await s.db
    .delete(schema.requirementDefinition)
    .where(
      s.where(
        schema.requirementDefinition.workspaceId,
        and(
          eq(schema.requirementDefinition.id, definitionId),
          eq(schema.requirementDefinition.templateVersionId, versionId),
        ),
      ),
    );
}

export async function setTemplateArchived(
  workspaceId: WorkspaceId,
  templateId: string,
  archived: boolean,
) {
  const s = scoped(workspaceId);
  await s.db
    .update(schema.workflowTemplate)
    .set({ archivedAt: archived ? new Date() : null })
    .where(s.where(schema.workflowTemplate.workspaceId, eq(schema.workflowTemplate.id, templateId)));
}
