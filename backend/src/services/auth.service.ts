import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { withTransaction } from '../db/transaction.js';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  created_at: Date;
}

const BCRYPT_COST_FACTOR = 12;
// Used to compare against when the email doesn't exist, so login takes the
// same amount of time either way and doesn't leak which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST_FACTOR);

const PLACEHOLDER_BASE_URL = 'http://localhost:11434';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

export function verifyPassword(password: string, hash: string | undefined): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] ?? null;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

/** Creates a user and their placeholder ai_settings row in one transaction.
 * Returns null if the email is already registered. */
export async function registerUser(email: string, password: string): Promise<UserRow | null> {
  const passwordHash = await hashPassword(password);

  return withTransaction(async (client) => {
    const { rows } = await client.query<UserRow>(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING RETURNING *`,
      [email, passwordHash]
    );
    const user = rows[0];
    if (!user) return null;

    await client.query(
      `INSERT INTO ai_settings (user_id, base_url, model) VALUES ($1, $2, NULL)`,
      [user.id, PLACEHOLDER_BASE_URL]
    );

    return user;
  });
}
