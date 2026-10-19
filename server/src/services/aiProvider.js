import Anthropic from '@anthropic-ai/sdk';
import { AIProviderError } from './aiProviderError.js';
import { callOllama } from './ollamaProvider.js';

// The sole code path in this application that calls an AI model
// (system-design.md §12). Never called for real in any automated test
// (test-strategy.md §7) — tests mock this module's exported function.
export { AIProviderError };

// ANTHROPIC_BASE_URL is an optional override, added for Phase 3's Playwright
// E2E harness: when set, it points this client at a local fixture server
// instead of the real Anthropic API, so no E2E run ever makes a real, paid
// API call. Unset (the default, including in every existing Vitest test and
// in a real deployment) leaves the SDK's own default endpoint untouched.
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;
  return new Anthropic({ apiKey, baseURL });
}

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 2048;

async function callAnthropic(prompt) {
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

// AI_PROVIDER selects the backend this exported callClaude() delegates to.
// Unset (the default, matching every existing deployment and test) keeps the
// Anthropic path unchanged. "ollama" is a local-development-only option
// (docs/legal/privacy-policy.md and terms-of-service.md commit production to
// Anthropic; this is intentionally not the default) that routes to a locally
// running Ollama instance instead — see ollamaProvider.js.
export async function callClaude(prompt) {
  const provider = process.env.AI_PROVIDER || 'anthropic';
  if (provider === 'ollama') {
    return callOllama(prompt);
  }
  if (provider !== 'anthropic') {
    throw new AIProviderError(`Unknown AI_PROVIDER "${provider}" (expected "anthropic" or "ollama")`);
  }
  return callAnthropic(prompt);
}
