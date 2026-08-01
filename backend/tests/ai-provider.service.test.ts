import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiProviderError,
  chatWithAi,
  listAiModels,
  resolveBaseUrl,
} from '../src/services/ai-provider.service.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('resolveBaseUrl', () => {
  it('returns the stored base_url when present, normalized', () => {
    expect(resolveBaseUrl('ollama', 'http://localhost:11434/v1/')).toBe(
      'http://localhost:11434/v1'
    );
  });

  it('falls back to each hosted provider default when base_url is null', () => {
    expect(resolveBaseUrl('openai', null)).toBe('https://api.openai.com/v1');
    expect(resolveBaseUrl('anthropic', null)).toBe('https://api.anthropic.com/v1');
    expect(resolveBaseUrl('gemini', null)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai'
    );
    expect(resolveBaseUrl('ollama', null)).toBe('http://localhost:11434/v1');
  });

  it('throws for a custom provider with no base_url', () => {
    expect(() => resolveBaseUrl('custom', null)).toThrow();
  });
});

describe('chatWithAi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the assistant message content on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ choices: [{ message: { content: 'Here is a recipe.' } }] })
        )
    );

    const reply = await chatWithAi([{ role: 'user', content: 'hi' }], {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: null,
      model: 'llama3.1',
    });

    expect(reply).toBe('Here is a recipe.');
  });

  it('calls the chat completions endpoint with the given model and messages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: null,
      model: 'llama3.1',
      jsonMode: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'llama3.1',
      response_format: { type: 'json_object' },
    });
  });

  it('throws an unreachable AiProviderError when the connection fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], {
        provider: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: null,
        model: 'llama3.1',
      })
    ).rejects.toMatchObject({ kind: 'unreachable' } satisfies Partial<AiProviderError>);
  });

  it('throws a bad_status AiProviderError for a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad key' } }, 401))
    );

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], {
        provider: 'openai',
        baseUrl: null,
        apiKey: 'sk-bad',
        model: 'gpt-4o-mini',
      })
    ).rejects.toMatchObject({ kind: 'bad_status', message: expect.stringContaining('bad key') });
  });

  it('throws a malformed_response AiProviderError when message.content is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: {} }] })));

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], {
        provider: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: null,
        model: 'llama3.1',
      })
    ).rejects.toMatchObject({ kind: 'malformed_response' });
  });
});

describe('listAiModels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the model list on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ data: [{ id: 'llama3.1:8b' }, { id: 'mistral:7b' }] }))
    );

    const models = await listAiModels({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: null,
    });
    expect(models).toEqual([{ name: 'llama3.1:8b' }, { name: 'mistral:7b' }]);
  });

  it('filters out malformed entries in the models array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'llama3.1:8b' }, { oops: true }] }))
    );

    const models = await listAiModels({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: null,
    });
    expect(models).toEqual([{ name: 'llama3.1:8b' }]);
  });

  it('throws an unreachable AiProviderError when the connection fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(
      listAiModels({ provider: 'openai', baseUrl: null, apiKey: 'sk-x' })
    ).rejects.toMatchObject({ kind: 'unreachable' });
  });

  it('throws a bad_status AiProviderError for a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 404)));

    await expect(
      listAiModels({ provider: 'openai', baseUrl: null, apiKey: 'sk-x' })
    ).rejects.toMatchObject({ kind: 'bad_status' });
  });
});
