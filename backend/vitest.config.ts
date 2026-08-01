import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Multiple test files now migrate/reset the same TEST_DATABASE_URL in their
    // own beforeAll/beforeEach (recipes.api.test.ts, ai-settings.service.test.ts,
    // ai.api.test.ts). Running them concurrently races on Postgres advisory
    // locks during migration and on table truncation between tests, so all
    // test files run sequentially instead.
    fileParallelism: false,
  },
});
