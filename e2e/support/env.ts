import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

// Everything that ties this suite to a particular stack lives here, as an env var with a default
// for today's SvelteKit build. Running the suite against a different build should mean changing
// these values, never the specs.

export const E2E_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(E2E_ROOT, '..');
/** Working directory for the app servers: holds the upload dirs (and `public/`, if a build needs one). */
export const SERVER_DIR = path.join(E2E_ROOT, '.server');

// Pick up E2E_* overrides from the repo's .env. Only those keys: the app's own secrets (AI keys,
// DATABASE_URL) must not leak into the servers, since the minimal one has to run without them.
try {
  const dotenv = parseEnv(fs.readFileSync(path.join(REPO_ROOT, '.env'), 'utf8'));
  for (const [key, value] of Object.entries(dotenv)) {
    if (key.startsWith('E2E_') && process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // No .env: defaults and the shell environment apply.
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  return raw ? Number(raw) : fallback;
}

const appPort = intEnv('E2E_APP_PORT', 3100);
const minimalPort = intEnv('E2E_MINIMAL_APP_PORT', 3101);
const fakesPort = intEnv('E2E_FAKES_PORT', 4100);
const browserPort = intEnv('E2E_BROWSER_PORT', 4200);

export const env = {
  /** The fully configured app: AI + email pointed at the fakes server. */
  baseUrl: `http://localhost:${appPort}`,
  appPort,
  /** Same build, but with no AI keys and no email configured. */
  minimalBaseUrl: `http://localhost:${minimalPort}`,
  minimalPort,
  fakesUrl: `http://127.0.0.1:${fakesPort}`,
  fakesPort,
  /** CloakBrowser's CDP endpoint, the full app's browser fallback for URL import. */
  browserCdpUrl: `http://127.0.0.1:${browserPort}`,
  browserPort,
  databaseUrl: process.env.E2E_DATABASE_URL ?? 'postgres://chef:changeme@localhost:5432/yumbry_e2e',
  /** Starts one app server; PORT and the rest of the config arrive as env vars. */
  serverCmd: process.env.E2E_SERVER_CMD ?? `bun ${path.join(REPO_ROOT, 'scripts/serve.ts')}`,
  /** Brings an empty database up to the current schema; DATABASE_URL is set for it. */
  migrateCmd: process.env.E2E_MIGRATE_CMD ?? 'bun run db:migrate',
  /** Built SPA assets the server serves from `<cwd>/public`. Empty string skips the copy: the
   * SvelteKit build serves its own assets. */
  publicDir: process.env.E2E_PUBLIC_DIR ?? '',
  /** Polled until it answers 2xx before tests start. */
  readyPath: process.env.E2E_READY_PATH ?? '/api/health',
};

/** Model ids handed to the app, so specs can assert which tier served a request. */
export const MODELS = {
  big: 'e2e/big',
  medium: 'e2e/medium',
  small: 'e2e-small',
  image: 'e2e/image',
} as const;

/** Per-user daily AI cap the full app runs with; ai-budget.spec seeds spend past it. */
export const USER_DAILY_BUDGET_USD = 1;
