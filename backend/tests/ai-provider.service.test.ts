import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_ENVELOPE_JSON_SCHEMA } from 'yumbry-shared';
import { chatWithAi } from '../src/services/ai-provider.service.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('chatWithAi', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.GEMINI_MODEL_BIG;
    delete process.env.GEMINI_MODEL_SMALL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL_BIG;
    delete process.env.GEMINI_MODEL_SMALL;
  });

  it('throws a not_configured AiProviderError when GEMINI_API_KEY is unset', async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(chatWithAi([{ role: 'user', content: 'hi' }], {})).rejects.toMatchObject({
      kind: 'not_configured',
    });
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

    const reply = await chatWithAi([{ role: 'user', content: 'hi' }], {});

    expect(reply).toBe('Here is a recipe.');
  });

  it('calls Gemini with the default model, messages and JSON schema', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], { jsonSchema: AI_ENVELOPE_JSON_SCHEMA });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'gemini-3.5-flash-lite',
      response_format: { type: 'json_schema', json_schema: { name: 'recipe_chat_turn' } },
    });
  });

  it('uses GEMINI_MODEL_SMALL when set', async () => {
    process.env.GEMINI_MODEL_SMALL = 'gemini-2.5-pro';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], {});

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('gemini-2.5-pro');
  });

  it('uses the big model for the big tier, from GEMINI_MODEL_BIG or its default', async () => {
    // A Response body can only be read once, so hand each call a fresh one.
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], { tier: 'big' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('gemini-3.6-flash');

    process.env.GEMINI_MODEL_BIG = 'gemini-9-ultra';
    await chatWithAi([{ role: 'user', content: 'hi' }], { tier: 'big' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('gemini-9-ultra');
  });

  it('retries the big tier on the small model when the big model is rate limited', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'quota exceeded' } }, 429))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await chatWithAi([{ role: 'user', content: 'hi' }], { tier: 'big' });

    expect(reply).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('gemini-3.6-flash');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('gemini-3.5-flash-lite');
  });

  it('treats a RESOURCE_EXHAUSTED 403 as a quota error rather than a request-shape rejection', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'RESOURCE_EXHAUSTED' } }, 403))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await chatWithAi([{ role: 'user', content: 'hi' }], {
      tier: 'big',
      jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
    });

    expect(reply).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('gemini-3.5-flash-lite');
    // The quota-shaped failure must not be spent on the response_format downgrade ladder.
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format.type).toBe('json_schema');
  });

  it('does not fall back to the small model for non-quota failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: 'server exploded' } }, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], { tier: 'big' })
    ).rejects.toMatchObject({ kind: 'bad_status' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the small model’s failure when the fallback attempt also fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'quota exceeded' } }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'quota exceeded' } }, 429));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], { tier: 'big' })
    ).rejects.toMatchObject({ kind: 'bad_status' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends no response_format when no JSON schema is requested', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], {});

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toBeUndefined();
  });

  it('falls back to plain JSON mode when the endpoint rejects the json_schema request shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'unsupported' } }, 400))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: '{"reply":"hi"}' } }] })
      );
    vi.stubGlobal('fetch', fetchMock);

    const reply = await chatWithAi([{ role: 'user', content: 'hi' }], {
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
      chatWithAi([{ role: 'user', content: 'hi' }], { jsonSchema: AI_ENVELOPE_JSON_SCHEMA })
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
      chatWithAi([{ role: 'user', content: 'hi' }], { jsonSchema: AI_ENVELOPE_JSON_SCHEMA })
    ).rejects.toMatchObject({ kind: 'bad_status', message: expect.stringContaining('bad key') });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws an unreachable AiProviderError when the connection fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(chatWithAi([{ role: 'user', content: 'hi' }], {})).rejects.toMatchObject({
      kind: 'unreachable',
    });
  });

  it('throws a bad_status AiProviderError for a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad key' } }, 401))
    );

    await expect(chatWithAi([{ role: 'user', content: 'hi' }], {})).rejects.toMatchObject({
      kind: 'bad_status',
      message: expect.stringContaining('bad key'),
    });
  });

  it('throws a malformed_response AiProviderError when message.content is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: {} }] })));

    await expect(chatWithAi([{ role: 'user', content: 'hi' }], {})).rejects.toMatchObject({
      kind: 'malformed_response',
    });
  });

  it('sends the standard sampling fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], {
      sampling: { temperature: 0.6, topP: 0.95 },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.6);
    expect(body.topP).toBe(0.95);
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
      jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
      sampling: { temperature: 0.6, topP: 0.95 },
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
