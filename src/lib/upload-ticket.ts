import { env } from '@/lib/env';
import { signHmacToken, verifyHmacToken } from '@/lib/hmac-token';

/**
 * Signed at requestUploadAction time, verified at confirmUploadAction
 * time (Stage 6). Without this, confirmUploadAction would have to accept
 * a client-supplied storageKey/originalFilename/mimeType for a file_asset
 * row where all three are NOT NULL — the server must only ever persist
 * values it authored itself, never values a client hands back to it.
 */

export interface UploadTicketPayload {
  submissionVersionId: string;
  key: string;
  contentType: string;
  originalFilename: string;
  maxBytes: number;
  exp: number;
}

export function signUploadTicket(payload: Omit<UploadTicketPayload, 'exp'>): string {
  const exp = Date.now() + env.UPLOAD_PRESIGN_TTL_SECONDS * 1000;
  return signHmacToken<UploadTicketPayload>({ ...payload, exp }, env.AUTH_SECRET);
}

export type VerifyUploadTicketResult =
  | { ok: true; payload: UploadTicketPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyUploadTicket(ticket: string): VerifyUploadTicketResult {
  const result = verifyHmacToken<UploadTicketPayload>(ticket, env.AUTH_SECRET);
  if (!result.ok) return result;
  if (Date.now() > result.payload.exp) return { ok: false, reason: 'expired' };
  return { ok: true, payload: result.payload };
}
