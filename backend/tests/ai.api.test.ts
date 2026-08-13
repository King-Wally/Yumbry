import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import type { Express } from 'express';
import { registerTestUser } from './helpers/auth.js';
import { resetTestDatabase } from './helpers/db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

const { chatWithAi } = vi.hoisted(() => ({
  chatWithAi: vi.fn(),
}));

vi.mock('../src/services/ai-provider.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/ai-provider.service.js')>();
  return { ...actual, chatWithAi };
});

describe.skipIf(!TEST_DATABASE_URL)('AI API', () => {
  let app: Express;
  let pool: pg.Pool;
  let agent: Awaited<ReturnType<typeof registerTestUser>>['agent'];
  let AiProviderError: typeof import('../src/services/ai-provider.service.js').AiProviderError;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    await resetTestDatabase(TEST_DATABASE_URL as string);
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

    ({ app } = await import('../src/app.js'));
    ({ AiProviderError } = await import('../src/services/ai-provider.service.js'));
    ({ agent } = await registerTestUser(app));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE recipes, ingredients, instructions, tags, recipe_tags, categories RESTART IDENTITY CASCADE'
    );
  });

  afterEach(() => {
    chatWithAi.mockReset();
  });

  describe('GET /api/ai/status', () => {
    const originalKey = process.env.GEMINI_API_KEY;

    afterEach(() => {
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalKey;
    });

    it('reports configured: true when GEMINI_API_KEY is set', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      const res = await agent.get('/api/ai/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ configured: true });
    });

    it('reports configured: false when GEMINI_API_KEY is unset', async () => {
      delete process.env.GEMINI_API_KEY;
      const res = await agent.get('/api/ai/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ configured: false });
    });
  });

  describe('POST /api/ai/chat', () => {
    it('returns the envelope shape on success', async () => {
      chatWithAi.mockResolvedValue(
        JSON.stringify({
          reply: 'Sounds great, here is a draft.',
          recipe: {
            title: 'Spicy Curry',
            servings: 4,
            ingredients: ['1 can coconut milk'],
            instructions: ['Simmer everything.'],
            tags: ['curry'],
            category: 'Main course',
          },
        })
      );

      const res = await agent.post('/api/ai/chat').send({
        messages: [{ role: 'user', content: 'a spicy curry, serves 4' }],
        current_draft: null,
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        reply: 'Sounds great, here is a draft.',
        recipe: {
          title: 'Spicy Curry',
          servings: 4,
          ingredients: ['1 can coconut milk'],
          instructions: [{ step_number: 1, text: 'Simmer everything.' }],
          tags: ['curry'],
          category: 'Main course',
        },
      });
    });

    it('passes current_draft through into the prompt when improving an existing draft', async () => {
      chatWithAi.mockResolvedValue(
        JSON.stringify({
          reply: 'Made it spicier.',
          recipe: {
            title: 'Spicy Curry',
            servings: 4,
            ingredients: ['1 can coconut milk', '2 tbsp chili paste'],
            instructions: [],
            tags: [],
            category: null,
          },
        })
      );

      const currentDraft = {
        title: 'Mild Curry',
        description: null,
        image_path: null,
        prep_time_minutes: null,
        cook_time_minutes: null,
        total_time_minutes: null,
        servings: 4,
        ingredients: ['1 can coconut milk'],
        instructions: [],
        tags: [],
        category: null,
      };

      const res = await agent.post('/api/ai/chat').send({
        messages: [{ role: 'user', content: 'make it spicier' }],
        current_draft: currentDraft,
      });

      expect(res.status).toBe(200);
      expect(res.body.recipe.ingredients).toContain('2 tbsp chili paste');

      const promptMessages = chatWithAi.mock.calls[0][0];
      expect(JSON.stringify(promptMessages)).toContain('Mild Curry');
    });

    it('sends a "no recipe draft yet" marker when current_draft is null', async () => {
      chatWithAi.mockResolvedValue(
        JSON.stringify({ reply: 'What would you like?', recipe: { title: 'Untitled recipe' } })
      );

      await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'hi' }], current_draft: null });

      const promptMessages = chatWithAi.mock.calls[0][0];
      expect(JSON.stringify(promptMessages)).toContain('There is no recipe yet.');
    });

    it('returns 502 when the model response is not parseable JSON', async () => {
      chatWithAi.mockResolvedValue('Sorry, I cannot do that.');

      const res = await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'hi' }], current_draft: null });

      expect(res.status).toBe(502);
      expect(res.body.kind).toBe('malformed_response');
    });

    it('maps a bad_status AiProviderError from the provider to 502', async () => {
      chatWithAi.mockRejectedValue(new AiProviderError('bad key', 'bad_status'));

      const res = await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'hi' }], current_draft: null });

      expect(res.status).toBe(502);
      expect(res.body.kind).toBe('bad_status');
    });

    it('maps a not_configured AiProviderError from the provider to 503', async () => {
      chatWithAi.mockRejectedValue(new AiProviderError('no key set', 'not_configured'));

      const res = await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'hi' }], current_draft: null });

      expect(res.status).toBe(503);
      expect(res.body.kind).toBe('not_configured');
    });

    it('targets English in the prompt for a user who has never set a locale', async () => {
      chatWithAi.mockResolvedValue(
        JSON.stringify({ reply: 'Hi', recipe: { title: 'Untitled recipe' } })
      );

      await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'hi' }], current_draft: null });

      const promptMessages = chatWithAi.mock.calls[0][0];
      expect(promptMessages[0].content).toContain('is written in English');
    });

    it('targets the locale set via PATCH /api/auth/me in the prompt', async () => {
      await agent.patch('/api/auth/me').send({ locale: 'fr' });
      chatWithAi.mockResolvedValue(
        JSON.stringify({ reply: 'Bonjour', recipe: { title: 'Untitled recipe' } })
      );

      await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'hi' }], current_draft: null });

      const promptMessages = chatWithAi.mock.calls[0][0];
      expect(promptMessages[0].content).toContain('is written in French');
      // The restatement rides on the final user message, where it is read last.
      expect(promptMessages[promptMessages.length - 1].content).toContain(
        'Every human-readable value in French'
      );

      // Reset for subsequent tests in this file that assume the default locale.
      await agent.patch('/api/auth/me').send({ locale: 'en' });
    });

    it('renders the same model response in the unit system the reader chose', async () => {
      const modelResponse = JSON.stringify({
        recipe: {
          title: 'Bread',
          description: null,
          servings: 4,
          prep_time_minutes: null,
          cook_time_minutes: null,
          total_time_minutes: null,
          category: null,
          tags: [],
          ingredients: [
            { item: 'flour', quantity: 500, unit: 'g', note: null, density_key: 'flour' },
            { item: 'butter', quantity: 250, unit: 'g', note: null, density_key: 'none' },
          ],
          instructions: ['Bake at 200 °C.'],
        },
        reply: 'Here you go.',
      });

      chatWithAi.mockResolvedValue(modelResponse);
      const metric = await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'bread' }], current_draft: null });

      expect(metric.body.recipe.ingredients).toEqual(['500 g flour', '250 g butter']);
      expect(metric.body.recipe.instructions[0].text).toBe('Bake at 200 °C.');

      await agent.patch('/api/auth/me').send({ unitSystem: 'imperial' });
      chatWithAi.mockResolvedValue(modelResponse);
      const imperial = await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'bread' }], current_draft: null });

      expect(imperial.body.recipe.ingredients).toEqual(['4 cups flour', '9 oz butter']);
      expect(imperial.body.recipe.instructions[0].text).toBe('Bake at 400 °F.');

      // The prompt is the same either way: the model is never told what the reader picked.
      expect(JSON.stringify(chatWithAi.mock.calls[1][0])).toBe(
        JSON.stringify(chatWithAi.mock.calls[0][0])
      );

      await agent.patch('/api/auth/me').send({ unitSystem: 'metric' });
    });

    it('writes small amounts as millilitres when the reader asked for that', async () => {
      const modelResponse = JSON.stringify({
        recipe: {
          title: 'Pad Thai',
          description: null,
          servings: 2,
          prep_time_minutes: null,
          cook_time_minutes: null,
          total_time_minutes: null,
          category: null,
          tags: [],
          ingredients: [
            { item: 'fish sauce', quantity: 45, unit: 'ml', note: null, density_key: 'none' },
          ],
          instructions: ['Stir in the fish sauce.'],
        },
        reply: 'Here you go.',
      });

      chatWithAi.mockResolvedValue(modelResponse);
      const spoons = await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'pad thai' }], current_draft: null });
      expect(spoons.body.recipe.ingredients).toEqual(['3 tbsp fish sauce']);

      await agent.patch('/api/auth/me').send({ smallVolumes: 'millilitres' });
      chatWithAi.mockResolvedValue(modelResponse);
      const millilitres = await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'pad thai' }], current_draft: null });
      expect(millilitres.body.recipe.ingredients).toEqual(['45 ml fish sauce']);

      // Same prompt either way — this is a display preference, not something the model decides.
      expect(JSON.stringify(chatWithAi.mock.calls[1][0])).toBe(
        JSON.stringify(chatWithAi.mock.calls[0][0])
      );

      await agent.patch('/api/auth/me').send({ smallVolumes: 'spoons' });
    });

    it('accepts a draft from a client that predates the structured side-channel', async () => {
      chatWithAi.mockResolvedValue(
        JSON.stringify({ reply: 'Done.', recipe: { title: 'Curry', ingredients: ['2 eggs'] } })
      );

      const res = await agent.post('/api/ai/chat').send({
        messages: [{ role: 'user', content: 'more eggs' }],
        current_draft: {
          title: 'Curry',
          description: null,
          image_path: null,
          prep_time_minutes: null,
          cook_time_minutes: null,
          total_time_minutes: null,
          servings: 4,
          ingredients: ['1 lb chicken'],
          instructions: [],
          tags: [],
          category: null,
        },
      });

      expect(res.status).toBe(200);
      // Recovered from the rendered line and shown to the model in canonical metric.
      expect(chatWithAi.mock.calls[0][0][0].content).toContain('"quantity": 450');
    });

    it('returns 400 on a malformed request body', async () => {
      const missingCurrentDraft = await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'hi' }] });
      expect(missingCurrentDraft.status).toBe(400);

      const emptyMessages = await agent
        .post('/api/ai/chat')
        .send({ messages: [], current_draft: null });
      expect(emptyMessages.status).toBe(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'hi' }], current_draft: null });
      expect(res.status).toBe(401);
    });
  });
});
