// Runs before `playwright test`: gives the app servers a pristine database and the built SPA.
// Kept out of Playwright's globalSetup because web servers start before it, and dropping the
// schema under a running server leaves its connection pool holding stale prepared statements.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { env, REPO_ROOT, SERVER_DIR } from '../support/env.ts';

async function resetDatabase(): Promise<void> {
  const url = new URL(env.databaseUrl);
  const dbName = url.pathname.slice(1);
  // This drops the whole public schema. Refuse anything that doesn't look like a throwaway DB.
  if (!/e2e|test/i.test(dbName)) {
    throw new Error(`Refusing to reset "${dbName}": E2E_DATABASE_URL must name an e2e/test DB.`);
  }

  const adminUrl = new URL(env.databaseUrl);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      dbName,
    ]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  const db = new pg.Client({ connectionString: env.databaseUrl });
  await db.connect();
  try {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  } finally {
    await db.end();
  }

  execSync(env.migrateCmd, {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: env.databaseUrl },
    stdio: 'inherit',
  });
}

function preparePublicDir(): void {
  fs.rmSync(SERVER_DIR, { recursive: true, force: true });
  fs.mkdirSync(SERVER_DIR, { recursive: true });
  if (!env.publicDir) return;
  if (!fs.existsSync(path.join(env.publicDir, 'index.html'))) {
    throw new Error(
      `No built SPA at ${env.publicDir}. Run \`npm run e2e:build\` from the repo root first.`
    );
  }
  fs.cpSync(env.publicDir, path.join(SERVER_DIR, 'public'), { recursive: true });
}

preparePublicDir();
if (process.env.E2E_SKIP_DB_RESET !== '1') await resetDatabase();
