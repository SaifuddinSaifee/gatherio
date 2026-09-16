import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cn } from '../cn';
import { DESIGN_TOKENS } from '../design-tokens';

const REGISTERED = Object.keys(DESIGN_TOKENS) as (keyof typeof DESIGN_TOKENS)[];
// Namespaces with no tailwind-merge conflict group: used via `duration-(--…)` / `opacity-(--…)` or not at all.
const UNMERGED = ['font', 'duration', 'opacity'];

function themeTokens(): Map<string, string[]> {
  const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');
  const byNamespace = new Map<string, string[]>();
  for (const [, body = ''] of css.matchAll(/@theme[^{]*\{([\s\S]*?)\n\}/g)) {
    for (const [, name = ''] of body.matchAll(/^\s*--([a-z0-9-]+):/gm)) {
      if (!name || name.endsWith('--line-height')) continue;
      const namespace = [...REGISTERED, ...UNMERGED].find((ns) => name.startsWith(`${ns}-`));
      const key = namespace ?? name;
      const list = byNamespace.get(key) ?? [];
      list.push(namespace ? name.slice(namespace.length + 1) : name);
      byNamespace.set(key, list);
    }
  }
  return byNamespace;
}

describe('design token registry', () => {
  const tokens = themeTokens();

  it.each(REGISTERED)('lists exactly the %s tokens declared in globals.css', (namespace) => {
    expect([...DESIGN_TOKENS[namespace]].sort()).toEqual([...(tokens.get(namespace) ?? [])].sort());
  });

  it('has no @theme namespace that cn() does not know how to handle', () => {
    const unknown = [...tokens.keys()].filter((ns) => ![...REGISTERED, ...UNMERGED].includes(ns));
    expect(unknown).toEqual([]);
  });
});

describe('cn with design tokens', () => {
  it('keeps a type-scale size alongside a color', () => {
    expect(cn('text-label-small text-md-on-surface')).toBe('text-label-small text-md-on-surface');
    expect(cn('text-table-cell', 'text-md-error')).toBe('text-table-cell text-md-error');
  });

  it('still lets a later size or color override an earlier one', () => {
    expect(cn('text-button text-md-primary', 'text-button-sm')).toBe(
      'text-md-primary text-button-sm',
    );
    expect(cn('text-md-primary text-button', 'text-md-error')).toBe('text-button text-md-error');
  });

  it('resolves radius, shadow and easing tokens as their own groups', () => {
    expect(cn('rounded-sm', 'rounded-md')).toBe('rounded-md');
    expect(cn('shadow-elevation-0', 'shadow-elevation-2')).toBe('shadow-elevation-2');
    expect(cn('ease-md-standard', 'ease-linear')).toBe('ease-linear');
    expect(cn('bg-md-surface border-md-outline')).toBe('bg-md-surface border-md-outline');
  });
});
