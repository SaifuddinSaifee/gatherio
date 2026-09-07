'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { MdCheckCircle, MdCloudUpload, MdError, MdRefresh } from 'react-icons/md';
import { confirmUploadAction, requestUploadAction } from './actions';
import { uploadWithRetry } from './xhr-upload';

type UploadStatus = 'idle' | 'uploading' | 'confirming' | 'error' | 'done';

/**
 * The only part of the recipient page that genuinely requires
 * JavaScript — there is no honest no-JS path to a presigned
 * direct-to-storage upload. Everything else on this page degrades to a
 * plain form post; this one shows a <noscript> explanation instead
 * (page.tsx).
 */
export function UploadField({ caseId, assignmentId }: { caseId: string; assignmentId: string }) {
  const router = useRouter();
  const inputId = `upload-${assignmentId}`;
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const lastFileRef = useRef<File | null>(null);

  async function startUpload(file: File) {
    lastFileRef.current = file;
    setFilename(file.name);
    setError(null);
    setStatus('uploading');
    setProgress(0);

    const requested = await requestUploadAction({
      caseId,
      assignmentId,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      byteSize: file.size,
    });
    if ('error' in requested) {
      setError(requested.error);
      setStatus('error');
      return;
    }

    try {
      // presignUpload().url is used generically here — under
      // STORAGE_DRIVER=r2 this points straight at Cloudflare, never at
      // this app's own /api/upload/ route.
      await uploadWithRetry(requested, file, setProgress);
    } catch {
      setError('The upload failed. Check your connection and try again.');
      setStatus('error');
      return;
    }

    setStatus('confirming');
    const confirmed = await confirmUploadAction({ caseId, ticket: requested.ticket });
    if ('error' in confirmed) {
      setError(confirmed.error);
      setStatus('error');
      return;
    }

    setStatus('done');
    // Not a <form> submission, so Next won't auto-refresh the server
    // tree the way it does for the action-bound forms elsewhere on this
    // page — confirmUploadAction already called revalidatePath; this is
    // what actually re-fetches it into view.
    router.refresh();
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void startUpload(file);
  }

  function retry() {
    if (lastFileRef.current) void startUpload(lastFileRef.current);
  }

  return (
    <div className="mt-3">
      <input
        id={inputId}
        type="file"
        onChange={handleInputChange}
        className="sr-only"
        disabled={status === 'uploading' || status === 'confirming'}
      />

      {(status === 'idle' || status === 'error') && (
        <label
          htmlFor={inputId}
          className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-md-outline text-label-large text-md-primary"
        >
          <MdCloudUpload aria-hidden="true" className="h-5 w-5" />
          Choose a file
        </label>
      )}

      {(status === 'uploading' || status === 'confirming') && (
        <div>
          <p className="truncate text-body-small text-md-on-surface-variant">{filename}</p>
          <div
            className="mt-2 h-1 w-full overflow-hidden rounded-full bg-md-surface-container-highest"
            role="progressbar"
            aria-valuenow={status === 'confirming' ? 100 : Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-md-primary transition-[width] duration-(--duration-effects-fast)"
              style={{ width: `${status === 'confirming' ? 100 : Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-body-small text-md-on-surface-variant">
            {status === 'confirming' ? 'Finishing up…' : `Uploading… ${Math.round(progress * 100)}%`}
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="mt-2">
          <p
            role="alert"
            className="flex items-center gap-2 rounded-sm bg-md-error-container px-4 py-2 text-body-small text-md-on-error-container"
          >
            <MdError aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
            Error: {error}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-2 flex h-12 cursor-pointer items-center gap-2 text-label-large text-md-primary"
          >
            <MdRefresh aria-hidden="true" className="h-4.5 w-4.5" />
            Try again
          </button>
        </div>
      )}

      {status === 'done' && (
        <p className="flex items-center gap-2 text-body-medium text-md-on-surface">
          <MdCheckCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-md-primary" />
          <span className="break-all">{filename} uploaded</span>
        </p>
      )}
    </div>
  );
}
