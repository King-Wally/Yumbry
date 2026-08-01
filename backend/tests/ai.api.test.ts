import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import type { Express } from 'express';
import { registerTestUser } from './helpers/auth.js';
import { resetTestDatabase } from './helpers/db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

const { chatWithOllama, listOllamaModels } = vi.hoisted(() => ({
  chatWithOllama: vi.fn(),
  listOllamaModels: vi.fn(),
}));

vi.mock('../src/services/ollama.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/ollama.service.js')>();
  return { ...actual, chatWithOllama, listOllamaModels };
});

describe.skipIf(!TEST_DATABASE_URL)('AI API', () => {
  let app: Express;
  let pool: pg.Pool;
  let agent: Awaited<ReturnType<typeof registerTestUser>>['agent'];
  let userId: number;
  let OllamaError: typeof import('../src/services/ollama.service.js').OllamaError;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    await resetTestDatabase(TEST_DATABASE_URL as string);
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

    ({ app } = await import('../src/app.js'));
    ({ OllamaError } = await import('../src/services/ollama.service.js'));
    ({ agent, userId } = await registerTestUser(app));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE recipes, ingredients, instructions, tags, recipe_tags, categories RESTART IDENTITY CASCADE'
    );
    await pool.query(
      "UPDATE ai_settings SET base_url = 'http://localhost:11434', model = NULL WHERE user_id = $1",
      [userId]
    );
  });

  afterEach(() => {
    chatWithOllama.mockReset();
    listOllamaModels.mockReset();
  });

  describe('GET/PUT /api/ai/settings', () => {
    it('round-trips settings', async () => {
      const getRes = await agent.get('/api/ai/settings');
      expect(getRes.status).toBe(200);
      expect(getRes.body).toMatchObject({ base_url: 'http://localhost:11434', model: null });

      const putRes = await agent
        .put('/api/ai/settings')
        .send({ base_url: 'http://192.168.1.50:11434', model: 'llama3.1:8b' });
      expect(putRes.status).toBe(200);
      expect(putRes.body).toMatchObject({
        base_url: 'http://192.168.1.50:11434',
        model: 'llama3.1:8b',
      });

      const getAfter = await agent.get('/api/ai/settings');
      expect(getAfter.body).toMatchObject({
        base_url: 'http://192.168.1.50:11434',
        model: 'llama3.1:8b',
      });
    });

    it('rejects an invalid base_url with 400', async () => {
      const res = await agent.put('/api/ai/settings').send({ base_url: 'not-a-url', model: 'x' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/ai/settings/models', () => {
    it('returns the model list on success', async () => {
      listOllamaModels.mockResolvedValue([{ name: 'llama3.1:8b' }]);
      const res = await agent.get('/api/ai/settings/models');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ models: [{ name: 'llama3.1:8b' }] });
    });

    it('maps an unreachable OllamaError to 502', async () => {
      listOllamaModels.mockRejectedValue(new OllamaError('nope', 'unreachable'));
      const res = await agent.get('/api/ai/settings/models');
      expect(res.status).toBe(502);
      expect(res.body.kind).toBe('unreachable');
    });
  });

  describe('POST /api/ai/chat', () => {
    it('returns 409 when no model is configured', async () => {
      const res = await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'a spicy curry' }], current_draft: null });
      expect(res.status).toBe(409);
    });

    it('returns the envelope shape once a model is configured', async () => {
      await agent
        .put('/api/ai/settings')
        .send({ base_url: 'http://localhost:11434', model: 'llama3.1' });
      chatWithOllama.mockResolvedValue(
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
      await agent
        .put('/api/ai/settings')
        .send({ base_url: 'http://localhost:11434', model: 'llama3.1' });
      chatWithOllama.mockResolvedValue(
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

      const promptMessages = chatWithOllama.mock.calls[0][0];
      expect(JSON.stringify(promptMessages)).toContain('Mild Curry');
    });

    it('sends a "no recipe draft yet" marker when current_draft is null', async () => {
      await agent
        .put('/api/ai/settings')
        .send({ base_url: 'http://localhost:11434', model: 'llama3.1' });
      chatWithOllama.mockResolvedValue(
        JSON.stringify({ reply: 'What would you like?', recipe: { title: 'Untitled recipe' } })
      );

      await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'hi' }], current_draft: null });

      const promptMessages = chatWithOllama.mock.calls[0][0];
      expect(JSON.stringify(promptMessages)).toContain('no recipe draft yet');
    });

    it('returns 502 when the model response is not parseable JSON', async () => {
      await agent
        .put('/api/ai/settings')
        .send({ base_url: 'http://localhost:11434', model: 'llama3.1' });
      chatWithOllama.mockResolvedValue('Sorry, I cannot do that.');

      const res = await agent
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'hi' }], current_draft: null });

      expect(res.status).toBe(502);
      expect(res.body.kind).toBe('malformed_response');
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
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/ai/settings');
    expect(res.status).toBe(401);
  });

  it("does not let one user read or overwrite another user's AI settings", async () => {
    await agent
      .put('/api/ai/settings')
      .send({ base_url: 'http://owner-only:11434', model: 'owner-model' });

    const { agent: otherAgent } = await registerTestUser(app);

    const otherGet = await otherAgent.get('/api/ai/settings');
    expect(otherGet.body).toMatchObject({ base_url: 'http://localhost:11434', model: null });

    await otherAgent
      .put('/api/ai/settings')
      .send({ base_url: 'http://attacker:11434', model: 'attacker-model' });

    const ownerGet = await agent.get('/api/ai/settings');
    expect(ownerGet.body).toMatchObject({
      base_url: 'http://owner-only:11434',
      model: 'owner-model',
    });
  });
});
