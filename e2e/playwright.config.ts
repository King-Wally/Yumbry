import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { env, MODELS, SERVER_DIR, USER_DAILY_BUDGET_USD } from './support/env.ts';

const CI = Boolean(process.env.CI);

/**
 * Configuration handed to each app server. This is the env contract the app must honour — a port
 * to another stack keeps these names. The *_BASE_URL, E2E_SAFE_FETCH_ALLOW and DISABLE_RATE_LIMITS
 * vars exist only for this suite and are unset in production.
 */
function appEnv(opts: { port: number; baseUrl: string; ai: boolean; email: boolean }) {
  return {
    NODE_ENV: 'production',
    PORT: String(opts.port),
    DATABASE_URL: env.databaseUrl,
    BETTER_AUTH_URL: opts.baseUrl,
    BETTER_AUTH_SECRET: 'e2e-better-auth-secret-not-for-production',
    APP_BASE_URL: opts.baseUrl,
    COOKIE_SECURE: 'false',
    UPLOADS_DIR: path.join(SERVER_DIR, `uploads-${opts.port}`),
    DISABLE_RATE_LIMITS: '1',

    // Empty strings, not absent keys: the app loads a .env file that must not fill these in with
    // real credentials.
    OPENROUTER_API_KEY: opts.ai ? 'e2e-openrouter-key' : '',
    GEMINI_API_KEY: opts.ai ? 'e2e-gemini-key' : '',
    OPENROUTER_BASE_URL: `${env.fakesUrl}/openrouter`,
    GEMINI_BASE_URL: `${env.fakesUrl}/gemini/`,
    AI_MODEL_BIG: MODELS.big,
    AI_MODEL_MEDIUM: MODELS.medium,
    AI_MODEL_SMALL: MODELS.small,
    AI_MODEL_IMAGE: MODELS.image,
    AI_MONTHLY_BUDGET_USD: '100000',
    AI_USER_DAILY_BUDGET_USD: String(USER_DAILY_BUDGET_USD),

    RESEND_API_KEY: opts.email ? 're_e2e_dummy_key' : '',
    RESEND_BASE_URL: `${env.fakesUrl}/resend`,
    EMAIL_FROM: opts.email ? 'Yumbry <no-reply@e2e.test>' : '',

    E2E_SAFE_FETCH_ALLOW: `127.0.0.1:${env.fakesPort}`,
  };
}

function appServer(opts: { port: number; baseUrl: string; ai: boolean; email: boolean }) {
  return {
    command: env.serverCmd,
    cwd: SERVER_DIR,
    url: `${opts.baseUrl}${env.readyPath}`,
    env: appEnv(opts),
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
  };
}

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  expect: { timeout: 10_000 },
  use: {
    baseURL: env.baseUrl,
    locale: 'en-US',
    // The production build registers a PWA service worker; it would cache across tests.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'full',
      testIgnore: /minimal\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'minimal',
      testMatch: /minimal\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: env.minimalBaseUrl },
    },
  ],
  webServer: [
    {
      command: 'node fakes/server.ts',
      url: `${env.fakesUrl}/__control/health`,
      env: { E2E_FAKES_PORT: String(env.fakesPort) },
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    appServer({ port: env.appPort, baseUrl: env.baseUrl, ai: true, email: true }),
    appServer({ port: env.minimalPort, baseUrl: env.minimalBaseUrl, ai: false, email: false }),
  ],
});
