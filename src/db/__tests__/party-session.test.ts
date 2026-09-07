import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../client';
import * as schema from '../schema';
import { assertTokenStillValid, resolveRecipientSession } from '../party-session';
import { seedRecipientFixture } from '../testing';

/**
 * The single most important test in Stage 6 (mirroring techstack.md's
 * framing of the reminder-idempotency test as the most important one in
 * Stage 8): a corporate mail scanner pre-fetching a recipient's link must
 * leave the database completely untouched. `resolveRecipientSession` is
 * read-only by construction (no INSERT/UPDATE/DELETE anywhere in it) —
 * this test proves that holds at the database level, not just by reading
 * the source.
 *
 * Runs against the real docker-compose Postgres (no mocking, no DB
 * reset between test files) — every fixture is uniquely named via
 * src/db/testing.ts, and every assertion here compares whole rows
 * against a snapshot taken from THIS test's own fixture, never a
 * workspace-wide or table-wide count, so it stays correct on a shared,
 * never-reset database.
 */
describe('resolveRecipientSession — mail-scanner guarantee', () => {
  it('leaves every assignment, the access_token row, and the audit log untouched across two GETs', async () => {
    const fixture = await seedRecipientFixture();

    const assignmentsBefore = await db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.partyId, fixture.partyId));
    const [accessTokenBefore] = await db
      .select()
      .from(schema.accessToken)
      .where(eq(schema.accessToken.id, fixture.accessTokenId));
    const auditEventsBefore = await db
      .select()
      .from(schema.auditEvent)
      .where(eq(schema.auditEvent.caseId, fixture.caseId));

    expect(assignmentsBefore).toHaveLength(fixture.requirementIds.length);
    expect(accessTokenBefore).toBeDefined();
    // instantiateCase itself writes one access_token.issued event when the
    // case is created — the scanner-guarantee this test proves is that
    // resolveRecipientSession adds nothing on top of that, not that the
    // case has no history at all.
    expect(auditEventsBefore).toHaveLength(1);
    expect(auditEventsBefore[0]?.eventType).toBe('access_token.issued');

    // The scanner fetches the link. Twice — mail scanners routinely
    // pre-fetch the same URL more than once (link-preview + a later
    // full scan pass).
    const first = await resolveRecipientSession(fixture.token);
    const second = await resolveRecipientSession(fixture.token);

    expect(first).toEqual({
      ok: true,
      session: {
        accessTokenId: fixture.accessTokenId,
        workspaceId: fixture.workspaceId,
        caseId: fixture.caseId,
        partyId: fixture.partyId,
      },
    });
    expect(second).toEqual(first);

    const assignmentsAfter = await db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.partyId, fixture.partyId));
    const [accessTokenAfter] = await db
      .select()
      .from(schema.accessToken)
      .where(eq(schema.accessToken.id, fixture.accessTokenId));
    const auditEventsAfter = await db
      .select()
      .from(schema.auditEvent)
      .where(eq(schema.auditEvent.caseId, fixture.caseId));

    // Whole-row equality, not a check of three fields — this also fails
    // if a future migration adds a `usedAt` column and something starts
    // writing to it from the GET path.
    expect(assignmentsAfter).toEqual(assignmentsBefore);
    expect(accessTokenAfter).toEqual(accessTokenBefore);
    expect(accessTokenAfter?.revokedAt).toBeNull();
    expect(auditEventsAfter).toEqual(auditEventsBefore);

    // Every assignment must still be exactly as instantiateCase left it:
    // pending, never viewed, never submitted.
    for (const assignment of assignmentsAfter) {
      expect(assignment.fulfilmentStatus).toBe('pending');
      expect(assignment.viewedAt).toBeNull();
      expect(assignment.submittedAt).toBeNull();
    }
  });
});

describe('resolveRecipientSession — failure modes', () => {
  it('returns not_found for a token that does not exist', async () => {
    const result = await resolveRecipientSession('this-token-was-never-issued');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns expired for a token past its expiresAt', async () => {
    const fixture = await seedRecipientFixture();
    await db
      .update(schema.accessToken)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.accessToken.id, fixture.accessTokenId));

    const result = await resolveRecipientSession(fixture.token);
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('returns revoked for a token with revokedAt set', async () => {
    const fixture = await seedRecipientFixture();
    await db
      .update(schema.accessToken)
      .set({ revokedAt: new Date() })
      .where(eq(schema.accessToken.id, fixture.accessTokenId));

    const result = await resolveRecipientSession(fixture.token);
    expect(result).toEqual({ ok: false, reason: 'revoked' });
  });
});

describe('assertTokenStillValid — enforced on every POST, not just at session creation', () => {
  it('returns ok for a live token', async () => {
    const fixture = await seedRecipientFixture();
    expect(await assertTokenStillValid(fixture.accessTokenId)).toEqual({ ok: true });
  });

  it('returns not_found for an id that does not exist', async () => {
    const result = await assertTokenStillValid('00000000-0000-0000-0000-000000000000');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('catches revocation that happens after the session cookie was already issued', async () => {
    const fixture = await seedRecipientFixture();
    // The cookie itself has no way to know the token was revoked after
    // it was signed — this is exactly why every action re-reads the row.
    expect(await assertTokenStillValid(fixture.accessTokenId)).toEqual({ ok: true });

    await db
      .update(schema.accessToken)
      .set({ revokedAt: new Date() })
      .where(eq(schema.accessToken.id, fixture.accessTokenId));

    expect(await assertTokenStillValid(fixture.accessTokenId)).toEqual({
      ok: false,
      reason: 'revoked',
    });
  });

  it('catches expiry the same way', async () => {
    const fixture = await seedRecipientFixture();
    await db
      .update(schema.accessToken)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.accessToken.id, fixture.accessTokenId));

    expect(await assertTokenStillValid(fixture.accessTokenId)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
});
