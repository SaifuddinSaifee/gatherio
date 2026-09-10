import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signHmacToken } from '../hmac-token';
import {
  signUploadTicket,
  verifyUploadTicket,
  type UploadTicketPayload,
} from '../upload-ticket';

const basePayload = {
  submissionVersionId: 'sv-1',
  key: 'ws-1/case-1/sv-1/file-uuid',
  contentType: 'application/pdf',
  originalFilename: 'statement.pdf',
  maxBytes: 26_214_400,
};

describe('signUploadTicket / verifyUploadTicket', () => {
  it('round-trips the payload', () => {
    const ticket = signUploadTicket(basePayload);
    const result = verifyUploadTicket(ticket);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.submissionVersionId).toBe('sv-1');
      expect(result.payload.key).toBe('ws-1/case-1/sv-1/file-uuid');
      expect(result.payload.contentType).toBe('application/pdf');
      expect(result.payload.originalFilename).toBe('statement.pdf');
      expect(result.payload.maxBytes).toBe(26_214_400);
    }
  });

  it('rejects a ticket signed with a different secret', () => {
    const forged = signHmacToken<UploadTicketPayload>(
      { ...basePayload, exp: Date.now() + 60_000 },
      'a-completely-different-secret',
    );
    const result = verifyUploadTicket(forged);
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a truncated ticket', () => {
    const ticket = signUploadTicket(basePayload);
    const truncated = ticket.slice(0, ticket.length - 10);
    expect(verifyUploadTicket(truncated).ok).toBe(false);
  });

  describe('expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('accepts a fresh ticket', () => {
      const ticket = signUploadTicket(basePayload);
      expect(verifyUploadTicket(ticket).ok).toBe(true);
    });

    it('rejects a ticket after UPLOAD_PRESIGN_TTL_SECONDS has elapsed', () => {
      const ticket = signUploadTicket(basePayload);
      vi.advanceTimersByTime(901 * 1000); // default UPLOAD_PRESIGN_TTL_SECONDS is 900
      const result = verifyUploadTicket(ticket);
      expect(result).toEqual({ ok: false, reason: 'expired' });
    });
  });
});
