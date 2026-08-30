/**
 * Storage adapter interface. Key format is fixed everywhere it's called
 * from — {workspace_id}/{case_id}/{submission_version_id}/{uuid} — never
 * the original filename (techstack.md). Both drivers implement the exact
 * same surface so the recipient-page upload code (Stage 6) doesn't know
 * or care which one is active; switching STORAGE_DRIVER is the entire
 * migration from local dev to R2, and from R2 to S3 ap-south-1 if the
 * residency decision in the plan ever flips.
 *
 * Deliberately does not touch the database. Marking a file_asset's
 * malware_scan_status or enqueuing the scan job happens at the call site
 * (Stage 6/8) — an adapter that reached into the DB would stop being a
 * storage adapter.
 */
export interface PresignUploadResult {
  url: string;
  method: 'PUT' | 'POST';
  /** Extra headers the client must send with the upload request, if any. */
  headers?: Record<string, string>;
  key: string;
}

export interface PresignDownloadResult {
  url: string;
  expiresAt: Date;
}

export interface StorageAdapter {
  presignUpload(params: {
    key: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds?: number;
  }): Promise<PresignUploadResult>;

  presignDownload(params: {
    key: string;
    expiresInSeconds?: number;
  }): Promise<PresignDownloadResult>;

  /** Called once the client reports the upload finished. Verifies the object exists. */
  complete(key: string): Promise<void>;

  delete(key: string): Promise<void>;
}

let cached: StorageAdapter | undefined;

export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (cached) return cached;
  const { env } = await import('@/lib/env');
  if (env.STORAGE_DRIVER === 'r2') {
    const { r2StorageAdapter } = await import('./storage.r2');
    cached = r2StorageAdapter();
  } else {
    const { localStorageAdapter } = await import('./storage.local');
    cached = localStorageAdapter();
  }
  return cached;
}
