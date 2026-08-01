import { pool } from '../db/pool.js';

export interface AiSettingsRow {
  id: number;
  user_id: number;
  base_url: string;
  model: string | null;
  updated_at: Date;
}

export async function getAiSettings(userId: number): Promise<AiSettingsRow> {
  const { rows } = await pool.query<AiSettingsRow>('SELECT * FROM ai_settings WHERE user_id = $1', [
    userId,
  ]);
  return rows[0];
}

export async function updateAiSettings(
  userId: number,
  input: { base_url: string; model: string | null }
): Promise<AiSettingsRow> {
  const { rows } = await pool.query<AiSettingsRow>(
    `UPDATE ai_settings SET base_url = $1, model = $2, updated_at = now()
     WHERE user_id = $3 RETURNING *`,
    [input.base_url, input.model, userId]
  );
  return rows[0];
}
