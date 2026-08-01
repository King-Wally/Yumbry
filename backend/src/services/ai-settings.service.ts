import { pool } from '../db/pool.js';

export interface AiSettingsRow {
  id: number;
  base_url: string;
  model: string | null;
  updated_at: Date;
}

const PLACEHOLDER_BASE_URL = 'http://localhost:11434';

export async function getAiSettings(): Promise<AiSettingsRow> {
  const { rows } = await pool.query<AiSettingsRow>('SELECT * FROM ai_settings WHERE id = 1');
  return rows[0];
}

export async function updateAiSettings(input: {
  base_url: string;
  model: string | null;
}): Promise<AiSettingsRow> {
  const { rows } = await pool.query<AiSettingsRow>(
    `UPDATE ai_settings SET base_url = $1, model = $2, updated_at = now()
     WHERE id = 1 RETURNING *`,
    [input.base_url, input.model]
  );
  return rows[0];
}

/** Seeds base_url/model from OLLAMA_BASE_URL/OLLAMA_MODEL on process startup,
 * but only while the row is still at its migration-inserted placeholder —
 * never overwrites a value already set via the Settings page. */
export async function seedAiSettingsFromEnv(): Promise<void> {
  const envBaseUrl = process.env.OLLAMA_BASE_URL;
  const envModel = process.env.OLLAMA_MODEL;

  if (envBaseUrl) {
    await pool.query('UPDATE ai_settings SET base_url = $1 WHERE id = 1 AND base_url = $2', [
      envBaseUrl,
      PLACEHOLDER_BASE_URL,
    ]);
  }

  if (envModel) {
    await pool.query('UPDATE ai_settings SET model = $1 WHERE id = 1 AND model IS NULL', [
      envModel,
    ]);
  }
}
