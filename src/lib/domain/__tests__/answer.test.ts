import { describe, expect, it } from 'vitest';
import { validateAnswer, isStoredAnswer, type AnswerableRequirement } from '../answer';

function req(overrides: Partial<AnswerableRequirement> = {}): AnswerableRequirement {
  return { answerFieldType: 'short_text', required: true, options: null, ...overrides };
}

describe('validateAnswer — short_text', () => {
  it('accepts a valid trimmed value', () => {
    const result = validateAnswer(req(), '  Acme Traders  ');
    expect(result).toEqual({ ok: true, value: { fieldType: 'short_text', text: 'Acme Traders' } });
  });

  it('rejects empty when required', () => {
    const result = validateAnswer(req({ required: true }), '   ');
    expect(result.ok).toBe(false);
  });

  it('rejects empty when optional too (use "not applicable" instead)', () => {
    const result = validateAnswer(req({ required: false }), '');
    expect(result.ok).toBe(false);
  });

  it('rejects over 200 characters', () => {
    const result = validateAnswer(req(), 'a'.repeat(201));
    expect(result.ok).toBe(false);
  });

  it('accepts exactly 200 characters', () => {
    const result = validateAnswer(req(), 'a'.repeat(200));
    expect(result.ok).toBe(true);
  });
});

describe('validateAnswer — long_text', () => {
  const longReq = req({ answerFieldType: 'long_text' });

  it('accepts a valid value', () => {
    const result = validateAnswer(longReq, 'Some explanation.');
    expect(result).toEqual({
      ok: true,
      value: { fieldType: 'long_text', text: 'Some explanation.' },
    });
  });

  it('rejects over 5000 characters', () => {
    const result = validateAnswer(longReq, 'a'.repeat(5001));
    expect(result.ok).toBe(false);
  });

  it('accepts exactly 5000 characters', () => {
    const result = validateAnswer(longReq, 'a'.repeat(5000));
    expect(result.ok).toBe(true);
  });

  it('rejects empty', () => {
    expect(validateAnswer(longReq, '').ok).toBe(false);
  });
});

describe('validateAnswer — date', () => {
  const dateReq = req({ answerFieldType: 'date' });

  it('accepts a valid calendar date', () => {
    const result = validateAnswer(dateReq, '2026-03-15');
    expect(result).toEqual({ ok: true, value: { fieldType: 'date', date: '2026-03-15' } });
  });

  it('rejects a malformed date (Feb 30)', () => {
    expect(validateAnswer(dateReq, '2026-02-30').ok).toBe(false);
  });

  it('rejects Feb 29 on a non-leap year', () => {
    expect(validateAnswer(dateReq, '2026-02-29').ok).toBe(false);
  });

  it('accepts Feb 29 on a leap year', () => {
    expect(validateAnswer(dateReq, '2028-02-29').ok).toBe(true);
  });

  it('rejects a date before 1900', () => {
    expect(validateAnswer(dateReq, '1899-12-31').ok).toBe(false);
  });

  it('rejects a date more than 100 years in the future', () => {
    const farFuture = new Date();
    farFuture.setUTCFullYear(farFuture.getUTCFullYear() + 101);
    const raw = farFuture.toISOString().slice(0, 10);
    expect(validateAnswer(dateReq, raw).ok).toBe(false);
  });

  it('rejects a non-date string', () => {
    expect(validateAnswer(dateReq, 'not-a-date').ok).toBe(false);
  });

  it('rejects empty', () => {
    expect(validateAnswer(dateReq, '').ok).toBe(false);
  });
});

describe('validateAnswer — choice', () => {
  const choiceReq = req({
    answerFieldType: 'choice',
    options: ['Sole proprietorship', 'Partnership', 'Corporation'],
  });

  it('accepts a value in the options list', () => {
    const result = validateAnswer(choiceReq, 'Partnership');
    expect(result).toEqual({
      ok: true,
      value: {
        fieldType: 'choice',
        choice: 'Partnership',
        options: ['Sole proprietorship', 'Partnership', 'Corporation'],
      },
    });
  });

  it('rejects a value not in the options list', () => {
    expect(validateAnswer(choiceReq, 'LLC').ok).toBe(false);
  });

  it('rejects when options is null (misconfigured requirement)', () => {
    const result = validateAnswer(req({ answerFieldType: 'choice', options: null }), 'Partnership');
    expect(result.ok).toBe(false);
  });

  it('rejects when options is an empty array', () => {
    const result = validateAnswer(req({ answerFieldType: 'choice', options: [] }), 'Partnership');
    expect(result.ok).toBe(false);
  });

  it('rejects empty', () => {
    expect(validateAnswer(choiceReq, '').ok).toBe(false);
  });
});

describe('validateAnswer — yes_no', () => {
  const yesNoReq = req({ answerFieldType: 'yes_no' });

  it('accepts "yes"', () => {
    expect(validateAnswer(yesNoReq, 'yes')).toEqual({ ok: true, value: { fieldType: 'yes_no', yes: true } });
  });

  it('accepts "no"', () => {
    expect(validateAnswer(yesNoReq, 'no')).toEqual({
      ok: true,
      value: { fieldType: 'yes_no', yes: false },
    });
  });

  it('rejects an arbitrary string', () => {
    expect(validateAnswer(yesNoReq, 'maybe').ok).toBe(false);
  });

  it('rejects empty', () => {
    expect(validateAnswer(yesNoReq, '').ok).toBe(false);
  });
});

describe('isStoredAnswer', () => {
  it('accepts a well-formed short_text answer', () => {
    expect(
      isStoredAnswer({
        fieldType: 'short_text',
        text: 'hi',
        requirementId: 'r1',
        answeredAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('accepts a well-formed choice answer', () => {
    expect(
      isStoredAnswer({
        fieldType: 'choice',
        choice: 'A',
        options: ['A', 'B'],
        requirementId: 'r1',
        answeredAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('accepts a well-formed not_applicable answer', () => {
    expect(
      isStoredAnswer({
        fieldType: 'not_applicable',
        declaredBy: 'party',
        requirementId: 'r1',
        answeredAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('rejects missing requirementId', () => {
    expect(isStoredAnswer({ fieldType: 'short_text', text: 'hi', answeredAt: '2026-01-01' })).toBe(
      false,
    );
  });

  it('rejects an unknown fieldType', () => {
    expect(
      isStoredAnswer({ fieldType: 'nonsense', requirementId: 'r1', answeredAt: '2026-01-01' }),
    ).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isStoredAnswer('a string')).toBe(false);
    expect(isStoredAnswer(null)).toBe(false);
    expect(isStoredAnswer(undefined)).toBe(false);
  });
});
