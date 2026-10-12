import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './email.js';

describe('normalizeEmail (FR-091, US-013)', () => {
  it('case-folds and trims so equivalent inputs produce the same key', () => {
    expect(normalizeEmail('Jane@Example.com')).toBe('jane@example.com');
    expect(normalizeEmail('  jane@example.com ')).toBe('jane@example.com');
    expect(normalizeEmail('Jane@Example.com')).toBe(normalizeEmail('  jane@example.com '));
  });
});
