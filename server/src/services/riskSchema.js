import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

// The concrete risk-assessment output schema (openapi.yaml's RiskArtifact
// deliberately leaves `validatedOutput`'s per-type shape generic — same
// implementation-plan-level detail as planSchema.js's PLAN_SUGGESTION_SCHEMA).
// Defined here per CLAUDE.md rule 7: AI output is untrusted input, validated
// against a defined schema before use.
export const RISK_ASSESSMENT_SCHEMA = {
  type: 'object',
  required: ['summary', 'risks'],
  additionalProperties: false,
  properties: {
    summary: { type: 'string', minLength: 1 },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'severity'],
        additionalProperties: false,
        properties: {
          description: { type: 'string', minLength: 1 },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
  },
};

const validate = ajv.compile(RISK_ASSESSMENT_SCHEMA);

// Parses rawOutput as JSON and validates it against the schema above. Returns
// { valid: false } for anything that isn't valid JSON matching the schema —
// never throws, so callers always get a definite valid/invalid answer.
export function parseAndValidateRiskAssessment(rawOutput) {
  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    return { valid: false };
  }
  const valid = validate(parsed);
  return valid ? { valid: true, data: parsed } : { valid: false };
}
