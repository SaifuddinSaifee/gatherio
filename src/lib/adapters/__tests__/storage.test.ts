import { describe, expect, it } from 'vitest';
import { contentDispositionHeader } from '../storage';

describe('contentDispositionHeader', () => {
  it('falls back to a bare attachment when there is no filename', () => {
    expect(contentDispositionHeader()).toBe('attachment');
  });

  it('quotes a plain ASCII filename and includes the RFC 5987 form', () => {
    expect(contentDispositionHeader('statement.pdf')).toBe(
      "attachment; filename=\"statement.pdf\"; filename*=UTF-8''statement.pdf",
    );
  });

  it('percent-encodes non-ASCII characters in the RFC 5987 form', () => {
    const header = contentDispositionHeader('résumé.pdf');
    expect(header).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.pdf");
    // The quoted fallback keeps non-ASCII clients from choking on raw UTF-8 bytes.
    expect(header).toContain('filename="r_sum_.pdf"');
  });

  it('neutralizes quotes and control characters so the header cannot be split or forged', () => {
    const header = contentDispositionHeader('evil".pdf\r\nX-Injected: 1');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain("filename=\"evil'.pdf__X-Injected: 1\"");
  });
});
