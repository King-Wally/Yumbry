import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { resetTestDatabase } from './helpers/db.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('ai-settings.service', () => {
  let pool: pg.Pool;
  let getAiSettings: typeof import('../src/services/ai-settings.service.js').getAiSettings;
  let updateAiSettings: typeof import('../src/services/ai-settings.service.js').updateAiSettings;
  let getAiSettingsForCall: typeof import('../src/services/ai-settings.service.js').getAiSettingsForCall;
  let registerUser: typeof import('../src/services/auth.service.js').registerUser;
  let userId: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    await resetTestDatabase(TEST_DATABASE_URL as string);
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

    ({ getAiSettings, updateAiSettings, getAiSettingsForCall } =
      await import('../src/services/ai-settings.service.js'));
    ({ registerUser } = await import('../src/services/auth.service.js'));

    const user = await registerUser('ai-settings-test@example.com', 'password123');
    userId = user!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  afterEach(async () => {
    await pool.query(
      'UPDATE ai_settings SET provider = NULL, base_url = NULL, model = NULL, api_key_encrypted = NULL WHERE user_id = $1',
      [userId]
    );
  });

  it("returns the user's placeholder row created at registration, with no assumed provider", async () => {
    const settings = await getAiSettings(userId);
    expect(settings).toMatchObject({
      user_id: userId,
      provider: null,
      base_url: null,
      model: null,
      has_api_key: false,
    });
  });

  it('persists an update, including switching provider and base_url', async () => {
    const updated = await updateAiSettings(userId, {
      provider: 'openai',
      base_url: null,
      model: 'gpt-4o-mini',
    });
    expect(updated).toMatchObject({ provider: 'openai', base_url: null, model: 'gpt-4o-mini' });

    const fetched = await getAiSettings(userId);
    expect(fetched).toMatchObject({ provider: 'openai', base_url: null, model: 'gpt-4o-mini' });
  });

  it('encrypts the api_key at rest and never exposes it via getAiSettings', async () => {
    await updateAiSettings(userId, {
      provider: 'openai',
      base_url: null,
      model: 'gpt-4o-mini',
      api_key: 'sk-super-secret',
    });

    const settings = await getAiSettings(userId);
    expect(settings.has_api_key).toBe(true);
    expect(settings).not.toHaveProperty('api_key');

    const raw = await pool.query('SELECT api_key_encrypted FROM ai_settings WHERE user_id = $1', [
      userId,
    ]);
    expect(raw.rows[0].api_key_encrypted).not.toContain('sk-super-secret');

    const forCall = await getAiSettingsForCall(userId);
    expect(forCall.api_key).toBe('sk-super-secret');
  });

  it('leaves the stored api_key unchanged when api_key is omitted from an update', async () => {
    await updateAiSettings(userId, {
      provider: 'openai',
      base_url: null,
      model: 'gpt-4o-mini',
      api_key: 'sk-original',
    });

    await updateAiSettings(userId, { provider: 'openai', base_url: null, model: 'gpt-4o' });

    const settings = await getAiSettings(userId);
    expect(settings.has_api_key).toBe(true);
    const forCall = await getAiSettingsForCall(userId);
    expect(forCall.api_key).toBe('sk-original');
  });

  it('clears the stored api_key when api_key is explicitly set to null', async () => {
    await updateAiSettings(userId, {
      provider: 'openai',
      base_url: null,
      model: 'gpt-4o-mini',
      api_key: 'sk-original',
    });

    await updateAiSettings(userId, {
      provider: 'openai',
      base_url: null,
      model: 'gpt-4o-mini',
      api_key: null,
    });

    const settings = await getAiSettings(userId);
    expect(settings.has_api_key).toBe(false);
  });
});
