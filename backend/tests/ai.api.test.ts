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
      expect(JSON.stringify(promptMessages)).toContain('no recipe draft yet');
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
      expect(promptMessages[0].content).toContain('Write "reply" in English');
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
      expect(promptMessages[0].content).toContain('Write "reply" in French');

      // Reset for subsequent tests in this file that assume the default locale.
      await agent.patch('/api/auth/me').send({ locale: 'en' });
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
