import Anthropic from '@anthropic-ai/sdk';

// The sole code path in this application that calls the Claude API
// (system-design.md §12). Never called for real in any automated test
// (test-strategy.md §7) — tests mock this module's exported function.
export class AIProviderError extends Error {}

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  return new Anthropic({ apiKey });
}

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 2048;

export async function callClaude(prompt) {
  try {
    const client = getClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content?.[0]?.text ?? '';
  } catch (err) {
    // Category A (system-design.md §9): provider/network/timeout failure — no
    // model response was obtained at all. Wrapped so callers can distinguish
    // this from Category B (schema-invalid output) without inspecting the
    // Anthropic SDK's own error shape directly.
    throw new AIProviderError(err.message);
  }
}
