import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { runner } from 'node-pg-migrate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('ai-settings.service', () => {
  let pool: pg.Pool;
  let getAiSettings: typeof import('../src/services/ai-settings.service.js').getAiSettings;
  let updateAiSettings: typeof import('../src/services/ai-settings.service.js').updateAiSettings;
  let seedAiSettingsFromEnv: typeof import('../src/services/ai-settings.service.js').seedAiSettingsFromEnv;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

    await runner({
      databaseUrl: TEST_DATABASE_URL,
      dir: path.join(__dirname, '../migrations'),
      direction: 'up',
      migrationsTable: 'pgmigrations',
      log: () => {},
    });

    ({ getAiSettings, updateAiSettings, seedAiSettingsFromEnv } =
      await import('../src/services/ai-settings.service.js'));
  });

  afterAll(async () => {
    await pool.end();
  });

  afterEach(async () => {
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    await pool.query(
      "UPDATE ai_settings SET base_url = 'http://localhost:11434', model = NULL WHERE id = 1"
    );
  });

  it('returns the migration-seeded placeholder row', async () => {
    const settings = await getAiSettings();
    expect(settings).toMatchObject({ id: 1, base_url: 'http://localhost:11434', model: null });
  });

  it('persists an update', async () => {
    const updated = await updateAiSettings({
      base_url: 'http://192.168.1.50:11434',
      model: 'llama3.1:8b',
    });
    expect(updated).toMatchObject({ base_url: 'http://192.168.1.50:11434', model: 'llama3.1:8b' });

    const fetched = await getAiSettings();
    expect(fetched).toMatchObject({ base_url: 'http://192.168.1.50:11434', model: 'llama3.1:8b' });
  });

  it('seeds base_url/model from env only while still at the placeholder', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama.local:11434';
    process.env.OLLAMA_MODEL = 'mistral:7b';

    await seedAiSettingsFromEnv();
    expect(await getAiSettings()).toMatchObject({
      base_url: 'http://ollama.local:11434',
      model: 'mistral:7b',
    });
  });

  it('does not overwrite a value already set via updateAiSettings', async () => {
    await updateAiSettings({ base_url: 'http://manually-set:11434', model: 'manual-model' });

    process.env.OLLAMA_BASE_URL = 'http://ollama.local:11434';
    process.env.OLLAMA_MODEL = 'mistral:7b';
    await seedAiSettingsFromEnv();

    expect(await getAiSettings()).toMatchObject({
      base_url: 'http://manually-set:11434',
      model: 'manual-model',
    });
  });
});
