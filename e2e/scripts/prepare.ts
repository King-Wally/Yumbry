// Runs before `playwright test`: gives the app servers a pristine database (and the built SPA, if
// the build needs one copied).
// Kept out of Playwright's globalSetup because web servers start before it, and dropping the
// schema under a running server leaves its connection pool holding stale prepared statements.
import { execSync } from 'node:child_process';
import { ensureBinary } from 'cloakbrowser';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { env, REPO_ROOT, SERVER_DIR } from '../support/env.ts';

async function resetDatabase(): Promise<void> {
  const url = new URL(env.databaseUrl);
  const dbName = url.pathname.slice(1);
  // This drops the whole database. Refuse anything that doesn't look like a throwaway DB.
  if (!/e2e|test/i.test(dbName)) {
    throw new Error(`Refusing to reset "${dbName}": E2E_DATABASE_URL must name an e2e/test DB.`);
  }

  // Recreate the database rather than one schema: stacks keep migration history in different
  // places (Prisma in public._prisma_migrations, Drizzle in its own drizzle schema), and a
  // leftover history would make the migrate command skip everything.
  const adminUrl = new URL(env.databaseUrl);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
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
      `No built SPA at ${env.publicDir}. Run \`bun run e2e:build\` from the repo root first.`
    );
  }
  fs.cpSync(env.publicDir, path.join(SERVER_DIR, 'public'), { recursive: true });
}

preparePublicDir();
if (process.env.E2E_SKIP_DB_RESET !== '1') await resetDatabase();
// The browser binary (~200 MB, cached in ~/.cloakbrowser) downloads on first use. Do it here,
// not inside the browser web server, whose startup has a timeout.
await ensureBinary();
