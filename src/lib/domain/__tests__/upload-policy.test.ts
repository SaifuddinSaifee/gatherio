import { describe, expect, it } from 'vitest';
import { validateUploadRequest } from '../upload-policy';

const MAX_BYTES = 1_000_000;

describe('validateUploadRequest', () => {
  it('accepts a valid PDF', () => {
    const result = validateUploadRequest(
      { filename: 'statement.pdf', contentType: 'application/pdf', byteSize: 500_000 },
      MAX_BYTES,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a disallowed MIME type', () => {
    const result = validateUploadRequest(
      { filename: 'app.exe', contentType: 'application/x-msdownload', byteSize: 1000 },
      MAX_BYTES,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects an extension/MIME mismatch', () => {
    const result = validateUploadRequest(
      { filename: 'statement.exe', contentType: 'application/pdf', byteSize: 1000 },
      MAX_BYTES,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a missing extension', () => {
    const result = validateUploadRequest(
      { filename: 'statement', contentType: 'application/pdf', byteSize: 1000 },
      MAX_BYTES,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a file over the byte limit', () => {
    const result = validateUploadRequest(
      { filename: 'statement.pdf', contentType: 'application/pdf', byteSize: MAX_BYTES + 1 },
      MAX_BYTES,
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a file exactly at the byte limit', () => {
    const result = validateUploadRequest(
      { filename: 'statement.pdf', contentType: 'application/pdf', byteSize: MAX_BYTES },
      MAX_BYTES,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a zero-byte file', () => {
    const result = validateUploadRequest(
      { filename: 'statement.pdf', contentType: 'application/pdf', byteSize: 0 },
      MAX_BYTES,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a negative byte size', () => {
    const result = validateUploadRequest(
      { filename: 'statement.pdf', contentType: 'application/pdf', byteSize: -5 },
      MAX_BYTES,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a blank filename', () => {
    const result = validateUploadRequest(
      { filename: '   ', contentType: 'application/pdf', byteSize: 1000 },
      MAX_BYTES,
    );
    expect(result.ok).toBe(false);
  });

  it('is case-insensitive on content type and extension', () => {
    const result = validateUploadRequest(
      { filename: 'STATEMENT.PDF', contentType: 'APPLICATION/PDF', byteSize: 1000 },
      MAX_BYTES,
    );
    expect(result.ok).toBe(true);
  });

  it('accepts each allowed type with its matching extension', () => {
    const cases: Array<[string, string]> = [
      ['photo.jpg', 'image/jpeg'],
      ['photo.jpeg', 'image/jpeg'],
      ['photo.png', 'image/png'],
      ['photo.heic', 'image/heic'],
      ['photo.webp', 'image/webp'],
      [
        'form.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      ['sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ['data.csv', 'text/csv'],
      ['notes.txt', 'text/plain'],
    ];
    for (const [filename, contentType] of cases) {
      const result = validateUploadRequest({ filename, contentType, byteSize: 1000 }, MAX_BYTES);
      expect(result.ok, `${filename} / ${contentType} should be accepted`).toBe(true);
    }
  });
});
