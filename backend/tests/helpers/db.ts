import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, '../..');

/** Drops and recreates the public schema, then re-applies every Prisma
 * migration from scratch — each test file's beforeAll gets a pristine
 * database. Used instead of a shared fixture DB because these tests truncate
 * and mutate freely; see vitest.config.ts's fileParallelism:false, which is
 * what makes running this concurrently across test files safe. */
export async function resetTestDatabase(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  } finally {
    await pool.end();
  }

  execSync('npx prisma migrate deploy', {
    cwd: BACKEND_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'ignore',
  });
}
