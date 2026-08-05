import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Multiple test files now migrate/reset the same TEST_DATABASE_URL in their
    // own beforeAll/beforeEach (recipes.api.test.ts, ai-settings.service.test.ts,
    // ai.api.test.ts). Running them concurrently races on Postgres advisory
    // locks during migration and on table truncation between tests, so all
    // test files run sequentially instead.
    fileParallelism: false,
    env: {
      // utils/jwt.ts throws at import time if this is unset; tests never touch
      // a real deployment secret so a fixed test-only value is fine here.
      JWT_SECRET: 'test-jwt-secret-not-for-production',
      // utils/crypto.ts throws at import time if this is unset; must decode to
      // exactly 32 bytes (base64) — this is a fixed test-only value.
      AI_SETTINGS_ENCRYPTION_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
      // services/email.service.ts throws at import time if these are unset.
      // Real sends never happen in tests — auth-reset.api.test.ts mocks
      // sendPasswordResetEmail — these just need to satisfy the fail-fast check.
      RESEND_API_KEY: 'test-resend-api-key-not-for-production',
      EMAIL_FROM: 'Yumbry <no-reply@test.local>',
      APP_BASE_URL: 'http://localhost:5173',
    },
  },
});
