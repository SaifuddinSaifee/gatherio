/**
 * The ~150-line custom uploader (Stage 6 decision 1) — XMLHttpRequest,
 * not fetch, because `xhr.upload.onprogress` is the only way to get real
 * upload progress. No multipart/chunking: a dropped connection restarts
 * the whole file rather than resuming a byte range. "Resumable" in this
 * stage means the item stays outstanding and a retry is one tap, not
 * that a half-sent file continues from where it left off.
 */

export interface UploadTarget {
  uploadUrl: string;
  method: 'PUT' | 'POST';
  headers?: Record<string, string>;
}

function uploadOnce(
  target: UploadTarget,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.uploadUrl, true);
    for (const [key, value] of Object.entries(target.headers ?? {})) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (status ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.send(file);
  });
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Whole-file restart on failure, exponential backoff, three attempts total. */
export async function uploadWithRetry(
  target: UploadTarget,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      onProgress(0);
      await uploadOnce(target, file, onProgress);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Upload failed after multiple attempts.');
}
