/**
 * `cn` exists so a caller's className always wins. These tests pin that, including for the brand
 * scales that Tailwind's default conflict map does not know about.
 */

import { cn } from './cn.js';

describe('cn', () => {
  it('joins class names and drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('lets the last conflicting utility win, so a caller can override a component', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6');
    expect(cn('bg-surface', 'bg-accent')).toBe('bg-accent');
  });

  it('resolves conflicts in the brand type scale', () => {
    expect(cn('text-base', 'text-4xl')).toBe('text-4xl');
    expect(cn('text-5xl', 'text-sm')).toBe('text-sm');
  });

  it('resolves conflicts in the brand radius and shadow scales', () => {
    expect(cn('rounded-md', 'rounded-pill')).toBe('rounded-pill');
    expect(cn('shadow-sm', 'shadow-card')).toBe('shadow-card');
  });

  it('keeps a colour utility and a size utility side by side', () => {
    expect(cn('text-credit', 'text-sm')).toBe('text-credit text-sm');
  });

  it('accepts arrays and conditional objects', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
  });
});
