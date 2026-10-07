# End-to-end tests

Playwright specs that describe Yumbry's behaviour from the outside: through the browser, page
URLs, the database and a fake for every external service. They are the **source of truth for how
the app behaves**, independent of how it is built: the specs don't know about SvelteKit (or the
Express and React app they were written against), so they keep working if the implementation
changes.

## Running

```sh
docker compose up -d db          # any Postgres works; see E2E_DATABASE_URL below
bun run e2e:build                # from the repo root: builds the SvelteKit app
bun run e2e                      # resets the e2e database, starts the servers, runs the allowlist
bun run e2e:all                  # the same, but every spec
bun run e2e:ui                   # every spec, in Playwright's UI mode
```

The first time, install the browser with `bunx playwright install chromium` (from `e2e/`).

While the app is being migrated, `bun run e2e` runs only the tests listed in `ported-specs.txt`:
the ones the new build already passes. Extra arguments go to Playwright
(`bun run e2e --headed`). Bun installs this package as a workspace, but Playwright, the fakes and
the scripts here run on Node.

`bun run e2e` drops and recreates the `E2E_DATABASE_URL` database (default
`postgres://chef:changeme@localhost:5432/yumbry_e2e`). It refuses to touch a database whose name
contains neither `e2e` nor `test`.

To run one spec against an already-migrated database:

```sh
cd e2e && E2E_SKIP_DB_RESET=1 bunx playwright test specs/auth.spec.ts
```

Checks for this package: `bun run --cwd e2e typecheck` and `bun run --cwd e2e lint` (Prettier
and ESLint, with this package's own config).

## What runs

`scripts/prepare.ts` recreates and migrates the database, copies a built SPA into
`.server/public` if `E2E_PUBLIC_DIR` names one, and downloads the CloakBrowser binary on first run (~200 MB, cached in `~/.cloakbrowser`).
Playwright then starts four processes:

| Process     | Port | What it is                                                               |
| ----------- | ---- | ------------------------------------------------------------------------ |
| fakes       | 4100 | `fakes/server.ts`: OpenRouter, Gemini, Resend and recipe websites        |
| browser     | 4200 | `scripts/cdp-browser.ts`: CloakBrowser over CDP, the URL-import fallback |
| full app    | 3100 | The production build with AI and email pointed at the fakes              |
| minimal app | 3101 | The same build with no AI, email or browser (`*minimal.spec.ts` only)    |

Every test signs up its own users. Data is siloed per family, so tests never see each other's
data and run in parallel without any cleanup between them.

## Writing specs

- **Behaviour through pages, never through the app's JSON API.** `/api/recipes` and friends are
  implementation details, not part of the contract. Seed data with
  `support/db.ts`, act through the UI, and assert on the UI or, where the UI can't show it, on the
  database. The only HTTP endpoints specs may call are the ones that are part of the contract:
  better-auth's `/api/auth/*`, `/api/health` and `/uploads/*` (see `http-contract.spec.ts`).
- **Accessible selectors only:** `getByRole`, `getByLabel`, `getByText` and `getByPlaceholder`,
  with English strings. No `data-testid`, CSS classes or DOM structure. Accessible markup is what
  a rewrite is most likely to keep. If an element has no accessible name, fix the app.
- **Wait for the new page after client-side navigation.** The URL changes before the old page
  unmounts, so wait for something on the new page before you fill or click.
- **Script the fakes by key.** The `key` fixture is unique per test. Put it in a prompt or a
  recipe title, and `fakes.queue(key, …)` answers only the LLM request that contains it.
  Unkeyed requests get the defaults in `fakes/defaults.ts`.
- **Only `support/db.ts` knows table and column names.** If the schema changes, that file is the
  only one that changes.

## The contract an implementation must honour

The specs don't know which stack they run against. Everything stack-specific is an env var in
`support/env.ts`:

| Variable           | Default today                                        | For another build                     |
| ------------------ | ---------------------------------------------------- | ------------------------------------- |
| `E2E_SERVER_CMD`   | `bun <repo>/scripts/serve.ts` (cwd `.server/`)       | its start command                     |
| `E2E_MIGRATE_CMD`  | `bun run db:migrate` (cwd: repo root)                | its migrate command                   |
| `E2E_PUBLIC_DIR`   | `''`: SvelteKit serves its own assets                | built SPA to copy to `.server/public` |
| `E2E_READY_PATH`   | `/api/health`                                        | keep `/api/health`                    |
| `E2E_DATABASE_URL` | `postgres://chef:changeme@localhost:5432/yumbry_e2e` | unchanged                             |

`main`'s Express build ran with `node backend/dist/index.js`,
`npm run db:migrate --workspace=backend` and `E2E_PUBLIC_DIR=frontend/dist`.

The app server has to read this configuration from the environment, under these names. It is set
in `playwright.config.ts`:

- `PORT`, `ORIGIN` (the app's base URL: better-auth, CSRF and links in emails; `main` called it
  `BETTER_AUTH_URL` and `APP_BASE_URL`), `DATABASE_URL`, `BETTER_AUTH_SECRET`, `COOKIE_SECURE`,
  `UPLOADS_DIR`
- `BODY_SIZE_LIMIT`: adapter-node's request body cap, large enough for 25 MB photo uploads
- `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `AI_MODEL_BIG|MEDIUM|SMALL|IMAGE`,
  `AI_MONTHLY_BUDGET_USD`, `AI_USER_DAILY_BUDGET_USD`
- `RESEND_API_KEY`, `EMAIL_FROM`
- Test-only hooks, unset in production:
  - `OPENROUTER_BASE_URL` / `GEMINI_BASE_URL`: where the LLM clients send requests.
  - `RESEND_BASE_URL`: read by the Resend SDK itself.
  - `E2E_SAFE_FETCH_ALLOW`: exact `host:port` entries that URL import may fetch despite
    resolving to a private address.
  - `DISABLE_RATE_LIMITS=1`: every browser in a run shares 127.0.0.1.

An implementation must also keep:

- **Page URLs:** `/recipes/:id`, `/recipes/:id/edit`, `/recipes/new`, `/join-family/:token`,
  `/reset-password?token=…` and the rest. Invite links and reset emails in the wild point at them.
- **Table and column names**, if possible; then `support/db.ts` keeps working unchanged.
- **better-auth mounted at `/api/auth`**, so the sign-up helpers keep working.
