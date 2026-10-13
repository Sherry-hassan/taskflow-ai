import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

// The concrete progress-summary output schema (openapi.yaml's SummaryArtifact
// deliberately leaves validatedOutput's per-type shape generic — same
// implementation-plan-level detail as planSchema.js/riskSchema.js). Defined
// here per CLAUDE.md rule 7: AI output is untrusted input, validated against a
// defined schema before use.
export const SUMMARY_SCHEMA = {
  type: 'object',
  required: ['summary', 'highlights'],
  additionalProperties: false,
  properties: {
    summary: { type: 'string', minLength: 1 },
    highlights: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
  },
};

const validate = ajv.compile(SUMMARY_SCHEMA);

// Parses rawOutput as JSON and validates it against the schema above. Returns
// { valid: false } for anything that isn't valid JSON matching the schema —
// never throws, so callers always get a definite valid/invalid answer.
export function parseAndValidateSummary(rawOutput) {
  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    return { valid: false };
  }
  const valid = validate(parsed);
  return valid ? { valid: true, data: parsed } : { valid: false };
}
