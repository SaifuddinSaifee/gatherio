import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gatherio-storage-'));
  vi.resetModules();
  process.env.STORAGE_LOCAL_DIR = tmpDir;
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('local storage adapter', () => {
  it('round-trips a presigned upload token through write and read', async () => {
    const { localStorageAdapter, verifyLocalStorageToken, writeLocalFile, localFilePath } =
      await import('../storage.local');

    const adapter = localStorageAdapter();
    const key = 'ws-1/case-1/sv-1/file.pdf';

    const upload = await adapter.presignUpload({
      key,
      contentType: 'application/pdf',
      maxBytes: 1024,
    });
    expect(upload.method).toBe('PUT');
    expect(upload.url).toContain('/api/upload/');

    const token = upload.url.split('/api/upload/')[1]!;
    const payload = verifyLocalStorageToken(token);
    expect(payload.key).toBe(key);
    expect(payload.action).toBe('upload');

    async function* body() {
      yield new TextEncoder().encode('hello world');
    }
    await writeLocalFile(payload.key, body());

    const completed = await adapter.complete(key);
    expect(completed.byteSize).toBe(Buffer.byteLength('hello world'));
    expect(completed.contentType).toBeNull();
    // sha256('hello world')
    expect(completed.sha256).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );

    const { readFile } = await import('node:fs/promises');
    const written = await readFile(localFilePath(key), 'utf8');
    expect(written).toBe('hello world');
  });

  it('rejects a token whose signature has been tampered with', async () => {
    const { localStorageAdapter, verifyLocalStorageToken } = await import('../storage.local');
    const adapter = localStorageAdapter();

    const upload = await adapter.presignUpload({
      key: 'ws-1/case-1/sv-1/file.pdf',
      contentType: 'application/pdf',
      maxBytes: 1024,
    });
    const token = upload.url.split('/api/upload/')[1]!;
    const [body] = token.split('.');
    const tampered = `${body}.deadbeef`;

    expect(() => verifyLocalStorageToken(tampered)).toThrow(/signature/i);
  });

  it('rejects an expired token', async () => {
    const { localStorageAdapter, verifyLocalStorageToken } = await import('../storage.local');
    const adapter = localStorageAdapter();

    const upload = await adapter.presignUpload({
      key: 'ws-1/case-1/sv-1/file.pdf',
      contentType: 'application/pdf',
      maxBytes: 1024,
      expiresInSeconds: -1,
    });
    const token = upload.url.split('/api/upload/')[1]!;

    expect(() => verifyLocalStorageToken(token)).toThrow(/expired/i);
  });

  it('rejects a key that attempts to escape the storage root', async () => {
    const { writeLocalFile } = await import('../storage.local');

    async function* body() {
      yield new TextEncoder().encode('x');
    }
    await expect(writeLocalFile('../../etc/passwd', body())).rejects.toThrow(/escapes/i);
  });

  it('complete() throws for a key that was never written', async () => {
    const { localStorageAdapter } = await import('../storage.local');
    const adapter = localStorageAdapter();
    await expect(adapter.complete('never/written/file.pdf')).rejects.toThrow();
  });

  it('carries the filename through a presigned download token', async () => {
    const { localStorageAdapter, verifyLocalStorageToken } = await import('../storage.local');
    const adapter = localStorageAdapter();

    const download = await adapter.presignDownload({
      key: 'ws-1/case-1/sv-1/file.pdf',
      filename: 'statement-v1.pdf',
    });
    const token = download.url.split('/api/download/')[1]!;
    const payload = verifyLocalStorageToken(token);

    expect(payload.action).toBe('download');
    expect(payload.filename).toBe('statement-v1.pdf');
  });

  it('omits the filename from the token when none is given', async () => {
    const { localStorageAdapter, verifyLocalStorageToken } = await import('../storage.local');
    const adapter = localStorageAdapter();

    const download = await adapter.presignDownload({ key: 'ws-1/case-1/sv-1/file.pdf' });
    const token = download.url.split('/api/download/')[1]!;
    const payload = verifyLocalStorageToken(token);

    expect(payload.filename).toBeUndefined();
  });
});
