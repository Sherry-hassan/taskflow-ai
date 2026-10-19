import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ollamaProvider.callOllama (never makes a real network call in tests)', () => {
  const originalBaseUrl = process.env.OLLAMA_BASE_URL;
  const originalModel = process.env.OLLAMA_MODEL;
  const originalTimeout = process.env.OLLAMA_TIMEOUT_MS;
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    delete process.env.OLLAMA_TIMEOUT_MS;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = originalBaseUrl;
    if (originalModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = originalModel;
    if (originalTimeout === undefined) delete process.env.OLLAMA_TIMEOUT_MS;
    else process.env.OLLAMA_TIMEOUT_MS = originalTimeout;
  });

  it('returns message.content on success, posting to the default base URL/model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{"tasks":[]}' } }),
    });
    global.fetch = fetchMock;

    const { callOllama } = await import('./ollamaProvider.js');
    const result = await callOllama('prompt');

    expect(result).toBe('{"tasks":[]}');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('qwen3:8b');
    expect(body.format).toBe('json');
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false);
  });

  it('honors OLLAMA_BASE_URL and OLLAMA_MODEL overrides', async () => {
    process.env.OLLAMA_BASE_URL = 'http://localhost:9999';
    process.env.OLLAMA_MODEL = 'llama3:70b';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{}' } }),
    });
    global.fetch = fetchMock;

    const { callOllama } = await import('./ollamaProvider.js');
    await callOllama('prompt');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:9999/api/chat');
    expect(JSON.parse(options.body).model).toBe('llama3:70b');
  });

  it('wraps a connection failure as AIProviderError (Ollama not running)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434'));

    const { callOllama } = await import('./ollamaProvider.js');
    const { AIProviderError } = await import('./aiProviderError.js');
    await expect(callOllama('prompt')).rejects.toBeInstanceOf(AIProviderError);
  });

  it('wraps a non-OK HTTP response as AIProviderError (e.g. model not pulled -> 404)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'model "qwen3:8b" not found, try pulling it first',
    });

    const { callOllama } = await import('./ollamaProvider.js');
    const { AIProviderError } = await import('./aiProviderError.js');
    await expect(callOllama('prompt')).rejects.toBeInstanceOf(AIProviderError);
    await expect(callOllama('prompt')).rejects.toThrow(/404/);
  });

  it('wraps a timeout (AbortError) as AIProviderError', async () => {
    process.env.OLLAMA_TIMEOUT_MS = '10';
    global.fetch = vi.fn().mockImplementation((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));

    const { callOllama } = await import('./ollamaProvider.js');
    const { AIProviderError } = await import('./aiProviderError.js');
    await expect(callOllama('prompt')).rejects.toBeInstanceOf(AIProviderError);
    await expect(callOllama('prompt')).rejects.toThrow(/timed out/);
  });

  it('wraps malformed JSON response body as AIProviderError', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });

    const { callOllama } = await import('./ollamaProvider.js');
    const { AIProviderError } = await import('./aiProviderError.js');
    await expect(callOllama('prompt')).rejects.toBeInstanceOf(AIProviderError);
  });

  it('wraps a response missing message.content as AIProviderError', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: {} }),
    });

    const { callOllama } = await import('./ollamaProvider.js');
    const { AIProviderError } = await import('./aiProviderError.js');
    await expect(callOllama('prompt')).rejects.toBeInstanceOf(AIProviderError);
  });
});
