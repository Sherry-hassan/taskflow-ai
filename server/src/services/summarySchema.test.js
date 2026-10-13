import { describe, expect, it } from 'vitest';
import { parseAndValidateSummary } from './summarySchema.js';

describe('parseAndValidateSummary (CLAUDE.md rule 7 — AI output is untrusted input)', () => {
  it('accepts a well-formed progress summary', () => {
    const result = parseAndValidateSummary(
      JSON.stringify({ summary: 'On track overall', highlights: ['3 tasks completed this week'] }),
    );
    expect(result.valid).toBe(true);
    expect(result.data.highlights).toHaveLength(1);
  });

  it('accepts an empty highlights array (nothing notable)', () => {
    const result = parseAndValidateSummary(JSON.stringify({ summary: 'Quiet week', highlights: [] }));
    expect(result.valid).toBe(true);
  });

  it('rejects output that is not valid JSON at all', () => {
    const result = parseAndValidateSummary('not json');
    expect(result.valid).toBe(false);
  });

  it('rejects valid JSON missing the required summary field', () => {
    const result = parseAndValidateSummary(JSON.stringify({ highlights: [] }));
    expect(result.valid).toBe(false);
  });

  it('rejects valid JSON missing the required highlights field', () => {
    const result = parseAndValidateSummary(JSON.stringify({ summary: 'ok' }));
    expect(result.valid).toBe(false);
  });

  it('rejects a highlight entry that is not a string', () => {
    const result = parseAndValidateSummary(JSON.stringify({ summary: 'ok', highlights: [{ note: 'x' }] }));
    expect(result.valid).toBe(false);
  });

  it('rejects unexpected extra top-level properties (strict schema)', () => {
    const result = parseAndValidateSummary(JSON.stringify({ summary: 'ok', highlights: [], extra: 'field' }));
    expect(result.valid).toBe(false);
  });
});
