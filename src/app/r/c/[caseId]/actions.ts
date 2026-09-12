'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { assertTokenStillValid } from '@/db/party-session';
import type { RecipientSession } from '@/db/party-session';
import {
  recipientCookieName,
  verifyRecipientCookie,
} from '@/lib/recipient-cookie';
import { signUploadTicket, verifyUploadTicket } from '@/lib/upload-ticket';
import { clientIp, userAgent as extractUserAgent } from '@/lib/request-context';
import { env } from '@/lib/env';
import { getStorageAdapter } from '@/lib/adapters/storage';
import { validateAnswer } from '@/lib/domain/answer';
import { validateUploadRequest } from '@/lib/domain/upload-policy';
import { getRequirementForAssignment } from '@/lib/domain/recipient-view';
import {
  finalizeUpload,
  markCaseViewed,
  recordAnswerSubmission,
  reserveSubmissionVersion,
  saveDraftAnswer,
} from '@/lib/domain/submission';
import type { AnswerFormState } from './answer-form-state';

/**
 * Every recipient action funnels through requireRecipient() first. It
 * reads our own signed cookie (never the raw magic-link token — that
 * never appears in any POST payload, only in the one-hop redirect that
 * sets this cookie) and then re-reads the access_token row via
 * assertTokenStillValid(), which is what makes "expiry and revocation
 * enforced on every POST, not just at session creation" literally true:
 * a cookie alone would keep authorizing requests right up to its own TTL
 * even after the underlying token had been revoked seconds earlier.
 */
class RecipientAuthError extends Error {}

const SESSION_EXPIRED_MESSAGE = 'This link is no longer valid. Please reopen it from your email.';

async function requireRecipient(caseId: string): Promise<RecipientSession> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(recipientCookieName(caseId))?.value;
  if (!raw) throw new RecipientAuthError(SESSION_EXPIRED_MESSAGE);

  const verified = verifyRecipientCookie(raw);
  if (!verified.ok) throw new RecipientAuthError(SESSION_EXPIRED_MESSAGE);

  // Belt-and-suspenders: the cookie is already named per-case, but the
  // payload carries its own caseId too — check they agree rather than
  // trust the cookie name alone.
  if (verified.payload.caseId !== caseId) throw new RecipientAuthError(SESSION_EXPIRED_MESSAGE);

  const stillValid = await assertTokenStillValid(verified.payload.accessTokenId);
  if (!stillValid.ok) throw new RecipientAuthError(SESSION_EXPIRED_MESSAGE);

  return {
    accessTokenId: verified.payload.accessTokenId,
    workspaceId: verified.payload.workspaceId,
    caseId: verified.payload.caseId,
    partyId: verified.payload.partyId,
  };
}

async function requestContext(): Promise<{ ipAddress?: string; userAgent?: string }> {
  const h = await headers();
  return { ipAddress: clientIp(h), userAgent: extractUserAgent(h) };
}

/** Beacon target — the one thing an opened link is allowed to claim (§4.7: never the GET itself). Idempotent, silently no-ops on an invalid session rather than surfacing an error the recipient can't act on. */
export async function markViewedAction(caseId: string): Promise<void> {
  let session: RecipientSession;
  try {
    session = await requireRecipient(caseId);
  } catch {
    return;
  }

  const ctx = await requestContext();
  await markCaseViewed(session.workspaceId, { partyId: session.partyId, caseId: session.caseId, ...ctx });
}

export interface SaveAnswerDraftInput {
  caseId: string;
  assignmentId: string;
  actionType: 'upload' | 'answer' | 'acknowledge';
  value: unknown;
}

export async function saveAnswerDraftAction(
  input: SaveAnswerDraftInput,
): Promise<{ ok: true } | { error: string }> {
  let session: RecipientSession;
  try {
    session = await requireRecipient(input.caseId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : SESSION_EXPIRED_MESSAGE };
  }

  const ctx = await requestContext();
  try {
    await saveDraftAnswer(session.workspaceId, {
      partyId: session.partyId,
      caseId: session.caseId,
      assignmentId: input.assignmentId,
      actionType: input.actionType,
      value: input.value,
      ...ctx,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save your progress.' };
  }
  return { ok: true };
}

/**
 * Backs the answer forms for short_text/long_text/date/choice/yes_no.
 * The requirement (field type, required, options) is resolved FROM the
 * assignment, never from client-supplied metadata — see
 * getRequirementForAssignment's own docstring for why.
 */
export async function submitAnswerAction(
  _prevState: AnswerFormState,
  formData: FormData,
): Promise<AnswerFormState> {
  const caseId = String(formData.get('caseId') ?? '');
  const assignmentId = String(formData.get('assignmentId') ?? '');
  const rawValue = String(formData.get('value') ?? '');

  let session: RecipientSession;
  try {
    session = await requireRecipient(caseId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : SESSION_EXPIRED_MESSAGE };
  }

  const requirement = await getRequirementForAssignment(session.workspaceId, {
    assignmentId,
    partyId: session.partyId,
    caseId: session.caseId,
  });
  if (!requirement || requirement.actionType !== 'answer' || !requirement.answerFieldType) {
    return { error: 'This question could not be found.' };
  }

  const validated = validateAnswer(
    {
      answerFieldType: requirement.answerFieldType,
      required: requirement.required,
      options: requirement.options,
    },
    rawValue,
  );
  if (!validated.ok) return { error: validated.message };

  const ctx = await requestContext();
  try {
    await recordAnswerSubmission(session.workspaceId, {
      partyId: session.partyId,
      caseId: session.caseId,
      assignmentId,
      actionType: 'answer',
      value: validated.value,
      ...ctx,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save your answer.' };
  }

  revalidatePath(`/r/c/${caseId}`);
  return { error: null };
}

/**
 * The statement being agreed to is rendered server-side from the
 * requirement's own title/instructions, never accepted from the client —
 * evidence of what was actually agreed to is the entire point of an
 * acknowledgement record (§5); a client-supplied statement would be
 * worthless as evidence.
 */
export async function acknowledgeAction(
  _prevState: AnswerFormState,
  formData: FormData,
): Promise<AnswerFormState> {
  const caseId = String(formData.get('caseId') ?? '');
  const assignmentId = String(formData.get('assignmentId') ?? '');

  let session: RecipientSession;
  try {
    session = await requireRecipient(caseId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : SESSION_EXPIRED_MESSAGE };
  }

  const requirement = await getRequirementForAssignment(session.workspaceId, {
    assignmentId,
    partyId: session.partyId,
    caseId: session.caseId,
  });
  if (!requirement || requirement.actionType !== 'acknowledge') {
    return { error: 'This item could not be found.' };
  }

  const statement = [requirement.title, requirement.instructions].filter(Boolean).join(' — ');

  const ctx = await requestContext();
  try {
    await recordAnswerSubmission(session.workspaceId, {
      partyId: session.partyId,
      caseId: session.caseId,
      assignmentId,
      actionType: 'acknowledge',
      value: { fieldType: 'acknowledge', acknowledged: true, statement },
      ...ctx,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not record your acknowledgement.' };
  }

  revalidatePath(`/r/c/${caseId}`);
  return { error: null };
}

/**
 * Only reachable for optional requirements — product.md §4.1's "confirm
 * that an item does not apply" outcome, kept distinct from a blank
 * answer (see answer.ts's emptyMessage for why the two aren't the same
 * claim).
 */
export async function declareNotApplicableAction(
  _prevState: AnswerFormState,
  formData: FormData,
): Promise<AnswerFormState> {
  const caseId = String(formData.get('caseId') ?? '');
  const assignmentId = String(formData.get('assignmentId') ?? '');

  let session: RecipientSession;
  try {
    session = await requireRecipient(caseId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : SESSION_EXPIRED_MESSAGE };
  }

  const requirement = await getRequirementForAssignment(session.workspaceId, {
    assignmentId,
    partyId: session.partyId,
    caseId: session.caseId,
  });
  if (!requirement) return { error: 'This item could not be found.' };
  if (requirement.required) {
    return { error: 'This item is required and cannot be marked as not applicable.' };
  }

  const ctx = await requestContext();
  try {
    await recordAnswerSubmission(session.workspaceId, {
      partyId: session.partyId,
      caseId: session.caseId,
      assignmentId,
      actionType: requirement.actionType === 'sign' ? 'acknowledge' : requirement.actionType,
      value: { fieldType: 'not_applicable', declaredBy: 'party' },
      ...ctx,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save this.' };
  }

  revalidatePath(`/r/c/${caseId}`);
  return { error: null };
}

export interface RequestUploadInput {
  caseId: string;
  assignmentId: string;
  filename: string;
  contentType: string;
  byteSize: number;
}

export interface RequestUploadResult {
  uploadUrl: string;
  method: 'PUT' | 'POST';
  headers?: Record<string, string>;
  ticket: string;
}

/**
 * Called directly by the UploadField client island (not a <form>) once
 * the recipient has picked a file. Reserves the submission_version first
 * so the storage key can include its id (techstack.md's fixed key
 * format), then presigns and mints a ticket the client must return
 * unmodified at confirm time.
 */
export async function requestUploadAction(
  input: RequestUploadInput,
): Promise<RequestUploadResult | { error: string }> {
  let session: RecipientSession;
  try {
    session = await requireRecipient(input.caseId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : SESSION_EXPIRED_MESSAGE };
  }

  const requirement = await getRequirementForAssignment(session.workspaceId, {
    assignmentId: input.assignmentId,
    partyId: session.partyId,
    caseId: session.caseId,
  });
  if (!requirement || requirement.actionType !== 'upload') {
    return { error: 'This item could not be found.' };
  }

  const policyCheck = validateUploadRequest(
    { filename: input.filename, contentType: input.contentType, byteSize: input.byteSize },
    env.UPLOAD_MAX_BYTES,
  );
  if (!policyCheck.ok) return { error: policyCheck.message };

  const ctx = await requestContext();

  let reserved;
  try {
    reserved = await reserveSubmissionVersion(session.workspaceId, {
      partyId: session.partyId,
      caseId: session.caseId,
      assignmentId: input.assignmentId,
      originalFilename: input.filename,
      contentType: input.contentType,
      declaredBytes: input.byteSize,
      ...ctx,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not start the upload.' };
  }

  const storage = await getStorageAdapter();
  const presigned = await storage.presignUpload({
    key: reserved.key,
    contentType: input.contentType,
    maxBytes: env.UPLOAD_MAX_BYTES,
    expiresInSeconds: env.UPLOAD_PRESIGN_TTL_SECONDS,
  });

  const ticket = signUploadTicket({
    submissionVersionId: reserved.submissionVersionId,
    key: reserved.key,
    contentType: input.contentType,
    originalFilename: input.filename,
    maxBytes: env.UPLOAD_MAX_BYTES,
  });

  return { uploadUrl: presigned.url, method: presigned.method, headers: presigned.headers, ticket };
}

const CONFIRM_UPLOAD_ERROR_MESSAGES: Record<'too_large' | 'infected' | 'not_found' | 'closed', string> = {
  too_large: `This file is larger than the ${Math.floor(env.UPLOAD_MAX_BYTES / (1024 * 1024))} MB limit.`,
  infected: "This file didn't pass our virus scan. Try a different copy, or contact the sender.",
  not_found: 'This upload could not be found. Please try again.',
  // Stage 7: the assignment closed (approved, or awaiting review) between
  // starting this upload and it finishing — e.g. the requester approved
  // the item as-is while the upload was still in flight.
  closed: 'This item has already been received — refresh the page to see its current status.',
};

export async function confirmUploadAction(input: {
  caseId: string;
  ticket: string;
}): Promise<{ ok: true } | { error: string }> {
  let session: RecipientSession;
  try {
    session = await requireRecipient(input.caseId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : SESSION_EXPIRED_MESSAGE };
  }

  const verifiedTicket = verifyUploadTicket(input.ticket);
  if (!verifiedTicket.ok) {
    return { error: 'This upload session has expired. Please try uploading again.' };
  }

  const ctx = await requestContext();
  const result = await finalizeUpload(session.workspaceId, {
    partyId: session.partyId,
    caseId: session.caseId,
    ticket: verifiedTicket.payload,
    ...ctx,
  });

  if (!result.ok) return { error: CONFIRM_UPLOAD_ERROR_MESSAGES[result.reason] };

  revalidatePath(`/r/c/${input.caseId}`);
  return { ok: true };
}
