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
  let registerUser: typeof import('../src/services/auth.service.js').registerUser;
  let userId: number;

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

    ({ getAiSettings, updateAiSettings } = await import('../src/services/ai-settings.service.js'));
    ({ registerUser } = await import('../src/services/auth.service.js'));

    const user = await registerUser('ai-settings-test@example.com', 'password123');
    userId = user!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  afterEach(async () => {
    await pool.query(
      "UPDATE ai_settings SET base_url = 'http://localhost:11434', model = NULL WHERE user_id = $1",
      [userId]
    );
  });

  it("returns the user's placeholder row created at registration", async () => {
    const settings = await getAiSettings(userId);
    expect(settings).toMatchObject({
      user_id: userId,
      base_url: 'http://localhost:11434',
      model: null,
    });
  });

  it('persists an update', async () => {
    const updated = await updateAiSettings(userId, {
      base_url: 'http://192.168.1.50:11434',
      model: 'llama3.1:8b',
    });
    expect(updated).toMatchObject({ base_url: 'http://192.168.1.50:11434', model: 'llama3.1:8b' });

    const fetched = await getAiSettings(userId);
    expect(fetched).toMatchObject({ base_url: 'http://192.168.1.50:11434', model: 'llama3.1:8b' });
  });
});
