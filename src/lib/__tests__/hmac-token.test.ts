import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signHmacToken, verifyHmacToken } from '../hmac-token';

const SECRET = 'test-secret-not-for-production-000000000000';

interface Payload {
  hello: string;
  n: number;
}

describe('signHmacToken / verifyHmacToken', () => {
  it('round-trips a payload', () => {
    const token = signHmacToken<Payload>({ hello: 'world', n: 42 }, SECRET);
    const result = verifyHmacToken<Payload>(token, SECRET);
    expect(result).toEqual({ ok: true, payload: { hello: 'world', n: 42 } });
  });

  it('rejects a token signed with a different secret', () => {
    const token = signHmacToken<Payload>({ hello: 'world', n: 42 }, 'a-different-secret');
    const result = verifyHmacToken<Payload>(token, SECRET);
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a token with no "." separator', () => {
    const result = verifyHmacToken<Payload>('not-a-real-token', SECRET);
    expect(result).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects a token with a tampered body but original signature', () => {
    const token = signHmacToken<Payload>({ hello: 'world', n: 42 }, SECRET);
    const [, sig] = token.split('.');
    const tamperedBody = Buffer.from(JSON.stringify({ hello: 'evil', n: 42 })).toString(
      'base64url',
    );
    const result = verifyHmacToken<Payload>(`${tamperedBody}.${sig}`, SECRET);
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a body that decodes but is not valid JSON, even with a correct signature', () => {
    const body = Buffer.from('not json at all').toString('base64url');
    const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
    const result = verifyHmacToken<Payload>(`${body}.${sig}`, SECRET);
    expect(result).toEqual({ ok: false, reason: 'malformed' });
  });
});
