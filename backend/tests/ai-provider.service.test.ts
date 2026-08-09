import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_ENVELOPE_JSON_SCHEMA } from 'yumbry-shared';
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

  it('calls the chat completions endpoint with the given model, messages and JSON schema', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: null,
      model: 'llama3.1',
      jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'llama3.1',
      response_format: { type: 'json_schema', json_schema: { name: 'recipe_chat_turn' } },
    });
  });

  it('sends no response_format when no JSON schema is requested', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: null,
      model: 'llama3.1',
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toBeUndefined();
  });

  it('falls back to plain JSON mode when the provider rejects the json_schema request shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'unsupported' } }, 400))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: '{"reply":"hi"}' } }] })
      );
    vi.stubGlobal('fetch', fetchMock);

    const reply = await chatWithAi([{ role: 'user', content: 'hi' }], {
      provider: 'anthropic',
      baseUrl: null,
      apiKey: 'sk-x',
      model: 'claude-sonnet-5',
      jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
    });

    expect(reply).toBe('{"reply":"hi"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format.type).toBe('json_schema');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toEqual({
      type: 'json_object',
    });
  });

  it('does not downgrade for errors other than a rejected request shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: 'server exploded' } }, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], {
        provider: 'openai',
        baseUrl: null,
        apiKey: 'sk-x',
        model: 'gpt-4o-mini',
        jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
      })
    ).rejects.toMatchObject({ kind: 'bad_status' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the downgraded call’s own failure rather than retrying further', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'unsupported' } }, 400))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'bad key' } }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], {
        provider: 'openai',
        baseUrl: null,
        apiKey: 'sk-bad',
        model: 'gpt-4o-mini',
        jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
      })
    ).rejects.toMatchObject({ kind: 'bad_status', message: expect.stringContaining('bad key') });

    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('sends only the standard sampling fields to a provider without llama.cpp/Ollama extensions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], {
      provider: 'openai',
      baseUrl: null,
      apiKey: 'sk-x',
      model: 'gpt-4o-mini',
      sampling: { temperature: 0.6, top_p: 0.95, top_k: 64, min_p: 0, repeat_penalty: 1.0 },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.6);
    expect(body.top_p).toBe(0.95);
    expect(body.top_k).toBeUndefined();
    expect(body.min_p).toBeUndefined();
    expect(body.repeat_penalty).toBeUndefined();
  });

  it('sends the extended sampler fields to ollama', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], {
      provider: 'ollama',
      baseUrl: null,
      apiKey: null,
      model: 'llama3.1',
      sampling: { temperature: 0.6, top_p: 0.95, top_k: 64, min_p: 0, repeat_penalty: 1.0 },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      temperature: 0.6,
      top_p: 0.95,
      top_k: 64,
      min_p: 0,
      repeat_penalty: 1.0,
    });
  });

  it('drops sampling on the final retry if the json_object-with-sampling call also rejects the request shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'unsupported schema' } }, 400))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'unsupported sampling' } }, 400))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: '{"reply":"hi"}' } }] })
      );
    vi.stubGlobal('fetch', fetchMock);

    const reply = await chatWithAi([{ role: 'user', content: 'hi' }], {
      provider: 'custom',
      baseUrl: 'http://example.test/v1',
      apiKey: 'sk-x',
      model: 'some-model',
      jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
      sampling: { temperature: 0.6, top_p: 0.95, top_k: 64, min_p: 0, repeat_penalty: 1.0 },
    });

    expect(reply).toBe('{"reply":"hi"}');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format.type).toBe('json_schema');
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.response_format).toEqual({ type: 'json_object' });
    expect(secondBody.temperature).toBe(0.6);
    const thirdBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(thirdBody.response_format).toEqual({ type: 'json_object' });
    expect(thirdBody.temperature).toBeUndefined();
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
