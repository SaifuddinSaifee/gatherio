import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { scoped, type WorkspaceId } from '@/db/scoped';
import * as schema from '@/db/schema';
import { withAudit } from '@/db/audit';
import { generateAccessToken } from '@/lib/token';
import { getLatestVersion, listRequirementDefinitions } from './template';
import {
  deriveCaseStatus,
  deriveItemState,
  loadCaseStatusInputs,
  type CompletedKind,
  type ItemState,
  type ReviewDecision,
} from './case-status';
import { loadAssignmentHistory, type HistoryEntry } from './submission-history';

const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
          options: d.options,
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
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
    const [tokenRow] = await tx
      .insert(schema.accessToken)
      .values({
        workspaceId,
        caseId: caseRow.id,
        partyId: party.id,
        tokenHash,
        authLevel: 'link',
        expiresAt,
      })
      .returning();
    if (!tokenRow) throw new Error('Failed to issue access token.');

    await withAudit(tx, {
      workspaceId,
      caseId: caseRow.id,
      actorType: 'user',
      actorId: userId,
      eventType: 'access_token.issued',
      objectType: 'access_token',
      objectId: tokenRow.id,
      metadata: { expiresAt: expiresAt.toISOString(), reason: 'case_created' },
    });

    return { case: caseRow, party, expiresAt };
  });

  return { ...result, token };
}

/**
 * Stage 7: `submittedRequirements` (a fulfilment-only count) is replaced
 * by the derived case status and its counts — "submitted" stopped being
 * the interesting fact once review exists; "accepted" is. The status
 * inputs are loaded for every case in this workspace in one batched
 * `loadCaseStatusInputs` call (three queries total, not three per case),
 * then grouped in memory — the template-name/party lookups below stay
 * N+1 per case, the existing accepted precedent in this function.
 */
export async function listCases(workspaceId: WorkspaceId) {
  const s = scoped(workspaceId);
  const cases = await s.db
    .select()
    .from(schema.caseTable)
    .where(s.where(schema.caseTable.workspaceId))
    .orderBy(desc(schema.caseTable.createdAt));

  const statusInputs = await loadCaseStatusInputs(
    s.db,
    workspaceId,
    cases.map((c) => c.id),
  );
  const inputsByCase = new Map<string, typeof statusInputs>();
  for (const item of statusInputs) {
    const list = inputsByCase.get(item.caseId);
    if (list) list.push(item);
    else inputsByCase.set(item.caseId, [item]);
  }

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

    const items = inputsByCase.get(caseRow.id) ?? [];
    const { status, counts } = deriveCaseStatus(
      items.map((i) => ({
        required: i.required,
        state: deriveItemState({
          fulfilmentStatus: i.fulfilmentStatus,
          latestKind: i.latestKind,
          latestReviewStatus: i.latestReviewStatus,
        }),
      })),
    );

    results.push({
      case: caseRow,
      templateName: templateInfo?.templateName ?? 'Unknown template',
      party: party ?? null,
      totalRequirements: items.length,
      status,
      counts,
    });
  }
  return results;
}

export interface CaseRequirementItem {
  requirement: typeof schema.requirement.$inferSelect;
  assignment: typeof schema.assignment.$inferSelect | null;
  history: HistoryEntry[];
  state: ItemState;
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

  const requirementRows = await s.db
    .select({
      requirement: schema.requirement,
      assignment: schema.assignment,
    })
    .from(schema.requirement)
    .leftJoin(schema.assignment, eq(schema.assignment.requirementId, schema.requirement.id))
    .where(eq(schema.requirement.caseId, caseId))
    .orderBy(asc(schema.requirement.sequence));

  // Stage 7: each item gets its full completed-version history (for the
  // "Earlier versions" disclosure) and a derived state — computed here,
  // per assignment, rather than via case-status.ts's batched
  // loadCaseStatusInputs, since loadAssignmentHistory's result already
  // gives us everything deriveItemState needs and the requester's case
  // page wants the history anyway; a second, different query for the
  // same "latest kind/review" fact would be pure waste on a page that
  // only ever loads one case.
  const requirements: CaseRequirementItem[] = [];
  const statusItems: { required: boolean; state: ItemState }[] = [];

  for (const row of requirementRows) {
    let history: HistoryEntry[] = [];
    let state: ItemState = 'awaiting_recipient';

    if (row.assignment) {
      history = await loadAssignmentHistory(s.db, workspaceId, row.assignment.id);
      const latest = history[0] ?? null;
      const latestKind: CompletedKind | null = latest
        ? (latest.fileAsset ? 'file' : (latest.answer?.fieldType ?? null))
        : null;
      state = deriveItemState({
        fulfilmentStatus: row.assignment.fulfilmentStatus,
        latestKind,
        latestReviewStatus: (latest?.latestReview?.reviewStatus as ReviewDecision | undefined) ?? null,
      });
    }

    requirements.push({ ...row, history, state });
    statusItems.push({ required: row.requirement.required, state });
  }

  const { status, counts } = deriveCaseStatus(statusItems);

  return {
    case: caseRow,
    templateName: templateInfo?.templateName ?? 'Unknown template',
    templateVersionNumber: templateInfo?.version ?? null,
    party: party ?? null,
    requirements,
    status,
    counts,
  };
}

export type IssueAccessMode = 'resend' | 'reissue';

export interface IssuedAccess {
  token: string;
  expiresAt: Date;
  party: typeof schema.party.$inferSelect;
  caseRow: typeof schema.caseTable.$inferSelect;
}

/**
 * Mints a fresh access token for an existing case's recipient. `resend`
 * leaves every existing live token alone — the client just lost the
 * email, the old link should keep working. `reissue` revokes every live
 * token first — the link was forwarded to the wrong person, so the old
 * one must stop working. Splitting the two matters: if resend always
 * revoked, a requester helpfully resending would kick a recipient out
 * mid-upload.
 */
export async function issueCaseAccess(
  workspaceId: WorkspaceId,
  userId: string,
  caseId: string,
  mode: IssueAccessMode,
): Promise<IssuedAccess> {
  const s = scoped(workspaceId);
  const { token, tokenHash } = generateAccessToken();
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);

  const result = await s.db.transaction(async (tx) => {
    const [caseRow] = await tx
      .select()
      .from(schema.caseTable)
      .where(s.where(schema.caseTable.workspaceId, eq(schema.caseTable.id, caseId)))
      .limit(1);
    if (!caseRow) throw new Error('Case not found.');

    const [partyRow] = await tx
      .select()
      .from(schema.party)
      .where(eq(schema.party.caseId, caseId))
      .orderBy(asc(schema.party.createdAt))
      .limit(1);
    if (!partyRow) throw new Error('This case has no recipient.');
    if (!partyRow.email) throw new Error('This recipient has no email address on file.');

    if (mode === 'reissue') {
      const liveTokens = await tx
        .select({ id: schema.accessToken.id })
        .from(schema.accessToken)
        .where(and(eq(schema.accessToken.caseId, caseId), isNull(schema.accessToken.revokedAt)));

      if (liveTokens.length > 0) {
        await tx
          .update(schema.accessToken)
          .set({ revokedAt: new Date() })
          .where(and(eq(schema.accessToken.caseId, caseId), isNull(schema.accessToken.revokedAt)));

        for (const liveToken of liveTokens) {
          await withAudit(tx, {
            workspaceId,
            caseId,
            actorType: 'user',
            actorId: userId,
            eventType: 'access_token.revoked',
            objectType: 'access_token',
            objectId: liveToken.id,
            metadata: { reason: 'reissue' },
          });
        }
      }
    }

    const [tokenRow] = await tx
      .insert(schema.accessToken)
      .values({ workspaceId, caseId, partyId: partyRow.id, tokenHash, authLevel: 'link', expiresAt })
      .returning();
    if (!tokenRow) throw new Error('Failed to issue access token.');

    await withAudit(tx, {
      workspaceId,
      caseId,
      actorType: 'user',
      actorId: userId,
      eventType: 'access_token.issued',
      objectType: 'access_token',
      objectId: tokenRow.id,
      metadata: { expiresAt: expiresAt.toISOString(), reason: mode },
    });

    return { caseRow, party: partyRow };
  });

  return { token, expiresAt, party: result.party, caseRow: result.caseRow };
}

/**
 * A standalone audit write — there is no larger business transaction to
 * ride along with here, since it records the outcome of a network call
 * (sendCaseInvite) that must happen outside any transaction.
 */
export async function recordInviteSent(
  workspaceId: WorkspaceId,
  caseId: string,
  userId: string,
  outcome: { recipient: string; providerMessageId?: string },
): Promise<void> {
  const s = scoped(workspaceId);
  await s.db.transaction(async (tx) => {
    await withAudit(tx, {
      workspaceId,
      caseId,
      actorType: 'user',
      actorId: userId,
      eventType: 'case.invite_sent',
      objectType: 'case',
      objectId: caseId,
      metadata: {
        channel: 'email',
        recipient: outcome.recipient,
        providerMessageId: outcome.providerMessageId ?? null,
        templateRef: 'case_invite',
      },
    });
  });
}
