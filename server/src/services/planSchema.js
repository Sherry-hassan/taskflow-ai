import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

// The concrete plan-suggestion output schema (openapi.yaml's PlanArtifact
// deliberately left `validatedOutput`'s per-type shape generic — "an
// implementation-plan-level detail once the AI orchestration module's
// prompt/response contract is built, not a v1 API-contract commitment").
// Defined here, at that implementation layer, per CLAUDE.md rule 7: AI output
// is untrusted input, validated against a defined schema before use.
export const PLAN_SUGGESTION_SCHEMA = {
  type: 'object',
  required: ['tasks'],
  additionalProperties: false,
  properties: {
    tasks: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['title'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          assigneeId: { type: ['string', 'null'] },
        },
      },
    },
  },
};

const validate = ajv.compile(PLAN_SUGGESTION_SCHEMA);

// Parses rawOutput as JSON and validates it against the schema above. Returns
// { valid: false } for anything that isn't valid JSON matching the schema —
// never throws, so callers always get a definite valid/invalid answer.
export function parseAndValidatePlanSuggestion(rawOutput) {
  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    return { valid: false };
  }
  const valid = validate(parsed);
  return valid ? { valid: true, data: parsed } : { valid: false };
}
