import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asWorkspaceId } from '@/db/scoped';
import { signHmacToken } from '../hmac-token';
import {
  recipientCookieAttributes,
  recipientCookieName,
  signRecipientCookie,
  verifyRecipientCookie,
  type RecipientCookiePayload,
} from '../recipient-cookie';

const basePayload = {
  accessTokenId: 'token-1',
  workspaceId: asWorkspaceId('workspace-1'),
  caseId: 'case-1',
  partyId: 'party-1',
};

describe('recipientCookieName', () => {
  it('is namespaced per case, not a single fixed name', () => {
    expect(recipientCookieName('case-a')).toBe('gather_r_case-a');
    expect(recipientCookieName('case-a')).not.toBe(recipientCookieName('case-b'));
  });
});

describe('signRecipientCookie / verifyRecipientCookie', () => {
  it('round-trips the payload', () => {
    const { value } = signRecipientCookie(basePayload);
    const result = verifyRecipientCookie(value);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.accessTokenId).toBe('token-1');
      expect(result.payload.workspaceId).toBe('workspace-1');
      expect(result.payload.caseId).toBe('case-1');
      expect(result.payload.partyId).toBe('party-1');
    }
  });

  it('rejects a token signed with a different secret', () => {
    const forged = signHmacToken<RecipientCookiePayload>(
      { ...basePayload, exp: Date.now() + 60_000 },
      'a-completely-different-secret',
    );
    const result = verifyRecipientCookie(forged);
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a truncated cookie value', () => {
    const { value } = signRecipientCookie(basePayload);
    const truncated = value.slice(0, value.length - 10);
    const result = verifyRecipientCookie(truncated);
    expect(result.ok).toBe(false);
  });

  describe('expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('accepts a fresh cookie', () => {
      const { value } = signRecipientCookie(basePayload);
      expect(verifyRecipientCookie(value).ok).toBe(true);
    });

    it('rejects a cookie after RECIPIENT_SESSION_TTL_SECONDS has elapsed', () => {
      const { value, maxAgeSeconds } = signRecipientCookie(basePayload);
      vi.advanceTimersByTime((maxAgeSeconds + 1) * 1000);
      const result = verifyRecipientCookie(value);
      expect(result).toEqual({ ok: false, reason: 'expired' });
    });
  });
});

describe('recipientCookieAttributes', () => {
  it('is HttpOnly, SameSite=Lax, scoped to /r', () => {
    const attrs = recipientCookieAttributes(3600);
    expect(attrs.httpOnly).toBe(true);
    expect(attrs.sameSite).toBe('lax');
    expect(attrs.path).toBe('/r');
    expect(attrs.maxAge).toBe(3600);
  });
});
