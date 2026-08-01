import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatWithOllama, listOllamaModels, OllamaError } from '../src/services/ollama.service.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('chatWithOllama', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the assistant message content on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ message: { content: 'Here is a recipe.' } }))
    );

    const reply = await chatWithOllama([{ role: 'user', content: 'hi' }], {
      baseUrl: 'http://localhost:11434',
      model: 'llama3.1',
    });

    expect(reply).toBe('Here is a recipe.');
  });

  it('sends stream:false and the given model/format to /api/chat', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: { content: 'ok' } }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithOllama([{ role: 'user', content: 'hi' }], {
      baseUrl: 'http://localhost:11434/',
      model: 'llama3.1',
      format: 'json',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ model: 'llama3.1', stream: false, format: 'json' });
  });

  it('throws an unreachable OllamaError when fetch rejects (connection refused)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(
      chatWithOllama([{ role: 'user', content: 'hi' }], {
        baseUrl: 'http://localhost:11434',
        model: 'llama3.1',
      })
    ).rejects.toMatchObject({ kind: 'unreachable' } satisfies Partial<OllamaError>);
  });

  it('throws a timeout OllamaError when the request exceeds timeoutMs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener('abort', () => {
            const err = new Error('This operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      })
    );

    await expect(
      chatWithOllama([{ role: 'user', content: 'hi' }], {
        baseUrl: 'http://localhost:11434',
        model: 'llama3.1',
        timeoutMs: 10,
      })
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('throws a bad_status OllamaError for a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Internal error', { status: 500 }))
    );

    await expect(
      chatWithOllama([{ role: 'user', content: 'hi' }], {
        baseUrl: 'http://localhost:11434',
        model: 'llama3.1',
      })
    ).rejects.toMatchObject({ kind: 'bad_status' });
  });

  it('throws a malformed_response OllamaError when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 200 })));

    await expect(
      chatWithOllama([{ role: 'user', content: 'hi' }], {
        baseUrl: 'http://localhost:11434',
        model: 'llama3.1',
      })
    ).rejects.toMatchObject({ kind: 'malformed_response' });
  });

  it('throws a malformed_response OllamaError when message.content is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: {} })));

    await expect(
      chatWithOllama([{ role: 'user', content: 'hi' }], {
        baseUrl: 'http://localhost:11434',
        model: 'llama3.1',
      })
    ).rejects.toMatchObject({ kind: 'malformed_response' });
  });

  it('surfaces the model-not-found message from a JSON error body as bad_status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: "model 'ghost' not found" }, 404))
    );

    await expect(
      chatWithOllama([{ role: 'user', content: 'hi' }], {
        baseUrl: 'http://localhost:11434',
        model: 'ghost',
      })
    ).rejects.toMatchObject({
      kind: 'bad_status',
      message: expect.stringContaining("model 'ghost' not found"),
    });
  });
});

describe('listOllamaModels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the model list on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ models: [{ name: 'llama3.1:8b' }, { name: 'mistral:7b' }] })
        )
    );

    const models = await listOllamaModels('http://localhost:11434');
    expect(models).toEqual([{ name: 'llama3.1:8b' }, { name: 'mistral:7b' }]);
  });

  it('filters out malformed entries in the models array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ models: [{ name: 'llama3.1:8b' }, { oops: true }] }))
    );

    const models = await listOllamaModels('http://localhost:11434');
    expect(models).toEqual([{ name: 'llama3.1:8b' }]);
  });

  it('throws an unreachable OllamaError when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(listOllamaModels('http://localhost:11434')).rejects.toMatchObject({
      kind: 'unreachable',
    });
  });

  it('throws a bad_status OllamaError for a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));

    await expect(listOllamaModels('http://localhost:11434')).rejects.toMatchObject({
      kind: 'bad_status',
    });
  });

  it('throws a malformed_response OllamaError when models is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ models: 'nope' })));

    await expect(listOllamaModels('http://localhost:11434')).rejects.toMatchObject({
      kind: 'malformed_response',
    });
  });
});
