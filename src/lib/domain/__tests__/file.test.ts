import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { scoped } from '@/db/scoped';
import * as schema from '@/db/schema';
import { seedFixtureCase, seedFixtureFileAsset, seedRecipientFixture } from '@/db/testing';
import { FileNotFoundError, FileNotScannedError, presignFileDownload } from '../file';

/**
 * Integration test against the real docker-compose Postgres (no DB
 * reset between files — every fixture is uniquely named). Retires
 * CHECKLIST's "download route doesn't check malware scan status" gap by
 * proving the gate at the one place a download URL is actually minted.
 */
describe('presignFileDownload', () => {
  it('throws FileNotFoundError for an id that does not exist', async () => {
    const fixture = await seedRecipientFixture();
    await expect(
      presignFileDownload(fixture.workspaceId, '00000000-0000-0000-0000-000000000000', {
        actorType: 'party',
        actorId: fixture.partyId,
      }),
    ).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it.each(['pending', 'quarantined', 'infected', 'scan_failed'] as const)(
    'throws FileNotScannedError when malwareScanStatus is %s',
    async (malwareScanStatus) => {
      const fixture = await seedRecipientFixture();
      const file = await seedFixtureFileAsset(fixture, { malwareScanStatus });

      await expect(
        presignFileDownload(fixture.workspaceId, file.fileAssetId, {
          actorType: 'party',
          actorId: fixture.partyId,
        }),
      ).rejects.toBeInstanceOf(FileNotScannedError);
    },
  );

  it('succeeds and returns a URL when malwareScanStatus is clean', async () => {
    const fixture = await seedRecipientFixture();
    const file = await seedFixtureFileAsset(fixture, { malwareScanStatus: 'clean' });

    const result = await presignFileDownload(fixture.workspaceId, file.fileAssetId, {
      actorType: 'party',
      actorId: fixture.partyId,
    });

    expect(result.url).toContain('/api/download/');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.filename).toBe('test.pdf');
  });

  it('writes exactly one file.downloaded audit event on success', async () => {
    const fixture = await seedRecipientFixture();
    const file = await seedFixtureFileAsset(fixture, { malwareScanStatus: 'clean' });

    await presignFileDownload(fixture.workspaceId, file.fileAssetId, {
      actorType: 'party',
      actorId: fixture.partyId,
    });

    const s = scoped(fixture.workspaceId);
    const events = await s.db
      .select()
      .from(schema.auditEvent)
      .where(eq(schema.auditEvent.objectId, file.fileAssetId));

    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('file.downloaded');
    expect(events[0]?.actorType).toBe('party');
    expect(events[0]?.actorId).toBe(fixture.partyId);
    expect(events[0]?.caseId).toBe(fixture.caseId);
  });

  it('writes no audit event when the scan gate rejects the download', async () => {
    const fixture = await seedRecipientFixture();
    const file = await seedFixtureFileAsset(fixture, { malwareScanStatus: 'infected' });

    await expect(
      presignFileDownload(fixture.workspaceId, file.fileAssetId, {
        actorType: 'party',
        actorId: fixture.partyId,
      }),
    ).rejects.toThrow();

    const s = scoped(fixture.workspaceId);
    const events = await s.db
      .select()
      .from(schema.auditEvent)
      .where(eq(schema.auditEvent.objectId, file.fileAssetId));
    expect(events).toHaveLength(0);
  });

  it('throws FileNotFoundError when expectedCaseId does not match the file\'s actual case', async () => {
    const fixtureA = await seedRecipientFixture();
    const fixtureB = await seedFixtureCase({ workspaceId: fixtureA.workspaceId, userId: fixtureA.userId });
    const fileInB = await seedFixtureFileAsset(fixtureB, { malwareScanStatus: 'clean' });

    // A recipient session for case A trying to download a file that
    // actually belongs to case B in the same workspace.
    await expect(
      presignFileDownload(fixtureA.workspaceId, fileInB.fileAssetId, {
        actorType: 'party',
        actorId: fixtureA.partyId,
        expectedCaseId: fixtureA.caseId,
      }),
    ).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it('succeeds when expectedCaseId matches', async () => {
    const fixture = await seedRecipientFixture();
    const file = await seedFixtureFileAsset(fixture, { malwareScanStatus: 'clean' });

    const result = await presignFileDownload(fixture.workspaceId, file.fileAssetId, {
      actorType: 'party',
      actorId: fixture.partyId,
      expectedCaseId: fixture.caseId,
    });
    expect(result.filename).toBe('test.pdf');
  });
});
