import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    constructor() {
      this.messages = { create: createMock };
    }
  },
}));

describe('aiProvider.callClaude (never calls the real Anthropic API in tests)', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
    createMock.mockReset();
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
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
});
