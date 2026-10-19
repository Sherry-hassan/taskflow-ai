import { AIProviderError } from './aiProviderError.js';

// Ollama has no Anthropic Messages-API-compatible endpoint — only its own
// native /api/chat (and a separate OpenAI-compatible surface this app does
// not use), so this calls that native API directly rather than reusing the
// Anthropic SDK. format: 'json' asks the model to constrain generation to
// valid JSON; the caller (aiOrchestrationService.js etc.) still runs its own
// ajv schema validation on the result exactly as it does for Anthropic.
const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen3:8b';
// qwen3 is a "thinking" model: left to itself it can spend tens of seconds of
// hidden reasoning tokens even on a simple prompt (observed: a non-reasoning
// JSON completion that runs ~35-50s with think:false ran well past 180s
// without it, on CPU-only inference with no GPU offload). think: false skips
// that phase; the default timeout is still generous because even the
// non-reasoning path is slow on CPU-only hardware.
const DEFAULT_TIMEOUT_MS = 120_000;

export async function callOllama(prompt) {
  const baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.OLLAMA_MODEL || DEFAULT_MODEL;
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        format: 'json',
        stream: false,
        think: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // Category A (system-design.md §9): provider/network/timeout failure —
    // connection refused (Ollama not running), DNS failure, or our own
    // AbortController timeout all land here.
    if (err.name === 'AbortError') {
      throw new AIProviderError(`Ollama request timed out after ${timeoutMs}ms`);
    }
    throw new AIProviderError(`Failed to reach Ollama at ${baseUrl}: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    // Most commonly a 404 because OLLAMA_MODEL was never pulled.
    throw new AIProviderError(
      `Ollama returned ${response.status} for model "${model}": ${body || response.statusText}`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw new AIProviderError(`Ollama returned a non-JSON response: ${err.message}`);
  }

  const text = payload?.message?.content;
  if (typeof text !== 'string' || text.length === 0) {
    throw new AIProviderError('Ollama response did not contain message.content');
  }
  return text;
}
