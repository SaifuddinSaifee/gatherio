import { describe, expect, it } from 'vitest';
import { clientIp, userAgent } from '../request-context';

function headersWith(xForwardedFor?: string, ua?: string): Headers {
  const h = new Headers();
  if (xForwardedFor !== undefined) h.set('x-forwarded-for', xForwardedFor);
  if (ua !== undefined) h.set('user-agent', ua);
  return h;
}

describe('clientIp', () => {
  it('takes the first address from a comma-separated list', () => {
    expect(clientIp(headersWith('203.0.113.7, 70.41.3.18'))).toBe('203.0.113.7');
  });

  it('returns undefined for non-address values like "unknown"', () => {
    expect(clientIp(headersWith('unknown'))).toBeUndefined();
  });

  it('accepts a bare IPv6 address', () => {
    expect(clientIp(headersWith('::1'))).toBe('::1');
  });

  it('strips an IPv4 port suffix', () => {
    expect(clientIp(headersWith('1.2.3.4:5678'))).toBe('1.2.3.4');
  });

  it('strips a bracketed IPv6 port suffix', () => {
    expect(clientIp(headersWith('[::1]:8080'))).toBe('::1');
  });

  it('returns undefined when the header is absent', () => {
    expect(clientIp(headersWith())).toBeUndefined();
  });

  it('returns undefined for an out-of-range IPv4 octet', () => {
    expect(clientIp(headersWith('999.0.0.1'))).toBeUndefined();
  });

  it('trims whitespace around the first entry', () => {
    expect(clientIp(headersWith('  10.0.0.5  , 10.0.0.6'))).toBe('10.0.0.5');
  });
});

describe('userAgent', () => {
  it('returns the header value', () => {
    expect(userAgent(headersWith(undefined, 'Mozilla/5.0'))).toBe('Mozilla/5.0');
  });

  it('returns undefined when absent', () => {
    expect(userAgent(headersWith())).toBeUndefined();
  });
});
