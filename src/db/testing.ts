import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './client';
import * as schema from './schema';
import { asWorkspaceId, type WorkspaceId } from './scoped';
import { instantiateCase, type PartyInput } from '@/lib/domain/case';
import type { RequirementDefinitionInput } from '@/lib/domain/template';

/**
 * Fixture helpers for integration tests that hit the real docker-compose
 * Postgres (src/db/**, so it inherits the tenant-isolation ESLint
 * carve-out for the raw `db` handle, matching the existing seed.ts /
 * reset.ts precedent — no new carve-out needed).
 *
 * There is no DB reset between test runs (vitest.setup.ts only sets env
 * defaults), so every function here creates a brand-new, uniquely-named
 * workspace/user/case rather than reusing shared state. A test that
 * asserted on a workspace-wide or table-wide count would be flaky by
 * construction on a shared, never-reset database — returning fresh rows
 * every call is what keeps assertions scoped to rows the test itself
 * created.
 */

const DEFAULT_REQUIREMENTS: RequirementDefinitionInput[] = [
  {
    actionType: 'upload',
    answerFieldType: null,
    title: 'Bank statement',
    instructions: null,
    required: true,
    sequence: 0,
    acceptanceCriteria: null,
    sensitivity: 'general',
    options: null,
  },
  {
    actionType: 'answer',
    answerFieldType: 'yes_no',
    title: 'Any new loans this month?',
    instructions: null,
    required: true,
    sequence: 1,
    acceptanceCriteria: null,
    sensitivity: 'general',
    options: null,
  },
];

function uniqueSuffix(): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export interface FixtureWorkspace {
  workspaceId: WorkspaceId;
  userId: string;
}

/** A fresh workspace with one owner member. Nothing else. */
export async function seedFixtureWorkspace(): Promise<FixtureWorkspace> {
  const suffix = uniqueSuffix();

  const [user] = await db
    .insert(schema.user)
    .values({
      id: randomUUID(),
      name: 'Fixture User',
      email: `fixture-${suffix}@example.com`,
      emailVerified: true,
    })
    .returning();
  if (!user) throw new Error('Failed to seed fixture user.');

  const [workspaceRow] = await db
    .insert(schema.workspace)
    .values({ name: `Fixture Workspace ${suffix}` })
    .returning();
  if (!workspaceRow) throw new Error('Failed to seed fixture workspace.');
  const workspaceId = asWorkspaceId(workspaceRow.id);

  await db.insert(schema.workspaceMember).values({ workspaceId, userId: user.id, role: 'owner' });

  return { workspaceId, userId: user.id };
}

export interface FixtureCase {
  caseId: string;
  partyId: string;
  token: string;
  accessTokenId: string;
  requirementIds: string[];
}

/**
 * A published template plus an instantiated case in an already-existing
 * workspace — deliberately routed through the real instantiateCase
 * domain function rather than hand-inserting rows, so the fixture stays
 * true to the actual write path (access_token issuance, requirement
 * snapshotting) instead of drifting from it over time.
 */
export async function seedFixtureCase(
  workspace: FixtureWorkspace,
  options: { requirements?: RequirementDefinitionInput[]; party?: Partial<PartyInput> } = {},
): Promise<FixtureCase> {
  const suffix = uniqueSuffix();
  const { workspaceId, userId } = workspace;

  const [template] = await db
    .insert(schema.workflowTemplate)
    .values({ workspaceId, name: `Fixture Template ${suffix}` })
    .returning();
  if (!template) throw new Error('Failed to seed fixture template.');

  const [version] = await db
    .insert(schema.templateVersion)
    .values({ workspaceId, templateId: template.id, version: 1, status: 'active' })
    .returning();
  if (!version) throw new Error('Failed to seed fixture template version.');

  const requirementInputs = options.requirements ?? DEFAULT_REQUIREMENTS;
  await db
    .insert(schema.requirementDefinition)
    .values(requirementInputs.map((r) => ({ workspaceId, templateVersionId: version.id, ...r })));

  const partyInput: PartyInput = {
    partyType: 'individual',
    displayName: 'Fixture Recipient',
    email: `recipient-${suffix}@example.com`,
    phone: null,
    organizationName: null,
    ...options.party,
  };

  const { case: caseRow, party, token } = await instantiateCase(workspaceId, userId, {
    templateId: template.id,
    name: `Fixture Case ${suffix}`,
    dueAt: null,
    party: partyInput,
  });

  const [accessTokenRow] = await db
    .select({ id: schema.accessToken.id })
    .from(schema.accessToken)
    .where(eq(schema.accessToken.caseId, caseRow.id))
    .limit(1);
  if (!accessTokenRow) throw new Error('Failed to find fixture access token.');

  const requirementRows = await db
    .select({ id: schema.requirement.id })
    .from(schema.requirement)
    .where(eq(schema.requirement.caseId, caseRow.id));

  return {
    caseId: caseRow.id,
    partyId: party.id,
    token,
    accessTokenId: accessTokenRow.id,
    requirementIds: requirementRows.map((r) => r.id),
  };
}

export interface FixtureFileAsset {
  submissionVersionId: string;
  fileAssetId: string;
}

/**
 * Inserts a submission_version + file_asset directly, bypassing the
 * submission.ts domain layer (not built until later in Stage 6) — for
 * tests that only need a file_asset row in a given scan-status state,
 * such as presignFileDownload's scan gate.
 */
export async function seedFixtureFileAsset(
  fixtureCase: Pick<FixtureCase, 'requirementIds' | 'partyId'>,
  overrides: {
    malwareScanStatus?: 'pending' | 'quarantined' | 'clean' | 'infected' | 'scan_failed';
  } = {},
): Promise<FixtureFileAsset> {
  const requirementId = fixtureCase.requirementIds[0];
  if (!requirementId) throw new Error('Fixture case has no requirements.');

  const [assignmentRow] = await db
    .select({ id: schema.assignment.id, workspaceId: schema.assignment.workspaceId })
    .from(schema.assignment)
    .where(eq(schema.assignment.requirementId, requirementId))
    .limit(1);
  if (!assignmentRow) throw new Error('Fixture assignment not found.');

  const [submissionVersion] = await db
    .insert(schema.submissionVersion)
    .values({
      workspaceId: assignmentRow.workspaceId,
      assignmentId: assignmentRow.id,
      versionNumber: 1,
      submittedByPartyId: fixtureCase.partyId,
    })
    .returning();
  if (!submissionVersion) throw new Error('Failed to seed fixture submission version.');

  const [fileAsset] = await db
    .insert(schema.fileAsset)
    .values({
      workspaceId: assignmentRow.workspaceId,
      submissionVersionId: submissionVersion.id,
      storageKey: `test/${randomUUID()}`,
      originalFilename: 'test.pdf',
      mimeType: 'application/pdf',
      byteSize: 1234,
      sha256Hash: 'a'.repeat(64),
      malwareScanStatus: overrides.malwareScanStatus ?? 'clean',
    })
    .returning();
  if (!fileAsset) throw new Error('Failed to seed fixture file asset.');

  return { submissionVersionId: submissionVersion.id, fileAssetId: fileAsset.id };
}

export interface RecipientFixture extends FixtureWorkspace, FixtureCase {}

/** The common case: one fresh workspace, one fresh case in it. */
export async function seedRecipientFixture(
  options: { requirements?: RequirementDefinitionInput[]; party?: Partial<PartyInput> } = {},
): Promise<RecipientFixture> {
  const workspace = await seedFixtureWorkspace();
  const fixtureCase = await seedFixtureCase(workspace, options);
  return { ...workspace, ...fixtureCase };
}
