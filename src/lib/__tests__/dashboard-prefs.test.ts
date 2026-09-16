import { describe, expect, it } from 'vitest';
import { parseDashboardView, parseHiddenColumns, serializeHiddenColumns } from '../dashboard-prefs';

describe('parseDashboardView', () => {
  it('defaults to the table view for a missing or unknown value', () => {
    expect(parseDashboardView(undefined)).toBe('table');
    expect(parseDashboardView('grid')).toBe('table');
    expect(parseDashboardView('table')).toBe('table');
  });

  it('remembers the list view', () => {
    expect(parseDashboardView('list')).toBe('list');
  });
});

describe('hidden columns', () => {
  it('hides Open for and Created when the browser has never customised the table', () => {
    expect(parseHiddenColumns(undefined)).toEqual(['daysOpen', 'createdAt']);
  });

  it('treats an empty cookie as "show every column"', () => {
    expect(parseHiddenColumns('')).toEqual([]);
  });

  it('drops columns that cannot be hidden or do not exist, and duplicates', () => {
    expect(parseHiddenColumns('dueAt,select,actions,bogus,dueAt,recipient')).toEqual(['dueAt', 'recipient']);
    expect(serializeHiddenColumns(['name', 'activity', 'activity'])).toBe('activity');
  });
});
