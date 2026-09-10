import { describe, expect, it } from 'vitest';
import { seedFixtureCase, seedFixtureFileAsset, seedRecipientFixture } from '@/db/testing';
import { getRecipientView } from '../recipient-view';

describe('getRecipientView', () => {
  it('returns the case, party, and one item per requirement, ordered by sequence', async () => {
    const fixture = await seedRecipientFixture();

    const view = await getRecipientView({
      accessTokenId: fixture.accessTokenId,
      workspaceId: fixture.workspaceId,
      caseId: fixture.caseId,
      partyId: fixture.partyId,
    });

    expect(view).not.toBeNull();
    expect(view?.case.id).toBe(fixture.caseId);
    expect(view?.party.id).toBe(fixture.partyId);
    expect(view?.items).toHaveLength(2);
    expect(view?.items.map((i) => i.requirement.sequence)).toEqual([0, 1]);
    expect(view?.items[0]?.requirement.actionType).toBe('upload');
    expect(view?.items[1]?.requirement.actionType).toBe('answer');
  });

  it('reports no submission and no review for a freshly instantiated case', async () => {
    const fixture = await seedRecipientFixture();
    const view = await getRecipientView({
      accessTokenId: fixture.accessTokenId,
      workspaceId: fixture.workspaceId,
      caseId: fixture.caseId,
      partyId: fixture.partyId,
    });

    for (const item of view!.items) {
      expect(item.latestSubmission).toBeNull();
      expect(item.latestReview).toBeNull();
      expect(item.assignment.fulfilmentStatus).toBe('pending');
    }
  });

  it('surfaces the latest submission_version and its file_asset', async () => {
    const fixture = await seedRecipientFixture();
    const file = await seedFixtureFileAsset(fixture, { malwareScanStatus: 'clean' });

    const view = await getRecipientView({
      accessTokenId: fixture.accessTokenId,
      workspaceId: fixture.workspaceId,
      caseId: fixture.caseId,
      partyId: fixture.partyId,
    });

    const uploadItem = view!.items.find((i) => i.requirement.actionType === 'upload');
    expect(uploadItem?.latestSubmission?.submissionVersion.id).toBe(file.submissionVersionId);
    expect(uploadItem?.latestSubmission?.fileAsset?.id).toBe(file.fileAssetId);
    expect(uploadItem?.latestSubmission?.answer).toBeNull();
  });

  it('returns null for a case that does not exist in the given workspace', async () => {
    const fixture = await seedRecipientFixture();
    const view = await getRecipientView({
      accessTokenId: fixture.accessTokenId,
      workspaceId: fixture.workspaceId,
      caseId: '00000000-0000-0000-0000-000000000000',
      partyId: fixture.partyId,
    });
    expect(view).toBeNull();
  });

  it('never returns rows from a different case, even in the same workspace', async () => {
    const fixtureA = await seedRecipientFixture();
    const fixtureB = await seedRecipientFixture();
    expect(fixtureA.workspaceId).not.toBe(fixtureB.workspaceId); // sanity: fixtures are workspace-isolated by construction

    // Same workspace, second case: build it under fixtureA's workspace directly.
    const secondCase = await seedFixtureCase({
      workspaceId: fixtureA.workspaceId,
      userId: fixtureA.userId,
    });

    const view = await getRecipientView({
      accessTokenId: fixtureA.accessTokenId,
      workspaceId: fixtureA.workspaceId,
      caseId: fixtureA.caseId,
      partyId: fixtureA.partyId,
    });

    const secondCaseView = await getRecipientView({
      accessTokenId: secondCase.accessTokenId,
      workspaceId: fixtureA.workspaceId,
      caseId: secondCase.caseId,
      partyId: secondCase.partyId,
    });

    const caseAIds = view!.items.map((i) => i.requirement.id);
    const caseBIds = secondCaseView!.items.map((i) => i.requirement.id);
    expect(caseAIds.some((id) => caseBIds.includes(id))).toBe(false);
  });
});
