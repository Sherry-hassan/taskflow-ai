import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();
const constructorMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    constructor(options) {
      constructorMock(options);
      this.messages = { create: createMock };
    }
  },
}));

describe('aiProvider.callClaude (never calls the real Anthropic API in tests)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalBaseUrl = process.env.ANTHROPIC_BASE_URL;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
    delete process.env.ANTHROPIC_BASE_URL;
    createMock.mockReset();
    constructorMock.mockClear();
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalBaseUrl === undefined) {
      delete process.env.ANTHROPIC_BASE_URL;
    } else {
      process.env.ANTHROPIC_BASE_URL = originalBaseUrl;
    }
  });

  it('returns the response text on success', async () => {
    createMock.mockResolvedValue({ content: [{ text: '{"tasks":[]}' }] });
    const { callClaude } = await import('./aiProvider.js');
    const result = await callClaude('prompt');
    expect(result).toBe('{"tasks":[]}');
  });

  it('wraps an SDK failure as AIProviderError (Category A — provider/network failure)', async () => {
    createMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const { callClaude, AIProviderError } = await import('./aiProvider.js');
    await expect(callClaude('prompt')).rejects.toBeInstanceOf(AIProviderError);
  });

  it('throws (wrapped as AIProviderError, same as any other call failure) if ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { callClaude } = await import('./aiProvider.js');
    await expect(callClaude('prompt')).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  // Phase 3 additions: ANTHROPIC_BASE_URL is an optional override added so the
  // Playwright E2E harness can point this client at a local fixture server
  // instead of the real Anthropic API. These two tests cover the client-
  // construction seam itself, distinct from the three call-behavior tests
  // above.
  it('constructs the SDK client with no baseURL override when ANTHROPIC_BASE_URL is unset (production/default behavior unchanged)', async () => {
    createMock.mockResolvedValue({ content: [{ text: '{}' }] });
    const { callClaude } = await import('./aiProvider.js');
    await callClaude('a prompt');

    expect(constructorMock).toHaveBeenCalledWith({ apiKey: 'test-key-not-real', baseURL: undefined });
  });

  it('passes ANTHROPIC_BASE_URL through to the SDK client when set (E2E fixture-server seam)', async () => {
    process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:4010';
    createMock.mockResolvedValue({ content: [{ text: '{}' }] });
    const { callClaude } = await import('./aiProvider.js');
    await callClaude('a prompt');

    expect(constructorMock).toHaveBeenCalledWith({
      apiKey: 'test-key-not-real',
      baseURL: 'http://127.0.0.1:4010',
    });
  });
});
