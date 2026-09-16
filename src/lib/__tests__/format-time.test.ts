import { describe, expect, it } from 'vitest';
import { daysOpen, formatRelative } from '../format-time';

const NOW = new Date('2026-09-16T12:00:00.000Z');

function minutesAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60_000);
}

describe('formatRelative', () => {
  it('says "just now" for anything under a minute', () => {
    expect(formatRelative(minutesAgo(0.5), NOW)).toBe('just now');
    expect(formatRelative(new Date(NOW.getTime() + 30_000), NOW)).toBe('just now');
  });

  it('shows minutes ago under an hour', () => {
    expect(formatRelative(minutesAgo(5), NOW)).toBe('5 min ago');
    expect(formatRelative(minutesAgo(59), NOW)).toBe('59 min ago');
  });

  it('shows a future time in minutes', () => {
    expect(formatRelative(new Date(NOW.getTime() + 12 * 60_000), NOW)).toBe('in 12 min');
  });

  it('shows hours ago under a day', () => {
    expect(formatRelative(minutesAgo(3 * 60), NOW)).toBe('3 hours ago');
  });

  it('shows "yesterday" for one day ago', () => {
    expect(formatRelative(minutesAgo(24 * 60), NOW)).toBe('yesterday');
  });

  it('shows days ago under a week', () => {
    expect(formatRelative(minutesAgo(4 * 24 * 60), NOW)).toBe('4 days ago');
  });

  it('falls back to a short date at a week or more', () => {
    const result = formatRelative(minutesAgo(8 * 24 * 60), NOW);
    expect(result).not.toMatch(/ago$/);
    expect(result).toContain('2026');
  });
});

describe('daysOpen', () => {
  it('is zero for a case created moments ago', () => {
    expect(daysOpen(minutesAgo(5), NOW)).toBe(0);
  });

  it('counts whole days only', () => {
    expect(daysOpen(minutesAgo(3 * 24 * 60 + 30), NOW)).toBe(3);
  });

  it('never goes negative for a future date', () => {
    expect(daysOpen(new Date(NOW.getTime() + 60_000), NOW)).toBe(0);
  });
});
