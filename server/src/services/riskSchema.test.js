import { describe, expect, it } from 'vitest';
import { parseAndValidateRiskAssessment } from './riskSchema.js';

describe('parseAndValidateRiskAssessment (CLAUDE.md rule 7 — AI output is untrusted input)', () => {
  it('accepts a well-formed risk assessment', () => {
    const result = parseAndValidateRiskAssessment(
      JSON.stringify({ summary: 'Mostly on track', risks: [{ description: 'Scope creep', severity: 'medium' }] }),
    );
    expect(result.valid).toBe(true);
    expect(result.data.risks).toHaveLength(1);
  });

  it('accepts an empty risks array (no risks identified)', () => {
    const result = parseAndValidateRiskAssessment(JSON.stringify({ summary: 'No risks found', risks: [] }));
    expect(result.valid).toBe(true);
  });

  it('rejects output that is not valid JSON at all', () => {
    const result = parseAndValidateRiskAssessment('not json');
    expect(result.valid).toBe(false);
  });

  it('rejects valid JSON missing the required summary field', () => {
    const result = parseAndValidateRiskAssessment(JSON.stringify({ risks: [] }));
    expect(result.valid).toBe(false);
  });

  it('rejects valid JSON missing the required risks field', () => {
    const result = parseAndValidateRiskAssessment(JSON.stringify({ summary: 'ok' }));
    expect(result.valid).toBe(false);
  });

  it('rejects a risk entry with an invalid severity value', () => {
    const result = parseAndValidateRiskAssessment(
      JSON.stringify({ summary: 'ok', risks: [{ description: 'x', severity: 'catastrophic' }] }),
    );
    expect(result.valid).toBe(false);
  });

  it('rejects a risk entry missing a description', () => {
    const result = parseAndValidateRiskAssessment(
      JSON.stringify({ summary: 'ok', risks: [{ severity: 'low' }] }),
    );
    expect(result.valid).toBe(false);
  });

  it('rejects unexpected extra top-level properties (strict schema)', () => {
    const result = parseAndValidateRiskAssessment(
      JSON.stringify({ summary: 'ok', risks: [], extra: 'field' }),
    );
    expect(result.valid).toBe(false);
  });
});
