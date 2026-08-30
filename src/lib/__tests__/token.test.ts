import { describe, expect, it } from 'vitest';
import { generateAccessToken, hashAccessToken } from '../token';

describe('token', () => {
  it('produces a token whose hash matches hashAccessToken', () => {
    const { token, tokenHash } = generateAccessToken();
    expect(hashAccessToken(token)).toBe(tokenHash);
  });

  it('never returns the raw token equal to its own hash', () => {
    const { token, tokenHash } = generateAccessToken();
    expect(token).not.toBe(tokenHash);
  });

  it('generates distinct tokens on each call', () => {
    const a = generateAccessToken();
    const b = generateAccessToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});
