import { asc, desc, eq } from 'drizzle-orm';
import { scoped, type WorkspaceId } from '@/db/scoped';
import * as schema from '@/db/schema';
import { generateAccessToken } from '@/lib/token';
import { getLatestVersion, listRequirementDefinitions } from './template';

export interface PartyInput {
  partyType: 'individual' | 'organization';
  displayName: string;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
}

export interface InstantiateCaseInput {
  templateId: string;
  name: string;
  dueAt: Date | null;
  party: PartyInput;
}

/**
 * Phase 1a ships single-party assignment only (product.md Phase 1a list) —
 * exactly one party is created per case, even though the schema already
 * supports many (assignment joins requirement x party independently so
 * multi-party is a Phase 1b UI change, not a schema change).
 */
export async function instantiateCase(
  workspaceId: WorkspaceId,
  userId: string,
  input: InstantiateCaseInput,
) {
  const version = await getLatestVersion(workspaceId, input.templateId);
  if (!version || version.status !== 'active') {
    throw new Error('Only a published template version can be used to create a case.');
  }

  const definitions = await listRequirementDefinitions(workspaceId, version.id);
  if (definitions.length === 0) {
    throw new Error('This template has no requirements.');
  }

  const s = scoped(workspaceId);
  const { token, tokenHash } = generateAccessToken();

  const result = await s.db.transaction(async (tx) => {
    const [caseRow] = await tx
      .insert(schema.caseTable)
      .values({
        workspaceId,
        templateVersionId: version.id,
        name: input.name,
        dueAt: input.dueAt,
        createdBy: userId,
      })
      .returning();
    if (!caseRow) throw new Error('Failed to create case.');

    const [party] = await tx
      .insert(schema.party)
      .values({ workspaceId, caseId: caseRow.id, ...input.party })
      .returning();
    if (!party) throw new Error('Failed to create party.');

    const requirements = await tx
      .insert(schema.requirement)
      .values(
        definitions.map((d) => ({
          workspaceId,
          caseId: caseRow.id,
          actionType: d.actionType,
          answerFieldType: d.answerFieldType,
          title: d.title,
          instructions: d.instructions,
          required: d.required,
          sequence: d.sequence,
          acceptanceCriteria: d.acceptanceCriteria,
          sensitivity: d.sensitivity,
        })),
      )
      .returning();

    await tx.insert(schema.assignment).values(
      requirements.map((r) => ({
        workspaceId,
        requirementId: r.id,
        partyId: party.id,
      })),
    );

    // Phase 1a always issues the lowest tier of the §4.7 auth ladder —
    // step-up (banking/high-value) is a policy lookup deferred to when
    // those requirement types actually ship.
    await tx.insert(schema.accessToken).values({
      workspaceId,
      caseId: caseRow.id,
      partyId: party.id,
      tokenHash,
      authLevel: 'link',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return { case: caseRow, party };
  });

  return { ...result, token };
}

export async function listCases(workspaceId: WorkspaceId) {
  const s = scoped(workspaceId);
  const cases = await s.db
    .select()
    .from(schema.caseTable)
    .where(s.where(schema.caseTable.workspaceId))
    .orderBy(desc(schema.caseTable.createdAt));

  const results = [];
  for (const caseRow of cases) {
    const [templateInfo] = await s.db
      .select({ templateName: schema.workflowTemplate.name })
      .from(schema.templateVersion)
      .innerJoin(
        schema.workflowTemplate,
        eq(schema.templateVersion.templateId, schema.workflowTemplate.id),
      )
      .where(eq(schema.templateVersion.id, caseRow.templateVersionId))
      .limit(1);

    const [party] = await s.db
      .select()
      .from(schema.party)
      .where(eq(schema.party.caseId, caseRow.id))
      .orderBy(asc(schema.party.createdAt))
      .limit(1);

    const assignments = await s.db
      .select({ fulfilmentStatus: schema.assignment.fulfilmentStatus })
      .from(schema.assignment)
      .innerJoin(schema.requirement, eq(schema.assignment.requirementId, schema.requirement.id))
      .where(eq(schema.requirement.caseId, caseRow.id));

    const submitted = assignments.filter((a) => a.fulfilmentStatus === 'submitted').length;

    results.push({
      case: caseRow,
      templateName: templateInfo?.templateName ?? 'Unknown template',
      party: party ?? null,
      totalRequirements: assignments.length,
      submittedRequirements: submitted,
    });
  }
  return results;
}

export async function getCaseDetail(workspaceId: WorkspaceId, caseId: string) {
  const s = scoped(workspaceId);
  const [caseRow] = await s.db
    .select()
    .from(schema.caseTable)
    .where(s.where(schema.caseTable.workspaceId, eq(schema.caseTable.id, caseId)))
    .limit(1);
  if (!caseRow) return null;

  const [templateInfo] = await s.db
    .select({ templateName: schema.workflowTemplate.name, version: schema.templateVersion.version })
    .from(schema.templateVersion)
    .innerJoin(
      schema.workflowTemplate,
      eq(schema.templateVersion.templateId, schema.workflowTemplate.id),
    )
    .where(eq(schema.templateVersion.id, caseRow.templateVersionId))
    .limit(1);

  const [party] = await s.db
    .select()
    .from(schema.party)
    .where(eq(schema.party.caseId, caseId))
    .orderBy(asc(schema.party.createdAt))
    .limit(1);

  const requirements = await s.db
    .select({
      requirement: schema.requirement,
      assignment: schema.assignment,
    })
    .from(schema.requirement)
    .leftJoin(schema.assignment, eq(schema.assignment.requirementId, schema.requirement.id))
    .where(eq(schema.requirement.caseId, caseId))
    .orderBy(asc(schema.requirement.sequence));

  return {
    case: caseRow,
    templateName: templateInfo?.templateName ?? 'Unknown template',
    templateVersionNumber: templateInfo?.version ?? null,
    party: party ?? null,
    requirements,
  };
}
