import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { scoped } from '@/db/scoped';
import * as schema from '@/db/schema';
import { seedFixtureCase, seedFixtureWorkspace } from '@/db/testing';
import { markCaseViewed, recordAnswerSubmission } from '../submission';
import { recordInviteDelivery } from '../reminder';
import { sortForDashboard } from '../dashboard';
import { listCases, type DashboardCase } from '../case';

let seq = 0;

function dashboardCase(overrides: Partial<DashboardCase> = {}): DashboardCase {
  seq += 1;
  const createdAt = overrides.case?.createdAt ?? new Date(2026, 0, seq);
  return {
    case: {
      id: randomUUID(),
      workspaceId: randomUUID(),
      templateVersionId: randomUUID(),
      name: `Case ${seq}`,
      dueAt: null,
      createdBy: randomUUID(),
      completedAt: null,
      createdAt,
    },
    templateName: 'Template',
    party: null,
    totalRequirements: 2,
    status: 'awaiting_recipient',
    counts: { accepted: 0, needsReview: 0, changesRequested: 0, awaitingRecipient: 2, required: 2 },
    blockingItems: [],
    lastRecipientActivity: null,
    lastContact: null,
    lastReminderAt: null,
    reminder: { ok: true },
    ...overrides,
  };
}

describe('sortForDashboard', () => {
  it('puts needs_review before awaiting_recipient before complete', () => {
    const rows = [
      dashboardCase({ status: 'complete' }),
      dashboardCase({ status: 'awaiting_recipient' }),
      dashboardCase({ status: 'needs_review' }),
    ];
    expect(sortForDashboard(rows).map((r) => r.status)).toEqual([
      'needs_review',
      'awaiting_recipient',
      'complete',
    ]);
  });

  it('within needs_review, orders by oldest recipient activity first', () => {
    const older = dashboardCase({
      status: 'needs_review',
      case: { ...dashboardCase().case, name: 'Older' },
      lastRecipientActivity: { eventType: 'assignment.submitted', occurredAt: new Date('2026-01-01') },
    });
    const newer = dashboardCase({
      status: 'needs_review',
      case: { ...dashboardCase().case, name: 'Newer' },
      lastRecipientActivity: { eventType: 'assignment.submitted', occurredAt: new Date('2026-02-01') },
    });
    expect(sortForDashboard([newer, older]).map((r) => r.case.name)).toEqual(['Older', 'Newer']);
  });

  it('within awaiting_recipient, never-contacted cases sort before contacted ones', () => {
    const contacted = dashboardCase({
      status: 'awaiting_recipient',
      case: { ...dashboardCase().case, name: 'Contacted' },
      lastContact: { createdAt: new Date('2026-01-01'), status: 'sent', templateRef: 'case_invite' },
    });
    const neverContacted = dashboardCase({
      status: 'awaiting_recipient',
      case: { ...dashboardCase().case, name: 'Never contacted' },
      lastContact: null,
    });
    expect(sortForDashboard([contacted, neverContacted]).map((r) => r.case.name)).toEqual([
      'Never contacted',
      'Contacted',
    ]);
  });

  it('within awaiting_recipient, orders contacted cases by oldest contact first', () => {
    const contactedRecently = dashboardCase({
      status: 'awaiting_recipient',
      case: { ...dashboardCase().case, name: 'Recent' },
      lastContact: { createdAt: new Date('2026-02-01'), status: 'sent', templateRef: 'case_reminder_stalled' },
    });
    const contactedLongAgo = dashboardCase({
      status: 'awaiting_recipient',
      case: { ...dashboardCase().case, name: 'Long ago' },
      lastContact: { createdAt: new Date('2026-01-01'), status: 'sent', templateRef: 'case_invite' },
    });
    expect(sortForDashboard([contactedRecently, contactedLongAgo]).map((r) => r.case.name)).toEqual([
      'Long ago',
      'Recent',
    ]);
  });

  it('within complete, orders by most recently completed first', () => {
    const completedFirst = dashboardCase({
      status: 'complete',
      case: { ...dashboardCase().case, name: 'First', completedAt: new Date('2026-01-01') },
    });
    const completedLater = dashboardCase({
      status: 'complete',
      case: { ...dashboardCase().case, name: 'Later', completedAt: new Date('2026-02-01') },
    });
    expect(sortForDashboard([completedFirst, completedLater]).map((r) => r.case.name)).toEqual([
      'Later',
      'First',
    ]);
  });

  it('does not mutate the input array', () => {
    const rows = [dashboardCase({ status: 'complete' }), dashboardCase({ status: 'needs_review' })];
    const original = [...rows];
    sortForDashboard(rows);
    expect(rows).toEqual(original);
  });
});

describe('listCases — dashboard fields (integration)', () => {
  it('fills blockingItems, lastRecipientActivity, lastContact, and reminder eligibility per case', async () => {
    const workspace = await seedFixtureWorkspace();

    const untouched = await seedFixtureCase(workspace);
    await markCaseViewed(workspace.workspaceId, { partyId: untouched.partyId, caseId: untouched.caseId });
    await recordInviteDelivery(workspace.workspaceId, untouched.caseId, workspace.userId, {
      partyId: untouched.partyId,
      recipient: 'recipient@example.com',
      sent: true,
      providerMessageId: 'invite-untouched',
    });

    const reviewed = await seedFixtureCase(workspace, {
      requirements: [
        {
          actionType: 'answer',
          answerFieldType: 'yes_no',
          title: 'Any new loans?',
          instructions: null,
          required: true,
          sequence: 0,
          acceptanceCriteria: null,
          sensitivity: 'general',
          options: null,
        },
      ],
    });
    const s = scoped(workspace.workspaceId);
    const [assignment] = await s.db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.requirementId, reviewed.requirementIds[0]!));
    await recordAnswerSubmission(workspace.workspaceId, {
      partyId: reviewed.partyId,
      caseId: reviewed.caseId,
      assignmentId: assignment!.id,
      actionType: 'answer',
      value: { fieldType: 'yes_no', yes: true },
    });

    const rows = await listCases(workspace.workspaceId);
    const untouchedRow = rows.find((r) => r.case.id === untouched.caseId)!;
    const reviewedRow = rows.find((r) => r.case.id === reviewed.caseId)!;

    expect(untouchedRow.status).toBe('awaiting_recipient');
    expect(untouchedRow.blockingItems.map((i) => i.title)).toEqual([
      'Bank statement',
      'Any new loans this month?',
    ]);
    expect(untouchedRow.lastRecipientActivity?.eventType).toBe('case.viewed');
    expect(untouchedRow.lastContact?.templateRef).toBe('case_invite');
    expect(untouchedRow.reminder).toEqual({ ok: true });

    expect(reviewedRow.status).toBe('needs_review');
    expect(reviewedRow.blockingItems).toEqual([]); // needs_review items aren't "outstanding" — they're the requester's move
    expect(reviewedRow.reminder).toEqual({ ok: false, reason: 'nothing_outstanding' });
  });
});
