# End-to-end tests

Playwright specs that drive the production build in a real browser, with the database and a fake
for every external service. Specs are `*.e2e.ts` files that sit next to the route they cover
(`src/routes/login/login.e2e.ts`); flows that span routes sit in the nearest common folder, and
cross-cutting ones live here in `src/e2e/`. The shared helpers (`support/`), the fakes server and
the scripts are in this folder too.

## Running

```sh
docker compose up -d db          # any Postgres works; see E2E_DATABASE_URL below
bun run e2e:build                # builds the SvelteKit app
bun run e2e                      # resets the e2e database, starts the servers, runs every spec
bun run e2e:ui                   # the same, in Playwright's UI mode
```

The first time, install the browser with `bunx playwright install chromium`. Everything runs on
Bun. Extra arguments go to Playwright (`bun run e2e --headed`).

`bun run e2e` drops and recreates the `E2E_DATABASE_URL` database (default
`postgres://chef:changeme@localhost:5432/yumbry_e2e`). It refuses to touch a database whose name
contains neither `e2e` nor `test`.

To run one spec against an already-migrated database:

```sh
E2E_SKIP_DB_RESET=1 bun --bun playwright test src/routes/login/login.e2e.ts
```

Type checking and linting are part of the root `bun run check` and `bun run lint`.

## What runs

`src/e2e/scripts/prepare.ts` recreates and migrates the database, empties `.e2e/server/` (the app servers'
working directory), and downloads the CloakBrowser binary on first run (~200 MB, cached in
`~/.cloakbrowser`).
Playwright then starts four processes:

| Process     | Port | What it is                                                                       |
| ----------- | ---- | -------------------------------------------------------------------------------- |
| fakes       | 4100 | `src/e2e/fakes/server.ts`: OpenRouter, Gemini, Resend and recipe websites        |
| browser     | 4200 | `src/e2e/scripts/cdp-browser.ts`: CloakBrowser over CDP, the URL-import fallback |
| full app    | 3100 | The production build with AI and email pointed at the fakes                      |
| minimal app | 3101 | The same build with no AI, email or browser (`*.minimal.e2e.ts` only)            |

Every test signs up its own users. Data is siloed per family, so tests never see each other's
data and run in parallel without any cleanup between them.

## Writing specs

- **Act through the UI.** Seed data with `support/db.ts`, act through pages, and assert on the UI
  or, where the UI can't show it, on the database. Direct HTTP calls are for `/api/auth/*`,
  `/api/health` and `/uploads/*` (see `http-contract.e2e.ts`).
- **Prefer accessible selectors:** `getByRole`, `getByLabel`, `getByText` and `getByPlaceholder`,
  with English strings. If an element has no accessible name, fix the app.
- **Wait for the new page after client-side navigation.** The URL changes before the old page
  unmounts, so wait for something on the new page before you fill or click.
- **Script the fakes by key.** The `key` fixture is unique per test. Put it in a prompt or a
  recipe title, and `fakes.queue(key, …)` answers only the LLM request that contains it.
  Unkeyed requests get the defaults in `fakes/defaults.ts`.
- **Every test signs up its own users**, so tests run in parallel without cleanup.
- Files ending in `.minimal.e2e.ts` run only against the minimal app (no AI, email or browser).
- Files ending in `.ratelimit.e2e.ts` run only against an app with its rate limits on (every other
  server has them off). Limiters count per client address, so each test there spends a different one.

## Configuration

Stack settings live in `support/env.ts` (ports, database, how the servers start). The environment
each app server receives is `appEnv` in the root `playwright.config.ts`. The test-only variables
the app honours are `OPENROUTER_BASE_URL`, `GEMINI_BASE_URL`, `RESEND_BASE_URL`,
`E2E_SAFE_FETCH_ALLOW` and `DISABLE_RATE_LIMITS`.
