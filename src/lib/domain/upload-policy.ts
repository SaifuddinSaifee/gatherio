/**
 * Upload policy checks run on every requestUploadAction call (Stage 6),
 * before a submission_version is reserved or anything is presigned.
 *
 * ALLOWED_MIME_TYPES is a code constant, not an env var — the set of file
 * types Gather accepts isn't a deployment concern, it's a product
 * decision that changes through a code review, not a config edit.
 */

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/csv',
  'text/plain',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Extensions expected for each allowed MIME type — cross-checked against the filename so a renamed .exe can't ride in as a .pdf's declared content-type. */
const MIME_EXTENSIONS: Record<AllowedMimeType, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/heic': ['heic'],
  'image/webp': ['webp'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'text/csv': ['csv'],
  'text/plain': ['txt'],
};

export interface UploadRequestInput {
  filename: string;
  contentType: string;
  /** Client-declared size — advisory only. The R2 driver ignores maxBytes at presign time, so byteSize from StorageAdapter.complete() at confirm time is the only value ever trusted for enforcement. */
  byteSize: number;
}

export type ValidateUploadResult = { ok: true } | { ok: false; message: string };

function extensionOf(filename: string): string | null {
  const dot = filename.lastIndexOf('.');
  if (dot === -1 || dot === filename.length - 1) return null;
  return filename.slice(dot + 1).toLowerCase();
}

export function validateUploadRequest(
  input: UploadRequestInput,
  maxBytes: number,
): ValidateUploadResult {
  const filename = input.filename.trim();
  if (!filename) return { ok: false, message: 'A filename is required.' };

  const contentType = input.contentType.trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(contentType as AllowedMimeType)) {
    return { ok: false, message: `File type "${contentType || 'unknown'}" isn't accepted.` };
  }

  const extension = extensionOf(filename);
  const expectedExtensions = MIME_EXTENSIONS[contentType as AllowedMimeType];
  if (!extension || !expectedExtensions.includes(extension)) {
    return {
      ok: false,
      message: `The file extension doesn't match its declared type (${contentType}).`,
    };
  }

  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    return { ok: false, message: 'The file appears to be empty.' };
  }
  if (input.byteSize > maxBytes) {
    const maxMb = Math.floor(maxBytes / (1024 * 1024));
    return { ok: false, message: `This file is too large. The limit is ${maxMb} MB.` };
  }

  return { ok: true };
}
