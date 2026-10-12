import { describe, expect, it } from 'vitest';
import { parseAndValidatePlanSuggestion } from './planSchema.js';

describe('parseAndValidatePlanSuggestion (CLAUDE.md rule 7 — AI output is untrusted input)', () => {
  it('accepts a well-formed plan suggestion', () => {
    const result = parseAndValidatePlanSuggestion(
      JSON.stringify({ tasks: [{ title: 'Do the thing', description: 'details' }] }),
    );
    expect(result.valid).toBe(true);
    expect(result.data.tasks).toHaveLength(1);
  });

  it('accepts a minimal task (title only)', () => {
    const result = parseAndValidatePlanSuggestion(JSON.stringify({ tasks: [{ title: 'Just a title' }] }));
    expect(result.valid).toBe(true);
  });

  it('rejects output that is not valid JSON at all', () => {
    const result = parseAndValidatePlanSuggestion('not json');
    expect(result.valid).toBe(false);
  });

  it('rejects valid JSON that does not match the schema (missing tasks)', () => {
    const result = parseAndValidatePlanSuggestion(JSON.stringify({ notTasks: [] }));
    expect(result.valid).toBe(false);
  });

  it('rejects a task with no title', () => {
    const result = parseAndValidatePlanSuggestion(JSON.stringify({ tasks: [{ description: 'no title' }] }));
    expect(result.valid).toBe(false);
  });

  it('rejects an empty tasks array', () => {
    const result = parseAndValidatePlanSuggestion(JSON.stringify({ tasks: [] }));
    expect(result.valid).toBe(false);
  });

  it('rejects unexpected extra top-level properties (strict schema)', () => {
    const result = parseAndValidatePlanSuggestion(
      JSON.stringify({ tasks: [{ title: 'ok' }], extra: 'field' }),
    );
    expect(result.valid).toBe(false);
  });
});
