import { describe, expect, it } from 'vitest';
import type { StoredAnswer } from '@/lib/domain/answer';
import { answerToFormValue, formatAnswerValue } from '../answer-format';

function answer(overrides: Partial<StoredAnswer> & Pick<StoredAnswer, 'fieldType'>): StoredAnswer {
  return { requirementId: 'req-1', answeredAt: '2026-01-01T00:00:00.000Z', ...overrides } as StoredAnswer;
}

describe('formatAnswerValue', () => {
  it('renders short_text and long_text as their raw text', () => {
    expect(formatAnswerValue(answer({ fieldType: 'short_text', text: 'Acme Inc' }))).toBe('Acme Inc');
    expect(formatAnswerValue(answer({ fieldType: 'long_text', text: 'A longer explanation.' }))).toBe(
      'A longer explanation.',
    );
  });

  it('renders date as the raw YYYY-MM-DD string', () => {
    expect(formatAnswerValue(answer({ fieldType: 'date', date: '2026-03-15' }))).toBe('2026-03-15');
  });

  it('renders choice as the chosen option', () => {
    expect(
      formatAnswerValue(answer({ fieldType: 'choice', choice: 'Monthly', options: ['Monthly', 'Quarterly'] })),
    ).toBe('Monthly');
  });

  it('renders yes_no as Yes or No', () => {
    expect(formatAnswerValue(answer({ fieldType: 'yes_no', yes: true }))).toBe('Yes');
    expect(formatAnswerValue(answer({ fieldType: 'yes_no', yes: false }))).toBe('No');
  });

  it('renders acknowledge as "Acknowledged" regardless of the statement text', () => {
    expect(formatAnswerValue(answer({ fieldType: 'acknowledge', acknowledged: true, statement: 'I agree.' }))).toBe(
      'Acknowledged',
    );
  });

  it('renders not_applicable as "Marked as not applicable"', () => {
    expect(formatAnswerValue(answer({ fieldType: 'not_applicable', declaredBy: 'party' }))).toBe(
      'Marked as not applicable',
    );
  });
});

describe('answerToFormValue', () => {
  it('round-trips text-like kinds back into their raw string', () => {
    expect(answerToFormValue(answer({ fieldType: 'short_text', text: 'Acme Inc' }))).toBe('Acme Inc');
    expect(answerToFormValue(answer({ fieldType: 'long_text', text: 'Longer.' }))).toBe('Longer.');
    expect(answerToFormValue(answer({ fieldType: 'date', date: '2026-03-15' }))).toBe('2026-03-15');
    expect(
      answerToFormValue(answer({ fieldType: 'choice', choice: 'Monthly', options: ['Monthly', 'Quarterly'] })),
    ).toBe('Monthly');
  });

  it('renders yes_no as the lowercase tokens AnswerField expects, not the display text', () => {
    expect(answerToFormValue(answer({ fieldType: 'yes_no', yes: true }))).toBe('yes');
    expect(answerToFormValue(answer({ fieldType: 'yes_no', yes: false }))).toBe('no');
  });

  it('returns an empty string for kinds that never reach AnswerField', () => {
    expect(answerToFormValue(answer({ fieldType: 'acknowledge', acknowledged: true, statement: 'I agree.' }))).toBe(
      '',
    );
    expect(answerToFormValue(answer({ fieldType: 'not_applicable', declaredBy: 'party' }))).toBe('');
  });
});
