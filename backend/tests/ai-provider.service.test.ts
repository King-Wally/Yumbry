import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_ENVELOPE_JSON_SCHEMA } from 'yumbry-shared';
import { chatWithAi } from '../src/services/ai-provider.service.js';

const { recordAiUsage } = vi.hoisted(() => ({ recordAiUsage: vi.fn() }));

// The usage ledger is a database write; these tests only look at what would be written.
vi.mock('../src/services/ai-budget.service.js', () => ({ recordAiUsage }));

const USER_ID = 'user-1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('chatWithAi', () => {
  function clearAiEnv(): void {
    for (const name of Object.keys(process.env)) {
      if (
        name === 'OPENROUTER_API_KEY' ||
        name === 'GEMINI_API_KEY' ||
        name.startsWith('AI_MODEL_')
      ) {
        delete process.env[name];
      }
    }
  }

  function okFetch() {
    // A Response body can only be read once, so hand each call a fresh one.
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function bodyOf(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
    return JSON.parse(fetchMock.mock.calls[call][1].body);
  }

  beforeEach(() => {
    recordAiUsage.mockClear();
    clearAiEnv();
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearAiEnv();
  });

  it('throws a not_configured AiProviderError when OPENROUTER_API_KEY is unset', async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID })
    ).rejects.toMatchObject({
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

    const reply = await chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID });

    expect(reply).toBe('Here is a recipe.');
  });

  it('calls OpenRouter with the medium tier’s default model, messages and JSON schema', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], {
      userId: USER_ID,
      jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'google/gemini-3.5-flash-lite',
      response_format: { type: 'json_schema', json_schema: { name: 'recipe_chat_turn' } },
    });
  });

  it.each([
    ['big', 'google/gemini-3.6-flash'],
    ['medium', 'google/gemini-3.5-flash-lite'],
    ['small', 'gemini-3.5-flash-lite'],
    ['image', 'google/gemini-3.6-flash'],
  ] as const)(
    'resolves the %s tier from its own AI_MODEL_* var or default',
    async (tier, fallback) => {
      const fetchMock = okFetch();

      await chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID, tier });
      expect(bodyOf(fetchMock, 0).model).toBe(fallback);

      process.env[`AI_MODEL_${tier.toUpperCase()}`] = `vendor/${tier}-model`;
      await chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID, tier });
      expect(bodyOf(fetchMock, 1).model).toBe(`vendor/${tier}-model`);
    }
  );

  it('leaves provider routing to OpenRouter’s defaults', async () => {
    const fetchMock = okFetch();

    await chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID, tier: 'big' });

    const body = bodyOf(fetchMock);
    expect(body.models).toBeUndefined();
    expect(body.provider).toBeUndefined();
  });

  it('sends the small tier straight to Gemini, with none of OpenRouter’s routing fields', async () => {
    const fetchMock = okFetch();

    await chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID, tier: 'small' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
    const body = bodyOf(fetchMock);
    expect(body.model).toBe('gemini-3.5-flash-lite');
    expect(body.models).toBeUndefined();
    expect(body.provider).toBeUndefined();
    expect(body.reasoning).toBeUndefined();
  });

  it('throws not_configured for the small tier when GEMINI_API_KEY is unset', async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchMock = okFetch();

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID, tier: 'small' })
    ).rejects.toMatchObject({ kind: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();

    // The OpenRouter tiers are unaffected.
    await chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID, tier: 'medium' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not downgrade a Gemini quota error disguised as a 400', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: { message: 'RESOURCE_EXHAUSTED: quota exceeded' } }, 400)
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], {
        userId: USER_ID,
        tier: 'small',
        jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
      })
    ).rejects.toMatchObject({ kind: 'bad_status' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['big', { effort: 'high' }],
    ['medium', { effort: 'low' }],
    ['small', undefined],
    ['image', { effort: 'high' }],
  ] as const)('sends the %s tier’s reasoning effort', async (tier, reasoning) => {
    const fetchMock = okFetch();

    await chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID, tier });

    expect(bodyOf(fetchMock).reasoning).toEqual(reasoning);
  });

  it('does not retry on another model itself when the provider fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: 'rate limited' } }, 429));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID, tier: 'big' })
    ).rejects.toMatchObject({ kind: 'bad_status' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends no response_format when no JSON schema is requested', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID });

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
      userId: USER_ID,
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
        userId: USER_ID,
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
        userId: USER_ID,
        jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
      })
    ).rejects.toMatchObject({ kind: 'bad_status', message: expect.stringContaining('bad key') });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws an unreachable AiProviderError when the connection fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID })
    ).rejects.toMatchObject({
      kind: 'unreachable',
    });
  });

  it('throws a bad_status AiProviderError for a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad key' } }, 401))
    );

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID })
    ).rejects.toMatchObject({
      kind: 'bad_status',
      message: expect.stringContaining('bad key'),
    });
  });

  it('throws a malformed_response AiProviderError when message.content is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: {} }] })));

    await expect(
      chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID })
    ).rejects.toMatchObject({
      kind: 'malformed_response',
    });
  });

  it('sends the standard sampling fields under their wire names', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAi([{ role: 'user', content: 'hi' }], {
      userId: USER_ID,
      sampling: { temperature: 0.6, topP: 0.95 },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.6);
    expect(body.top_p).toBe(0.95);
    expect(body.topP).toBeUndefined();
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
      userId: USER_ID,
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
  describe('usage ledger', () => {
    it('records OpenRouter’s reported cost, tokens and serving model against the user', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse({
            model: 'vendor/backup',
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160, cost: 0.00042 },
          })
        )
      );

      await chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID, tier: 'big' });

      expect(recordAiUsage).toHaveBeenCalledWith({
        userId: USER_ID,
        backend: 'openrouter',
        tier: 'big',
        model: 'vendor/backup',
        promptTokens: 120,
        completionTokens: 40,
        costUsd: 0.00042,
        requestCount: 1,
      });
    });

    it('records $0 with a warning when OpenRouter reports no cost', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      okFetch();

      await chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID });

      expect(recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({ costUsd: 0 }));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('usage.cost'));
    });

    it('counts every downgrade retry as a request', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(jsonResponse({ error: { message: 'unsupported' } }, 400))
          .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '{}' } }] }))
      );

      await chatWithAi([{ role: 'user', content: 'hi' }], {
        userId: USER_ID,
        tier: 'small',
        jsonSchema: AI_ENVELOPE_JSON_SCHEMA,
      });

      expect(recordAiUsage).toHaveBeenCalledWith(
        expect.objectContaining({ backend: 'gemini', costUsd: 0, requestCount: 2 })
      );
    });

    it('records a failed Gemini call, since it still spent a request of the daily quota', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'server exploded' } }, 500))
      );

      await expect(
        chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID, tier: 'small' })
      ).rejects.toMatchObject({ kind: 'bad_status' });

      expect(recordAiUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          backend: 'gemini',
          model: 'gemini-3.5-flash-lite',
          requestCount: 1,
        })
      );
    });

    it('records nothing for a failed OpenRouter call, which is not billed', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'server exploded' } }, 500))
      );

      await expect(
        chatWithAi([{ role: 'user', content: 'hi' }], { userId: USER_ID })
      ).rejects.toMatchObject({ kind: 'bad_status' });

      expect(recordAiUsage).not.toHaveBeenCalled();
    });
  });
});
