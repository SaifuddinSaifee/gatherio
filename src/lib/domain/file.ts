import { eq } from 'drizzle-orm';
import { scoped, type WorkspaceId } from '@/db/scoped';
import { withAudit } from '@/db/audit';
import * as schema from '@/db/schema';
import { getStorageAdapter } from '@/lib/adapters/storage';

/**
 * The only sanctioned way to obtain a download URL for a file_asset
 * (Stage 6). Every download surface — the recipient's own completed-item
 * list, Stage 7's reviewer download, Stage 9's export — routes through
 * this function rather than presigning directly.
 *
 * This is deliberately NOT enforced in /api/download/[token]/route.ts.
 * That route sees only an opaque, stateless HMAC storage token and,
 * under STORAGE_DRIVER=r2, isn't even in the request path — the browser
 * PUTs/GETs straight to Cloudflare. A route-level scan gate would be
 * security theatre that only works in local dev. The gate has to sit at
 * the one place a download URL is ever minted, which is here.
 */

export class FileNotFoundError extends Error {
  constructor() {
    super('File not found.');
  }
}

export class FileNotScannedError extends Error {
  constructor(public readonly status: string) {
    super(
      status === 'infected'
        ? 'This file failed a malware scan and cannot be downloaded.'
        : "This file hasn't finished being scanned yet — try again shortly.",
    );
  }
}

export interface DownloadActor {
  actorType: 'party' | 'user' | 'system';
  actorId?: string;
  ipAddress?: string;
  userAgent?: string;
  /**
   * When provided, the file must belong to this case or the download is
   * refused as not-found. The recipient route always passes this (a
   * token grants one case, not the workspace); a requester's own
   * reviewer/export download (Stage 7/9) can omit it, since a workspace
   * member isn't limited to one case the way a recipient token is.
   */
  expectedCaseId?: string;
}

export interface PresignedFileDownload {
  url: string;
  expiresAt: Date;
  filename: string;
}

export async function presignFileDownload(
  workspaceId: WorkspaceId,
  fileAssetId: string,
  actor: DownloadActor,
): Promise<PresignedFileDownload> {
  const s = scoped(workspaceId);

  const [row] = await s.db
    .select({ fileAsset: schema.fileAsset, caseId: schema.requirement.caseId })
    .from(schema.fileAsset)
    .innerJoin(
      schema.submissionVersion,
      eq(schema.fileAsset.submissionVersionId, schema.submissionVersion.id),
    )
    .innerJoin(schema.assignment, eq(schema.submissionVersion.assignmentId, schema.assignment.id))
    .innerJoin(schema.requirement, eq(schema.assignment.requirementId, schema.requirement.id))
    .where(s.where(schema.fileAsset.workspaceId, eq(schema.fileAsset.id, fileAssetId)))
    .limit(1);

  if (!row) throw new FileNotFoundError();
  if (actor.expectedCaseId && row.caseId !== actor.expectedCaseId) {
    // Deliberately the same error as "doesn't exist" — a recipient
    // probing another case's file id learns nothing more than a typo
    // would. Workspace scoping alone is not authorization here: a token
    // grants one case, and file_asset has no case_id of its own to
    // check without this join.
    throw new FileNotFoundError();
  }
  if (row.fileAsset.malwareScanStatus !== 'clean') {
    throw new FileNotScannedError(row.fileAsset.malwareScanStatus);
  }

  // The audit write and the read that authorizes it are wrapped together
  // so a failed audit insert (e.g. a malformed IP that `inet` rejects)
  // blocks the download rather than silently handing out an unlogged
  // link — fail closed, not open. There's no other state change to join
  // it to: minting a presigned URL isn't itself a database write, and a
  // network call to the storage adapter can't join a Postgres
  // transaction anyway.
  await s.db.transaction(async (tx) => {
    await withAudit(tx, {
      workspaceId,
      caseId: row.caseId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      eventType: 'file.downloaded',
      objectType: 'file_asset',
      objectId: fileAssetId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { storageKey: row.fileAsset.storageKey },
    });
  });

  const storage = await getStorageAdapter();
  const { url, expiresAt } = await storage.presignDownload({ key: row.fileAsset.storageKey });

  return { url, expiresAt, filename: row.fileAsset.originalFilename };
}
