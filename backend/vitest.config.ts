import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Multiple test files now migrate/reset the same TEST_DATABASE_URL in their
    // own beforeAll/beforeEach (recipes.api.test.ts, ai.api.test.ts). Running
    // them concurrently races on Postgres advisory locks during migration and
    // on table truncation between tests, so all test files run sequentially
    // instead.
    fileParallelism: false,
    env: {
      // better-auth signs its session cookies with this. Tests never touch a real
      // deployment secret, so a fixed test-only value is fine here.
      BETTER_AUTH_SECRET: 'test-better-auth-secret-not-for-production',
      BETTER_AUTH_URL: 'http://localhost:3000',
      // services/email.service.ts reads these lazily; isEmailConfigured() needs all
      // three for /api/config to report password reset as enabled. Real sends never
      // happen in tests — auth-reset.api.test.ts mocks sendPasswordResetEmail.
      RESEND_API_KEY: 'test-resend-api-key-not-for-production',
      EMAIL_FROM: 'Yumbry <no-reply@test.local>',
      APP_BASE_URL: 'http://localhost:5173',
    },
  },
});
