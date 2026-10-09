# Migration: Express + React → SvelteKit on Bun

The `svelte` branch replaces the Express backend and React SPA (still running on `main`, v1.3.1) with
one SvelteKit app, run on Bun. The first commit (`d1bac5d`) scaffolded SvelteKit, swapped Prisma for
Drizzle (`drizzle/0000_baseline.sql`, `src/lib/server/db/`) and wired better-auth. It also deleted
`backend/` and `frontend/`. Their code is still the reference implementation:
`git show main:<path>` and `git ls-tree -r --name-only main backend frontend` read it.

**Done means:** every spec in `e2e/` passes against the SvelteKit build, unchanged. The app looks
and behaves like `main`. Production moves over without losing data, and users don't notice the
switch: they stay signed in, and their links, photos and installed PWAs keep working.

## How to use this file

Work through the steps in order. Each step is self-contained:

1. Start a fresh Claude Code session and paste the step's **Prompt**. Use plan mode, review the
   plan, then let it execute.
2. The step is done when its **Done when** list passes. Tick its box in the tracker below, in the
   same commit.
3. Make one commit per step, using the suggested message. Don't start the next step until the
   commit is in and CI is green.

If a step turns out bigger than planned, split it into `Na`/`Nb` here before you start, not halfway.

## Decisions

| Topic               | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime and tooling | **Bun** is both package manager and runtime: `bun install`, `bun --bun vite`, and the production server runs on `bun`. Playwright's test runner is the one exception: it stays on Node, the only runtime it officially supports. Step 2 found it does run on Bun 1.4.2, but the e2e harness keeps Node anyway (see "Bun runtime notes").                                                                                                                              |
| Adapter             | `@sveltejs/adapter-node`, with its output run by `bun scripts/serve.ts`, a thin wrapper around `build/index.js` that applies `ORIGIN` at runtime (step 5). Step 2 found no blocker: every Node API the backend needs (`node:http`, `node:net`, `node:tls`) works under Bun.                                                                                                                                                                                           |
| Data layer          | Load functions (`+page.server.ts`) and form actions with `use:enhance`. `+server.ts` only for things that aren't pages: `/api/health`, `/uploads/*`, file downloads and photo streams. The old `/api/*` JSON API is **not** ported, and `api/client.ts`, react-query and `queryKeys.ts` go away. Remote functions are still experimental in Kit 3.0, so they're out.                                                                                                  |
| Hydration           | Forms and links must work **before hydration**: form actions with `use:enhance`, GET forms and real links. That is the goal, not no-JS support. Inherently interactive controls (AI chat, reordering, dialogs, toasts, steppers) may need JS: they are disabled until `hydrated.current` (`#lib/hydrated.svelte.ts`) and get no `<noscript>` or other no-JS fallback. Replacing a JS-only control with a link or GET form is fine when it looks and behaves the same. |
| Base URL env var    | `ORIGIN` everywhere, read at runtime: better-auth's `baseURL`, the request origin SvelteKit's CSRF check and cookies see (adapter-node 6 dropped `ORIGIN`, so `scripts/serve.ts` feeds it in), and links in emails. `BETTER_AUTH_URL` and `APP_BASE_URL` are dropped. Production must set `ORIGIN` before the cutover (step 27).                                                                                                                                      |
| UI primitives       | `bits-ui` for dialogs. Menus are native popovers (`PopoverMenu.svelte`, step 25), so they open before hydration. `@lucide/svelte` for icons. Native pointer events or `svelte-dnd-action` for reorderable lists. Toasts are a small module of our own.                                                                                                                                                                                                                |
| i18n                | Paraglide (already set up), with the messages converted from `main`'s i18next JSON. No locale segment in URLs, as today: the strategy is the signed-in user's preference, then cookie, then `Accept-Language`, then `en`.                                                                                                                                                                                                                                             |
| `shared/`           | Folded into `src/lib/shared/`. It stays framework-free and keeps its unit tests, but there is no separate package or build step any more.                                                                                                                                                                                                                                                                                                                             |
| Old tests           | Unit tests of pure logic and services are ported next to the code they test. Express `*.api.test.ts` and React component tests are **not** ported: e2e covers that behaviour.                                                                                                                                                                                                                                                                                         |
| Schema              | **No schema changes until the cutover is done.** Production can then still roll back to v1.3.1 on the same database (step 27).                                                                                                                                                                                                                                                                                                                                        |

## Ground rules (every step)

- **The contract is fixed. Everything else is open.** That covers e2e specs, page URLs, table and
  column names, `/api/auth/*`, `/api/health`, `/uploads/*`, cookie names, and what users see and do.
  Everything else should be designed the way SvelteKit and Bun would do it from scratch. Don't port
  React or Express workarounds one-to-one: rewrite or remove whatever makes more sense in
  SvelteKit.
- **Never edit `e2e/specs/*`.** Harness files (`e2e/support/env.ts`, `e2e/playwright.config.ts`,
  `e2e/scripts/*`) may change only to point at the new build. A failing spec means the app is
  wrong.
- **The e2e suite.** Since step 25, `bun run e2e` and CI run every spec, in both projects. Until
  then they ran only an allowlist (`e2e/ported-specs.txt`, now deleted) that each feature step
  extended. Every test must stay green.
- **`CLAUDE.md` describes this branch since step 26.** Before that it still described `main`'s
  architecture. This file wins wherever they disagree.
- **Framework-free logic** (scaling, form rules, diffing, units, AI prompt building and parsing)
  goes in `src/lib/shared/` with unit tests. Server-only code goes in `src/lib/server/`.
- **Every query that touches `recipes`, `tags`, `categories` or `recipe_versions` filters by the
  signed-in user's `familyId`.**
- **For `.svelte` files,** use the Svelte skills and the `svelte:svelte-file-editor` agent (Svelte 5
  runes only).
- **Checks before each commit:** `bun run check`, `bun run lint`, `bun run test:unit -- --run`, and
  the e2e suite (`bun run e2e`).

## Tracker

**Phase A: Foundation**

- [x] 1. Tidy the scaffold; Bun runtime and adapter-node
- [x] 2. Check that the Bun runtime can run the low-level code
- [x] 3. Database: prove the baseline is lossless; migrate on start
- [x] 4. Fold `shared/` into the app
- [x] 5. Point the e2e harness at the SvelteKit build
- [x] 6. CI on Bun
- [x] 7. Docker image and compose on Bun

**Phase B: Platform**

- [x] 8. Server platform: env, hooks, security headers, rate limits, auth helpers
- [x] 9. i18n with Paraglide
- [x] 10. App shell and design system
- [x] 11. Auth pages and route protection

**Phase C: Features**

- [x] 12. Recipe list and detail (read side, photo serving)
- [x] 13. Create, edit and delete recipes; photo upload
- [x] 14. Version history
- [x] 15. Settings
- [x] 16. Onboarding
- [x] 17. Password reset email
- [x] 18. Families
- [x] 19. Public share links
- [x] 20. JSON-LD import and export
- [x] 21. URL import
- [x] 22. AI provider, budget, nutrition estimates
- [x] 23. AI chat (create/improve) and photo import
- [x] 24. Server-unavailable screen and PWA

**Phase D: Finish**

- [x] 25. Full parity pass
- [x] 25a. Hydration audit: before-hydration, not no-JS
- [x] 26. Docs and release tooling
- [ ] 27. Production cutover

## Open issues

Found during a step but owned by a later one. Remove an entry once the owning step fixes it.

None.

---

## Phase A: Foundation

### 1. Tidy the scaffold; Bun runtime and adapter-node

**Goal:** a clean, empty SvelteKit app that builds and runs on Bun, and answers `/api/health`.

**Done when:**

- `bun run build && PORT=3000 ORIGIN=http://localhost:3000 bun build/index.js` serves
  `GET /api/health` → `200 {"status":"ok"}`.
- `check`, `lint` and the unit tests pass.

**Commit:** `chore(svelte): tidy scaffold, run on Bun with adapter-node`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 1), then plan Step 1.

The scaffold from commit d1bac5d still carries template leftovers. Make it a clean base:
- Remove the demo routes (src/routes/demo), src/lib/vitest-examples, the starter
  src/routes/page.svelte.e2e.ts and the root playwright.config.ts. The only e2e suite is e2e/.
  Leave a minimal placeholder home page.
- package.json: name "yumbry", version "1.3.1" (as on main), "workspaces": ["e2e"].
  Split the dependencies: runtime packages adapter-node must leave external (better-auth,
  drizzle-orm, postgres, and anything with native code) go in "dependencies", the rest in
  "devDependencies". Find out whether the "auth" devDependency is used (the better-auth CLI?).
  Remove it if not.
- Swap @sveltejs/adapter-auto for @sveltejs/adapter-node. Scripts run Vite on the Bun runtime
  (`bun --bun vite dev|build|preview`). Add a "start" script: `bun build/index.js`.
- Add src/routes/api/health/+server.ts → 200 {"status":"ok"} (e2e readiness probe and Docker
  healthcheck; part of the contract).
- Make sure `bun install --frozen-lockfile` works from a clean checkout, and remove .npmrc if
  it no longer does anything under Bun.

Verify: bun run check, bun run lint, unit tests, then build and start the server as in Done when
and curl /api/health. Tick Step 1 in MIGRATION.md and commit as
"chore(svelte): tidy scaffold, run on Bun with adapter-node".
```

### 2. Check that the Bun runtime can run the low-level code

**Goal:** find out now, not in step 21, which Node-specific parts of `main`'s backend run unchanged
on Bun, and pick a Bun-native replacement for those that don't. The step ends with recorded
decisions and permanent smoke tests.

**Done when:**

- Each item below has a decision under "Bun runtime notes" at the end of this file.
- The smoke tests that keep their value are committed under `src/lib/server/runtime.spec.ts` and
  pass on `bun --bun vitest`.

**Commit:** `test(svelte): Bun runtime compatibility checks`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 2), then plan Step 2.

On main, the backend runs on Node. Before porting any of it, test each part below on the Bun
runtime with small experiments. Reference code: `git show main:backend/src/...`.
1. sharp: decode a JPEG, resize, encode WebP (services/image-prep.service.ts).
2. undici: an Agent with a custom connect.lookup for DNS pinning, plus manual redirect handling,
   as in utils/safe-fetch.ts. If Bun's undici shim ignores the custom lookup (a silent SSRF
   hole), design the Bun-native equivalent (for example: resolve, check with assertSafeTarget,
   connect by IP with the right Host/SNI). Prove it pins.
3. node:http server handling CONNECT plus plain-HTTP proxying (utils/ssrf-proxy.ts). Otherwise:
   Bun.serve/Bun.listen.
4. playwright-core chromium.connectOverCDP against
   `docker run --rm -p 127.0.0.1:9222:9222 cloakhq/cloakbrowser:0.5.11 cloakserve`
   (utils/headless-fetch.ts), with a proxy configured on the context.
5. The openai SDK with a custom baseURL, and the resend SDK with RESEND_BASE_URL.
6. vitest under `bun --bun vitest` (server project, and the browser project for .svelte tests).
7. Playwright's test runner: confirm it must stay on Node, and how e2e scripts (prepare,
   fakes server, cdp-browser) are best run (bun vs node).

For each item, record works / workaround / replacement and the reason in a "Bun runtime notes"
section at the end of MIGRATION.md. Keep the experiments that guard against regressions as
src/lib/server/runtime.spec.ts (skip the CDP one unless BROWSER_CDP_URL is set). Throw the rest
away. Don't port the real services yet. If the adapter decision in MIGRATION.md needs to change,
update it. Tick Step 2 and commit as "test(svelte): Bun runtime compatibility checks".
```

### 3. Database: prove the baseline is lossless; migrate on start

**Goal:** make sure the Drizzle setup can never lose or change production data, and give the app
one idempotent migrate command that is safe to run on every start.

**Done when:**

- Two dumps match apart from `_prisma_migrations` and the `drizzle` schema: the schema-only dump of
  a database built by `main`'s Prisma migrations, and the one built by `drizzle/0000_baseline.sql`.
- `bun run db:migrate` works against a restored copy of `backups/pre-svelte.dump` and leaves every
  table's row count unchanged. A second run is a no-op. It also works on an empty database.
- `drizzle-kit generate` reports no changes, so `schema.ts` matches the database.

**Commit:** `feat(db): verified Drizzle baseline and idempotent migrate script`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 3), then plan Step 3.

Production's database was created by Prisma (main: backend/prisma/migrations). This branch has
drizzle/0000_baseline.sql, src/lib/server/db/schema.ts and scripts/db-baseline.ts.
1. Prove equivalence. Create two scratch databases on the local Postgres (docker compose up -d
   db). Apply main's Prisma migration SQL files in order to one, and the Drizzle baseline to the
   other. Diff `pg_dump --schema-only`. Every difference must be explained (_prisma_migrations,
   drizzle schema) or fixed by correcting schema.ts and regenerating the baseline. Never
   hand-edit the baseline, and never change a table, column, index or constraint name.
2. Replace scripts/db-baseline.ts plus drizzle-kit migrate with one script,
   scripts/migrate.ts, run by `bun run db:migrate`. If it's a Prisma-era database (users table
   exists, no Drizzle history), record the baseline as applied. Then apply pending migrations
   with drizzle-orm's postgres-js migrator. It must not need drizzle-kit at runtime (it runs
   inside the production image), must be idempotent, and must run in one transaction where
   possible. Leave _prisma_migrations in place: v1.3.1 must still run on this DB for rollback.
3. Rehearse on real data. Restore backups/pre-svelte.dump into a scratch database (never the dev
   DB), record row counts per table, run the script twice, compare counts. Also run it on an
   empty database.
4. Run `drizzle-kit generate` and confirm "no changes".
Write the rehearsal as a repeatable script (scripts/rehearse-migrate.ts or a documented
command) so step 27 can run it again on a fresh production backup. Document db:* scripts in
package.json. Tick Step 3 and commit as
"feat(db): verified Drizzle baseline and idempotent migrate script".
```

**Outcome.** The first diff found one real difference. Prisma wrote `DEFAULT 1` and `DEFAULT 0` for
`recipes.servings` and `ai_usage.cost_usd`, but the baseline had `'1'` and `'0'` (pg_dump prints
these as `'1'::numeric`). `schema.ts` now uses ``sql`1` `` and ``sql`0` ``, and the baseline was
regenerated (new hash `7cc71a32…`). That reset the history of databases adopted with the old
baseline: `delete from drizzle.__drizzle_migrations`, then `bun run db:migrate`. After the fix, the
only differences are `_prisma_migrations`, the `drizzle` schema, and the comment on the `public`
schema itself. Production's `public` schema was recreated without template1's "standard public
schema" comment, and that comment is not part of the app's schema. On `pre-svelte.dump`, all 15
tables kept their row counts through two runs.

**Database scripts.**

| Script                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run db:migrate`  | `scripts/migrate.ts`, run on every start (step 7). If the database is Prisma-era (`users` exists, no Drizzle history), it records the baseline as applied, but only if `_prisma_migrations` ends at v1.3.1's last migration. It aborts if the recorded history has a hash that `drizzle/` doesn't, which means an edited or regenerated migration. It then applies pending migrations in one transaction. An advisory lock serialises concurrent starts. It needs no drizzle-kit. |
| `bun run db:rehearse` | `scripts/rehearse-migrate.ts`. Runs on `rehearse_*` scratch databases next to `DATABASE_URL`, which it drops afterwards (`--keep` keeps them). It migrates an empty database twice. It compares the v1.3.1 Prisma migrations (`--prisma-ref`) with the baseline. It restores `--dump` (default `backups/pre-svelte.dump`), migrates twice and compares row counts. It checks the restored schema for drift. pg tools run in the compose `db` service, or set `PG_TOOLS=host`.     |
| `bun run db:generate` | `drizzle-kit generate`: a new migration from `schema.ts` changes (dev only). It must report "No schema changes" while `schema.ts` is untouched.                                                                                                                                                                                                                                                                                                                                   |
| `bun run db:studio`   | `drizzle-kit studio` (dev only).                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Step 27 runs the same rehearsal on a fresh production backup:
`bun run db:rehearse --dump path/to/prod.dump`.

### 4. Fold `shared/` into the app

**Goal:** `shared/` stops being a separately built package. Its code and tests live in
`src/lib/shared/`.

**Done when:**

- `shared/` (including `dist/`) is gone.
- Every one of its tests runs in the vitest `server` project and passes.
- Nothing imports `yumbry-shared`.

**Commit:** `refactor: move shared logic into src/lib/shared`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 4), then plan Step 4.

shared/ holds framework-free logic (recipe scaling, units, recipe-form rules, diffing, AI prompt
building and parsing, budget display, server availability) and its tests. It was a compiled npm
workspace for the old backend/frontend split, and is now consumed only by this app.
- Move shared/src/** to src/lib/shared/** and shared/tests/** next to the code as *.spec.ts
  (the vitest server project's pattern). Keep file names unless a rename is clearly better.
- Replace the barrel import "yumbry-shared" with direct imports via #lib/shared/...
- Make it pass this project's TS, ESLint and Prettier config. Fix real type errors; don't
  loosen the config.
- Delete shared/ entirely (package.json, dist/, configs).
Don't change behaviour: every moved test must pass unchanged apart from import paths. Tick
Step 4 and commit as "refactor: move shared logic into src/lib/shared".
```

**Outcome.** All 15 test files (380 tests) moved unchanged apart from import paths and Prettier
whitespace. Both barrels are gone: `index.ts` (the `yumbry-shared` entry) and `units/index.ts`, whose
two users now import the unit modules directly. Imports use `#lib/shared/<path>.ts`, like the rest
of `src/lib`. One test was renamed to sit next to its module: `worked-example.test.ts` →
`ai-worked-example.spec.ts`. No type errors surfaced under the app's TS config, so
nothing needed fixing.

### 5. Point the e2e harness at the SvelteKit build

**Goal:** `bun run e2e` builds the SvelteKit app, resets the e2e database with the new migrate
command, starts the fakes, the browser and two app servers, and runs the allowlist.

**Done when:**

- `bun run e2e` runs green on the allowlist. Expect only the `/api/health` test and the
  better-auth endpoint tests in `http-contract.spec.ts` at this point, except
  `sign-out ends the session`, which needs `/settings`.
- `bun run e2e:all` runs the whole suite. It is expected to be mostly red; don't fix it here.
- The e2e package typechecks and lints.

**Commit:** `test(e2e): run the suite against the SvelteKit build`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 5) and e2e/README.md, then plan Step 5.

The e2e suite is the stack-neutral proof of the migration. Point it at this app without
touching e2e/specs:
- e2e/support/env.ts defaults: E2E_SERVER_CMD runs the adapter-node build with bun (absolute
  path to build/index.js; the cwd stays e2e/.server). E2E_MIGRATE_CMD is `bun run db:migrate`.
  E2E_PUBLIC_DIR is '' (SvelteKit serves its own assets). E2E_READY_PATH stays /api/health.
- e2e/playwright.config.ts appEnv: pass ORIGIN (= baseUrl) instead of BETTER_AUTH_URL and
  APP_BASE_URL. Add the adapter-node vars the app will need (BODY_SIZE_LIMIT large enough for
  25 MB photo uploads), and keep every other variable name.
- Run the e2e helper scripts and the fakes the way step 2 decided (Bun vs Node).
- Root scripts: "e2e:build" (= bun run build), "e2e" (prepare, then playwright test on the
  entries in e2e/ported-specs.txt), "e2e:all" (the whole suite), "e2e:ui".
- Create e2e/ported-specs.txt with the tests that pass now (file:line of the test or
  describe), and a header comment explaining the file.
- Make the e2e package's typecheck/lint/format work under the root Bun install (it's a
  workspace now).
- Update e2e/README.md's "contract" table for the new defaults and ORIGIN.
Verify `bun run e2e` is green and `bun run e2e:all` runs to completion. Tick Step 5 and commit as
"test(e2e): run the suite against the SvelteKit build".
```

**Outcome.** `bun run e2e` runs the 9 tests in `e2e/ported-specs.txt`: the better-auth endpoint
tests except sign-out, the health check, and two negative tests (`/uploads` path traversal,
another family's version history). Those two pass now only because the routes 404, and they guard
steps 12 and 14. `e2e:all` runs to completion with 9 passed and 115 failed. Three findings changed
more than the harness:

- **adapter-node 6 dropped the `ORIGIN` env var.** Kit 3 wants a build-time `kit.paths.origin`;
  without one, the origin is the `Host` header plus `https`, unless `PROTOCOL_HEADER` names a
  header that is present. On plain HTTP, every `event.url` said `https://…`, so better-auth's
  `svelteKitHandler` didn't match its own paths and `/api/auth/*` returned 404. One build has to
  serve two e2e ports and production, so the origin stays a runtime setting.
  `scripts/serve.ts` points `PROTOCOL_HEADER`/`HOST_HEADER` at private headers. It fills them from
  `ORIGIN` in a `request` listener that runs before adapter-node's own, overwriting anything a
  client sent. Adapter-node's shutdown, timeouts and socket activation are unchanged.
  `bun run start` and `E2E_SERVER_CMD` use it.
- **The e2e reset now recreates the database.** `prepare.ts` used to drop only the `public`
  schema. Drizzle keeps its history in the `drizzle` schema, so the migrator saw "up to date" and
  left an empty database. Dropping and recreating the database works for any stack.
- **The e2e package keeps its own Prettier config** (`e2e/prettier.config.js`, `main`'s style).
  Without it, Prettier picked up the root config with tabs and flagged every file. The package's
  `lint` now runs Prettier and ESLint, like the root one.

### 6. CI on Bun

**Goal:** CI checks every step from here on. The old workflow builds npm workspaces that no longer
exist.

**Done when:**

- `.github/workflows/ci.yml` runs green on the pushed `svelte` branch: check, lint, format, unit
  tests and the allowlisted e2e specs.

**Commit:** `ci: Bun-based CI for the SvelteKit app`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 6), then plan Step 6.

Rewrite .github/workflows/ci.yml (see the current file and main's version) for the
single-package SvelteKit app on Bun:
- Triggers: push and pull_request on main and dev, plus push on svelte during the migration.
- Job "app": oven-sh/setup-bun (version from package.json "packageManager" or a .bun-version
  file; add one), cached `bun install --frozen-lockfile`, then svelte-check, eslint, prettier
  --check, and unit tests (server + browser projects; install Playwright chromium for the
  browser one).
- Job "e2e": Postgres 16 service (yumbry_e2e), Bun plus Node (Playwright runner only), Playwright
  chromium with deps, CloakBrowser cache (~/.cloakbrowser) keyed on bun.lock, `bun run e2e`
  (allowlist), upload playwright-report/test-results on failure. Also run the e2e package's
  typecheck and lint.
- Leave the docker job out; step 7 adds it back.
- Drop everything about shared/, backend/, frontend/, prisma generate and package-lock.json.
- The build still needs DATABASE_URL, ORIGIN and BETTER_AUTH_SECRET (see "Open issues"). Give
  every step that builds obviously fake placeholder values, marked with a comment saying step 8
  removes them. They must never be real secrets.
Show me the workflow, then ask me before pushing the branch. Once I agree, push and watch the
run with `gh run watch` until it's green. Fix what fails. Tick Step 6 and commit as
"ci: Bun-based CI for the SvelteKit app".
```

### 7. Docker image and compose on Bun

**Goal:** a production image that the existing deployment (Coolify, arm64 home server, Cloudflare
Tunnel) can run, built early so every later step is checked in CI. It must keep using the existing
volumes.

**Done when:**

- `docker build` succeeds for `linux/amd64` and `linux/arm64`.
- `docker compose up -d --build` starts `app`, `db` and `browser`.
- The app migrates on start, answers `/api/health`, and the container reports healthy.
- The CI `docker` job is green.

**Commit:** `build: Bun Docker image and compose app service`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 7), then plan Step 7.

On main, the image was a multi-stage Node build (`git show main:Dockerfile`,
main:backend/docker-entrypoint.sh, main:docker-compose.yml). This branch has no Dockerfile, and
docker-compose.yml lost its `app` service. Design it fresh for Bun and SvelteKit, not as a port:
- Multi-stage Dockerfile on the official oven/bun image. It must be multi-arch (production is
  arm64), with a libc that sharp's prebuilt binaries support. Stages: install, build with
  `bun run build`, then a slim runtime with production dependencies, build/, drizzle/,
  scripts/migrate.ts and scripts/serve.ts. Run as a non-root user. HEALTHCHECK hits /api/health
  with bun.
- Start command: `bun scripts/migrate.ts && exec bun scripts/serve.ts` (no npx, no drizzle-kit).
  serve.ts takes the protocol and host from ORIGIN, so don't set PROTOCOL_HEADER or HOST_HEADER.
- Image env defaults: NODE_ENV=production, PORT=3000, BODY_SIZE_LIMIT for 25 MB uploads,
  UPLOADS_DIR, and adapter-node's client-address config so rate limits see the real client IP
  behind the Cloudflare Tunnel (main used `trust proxy 1`; match that).
- docker-compose.yml: restore the `app` service (build: ., ports, env incl. ORIGIN, the AI/email
  vars, BROWSER_CDP_URL default http://browser:9222, BROWSER_PROXY_HOST=app, networks default and
  browser, depends_on db healthy). Data safety: keep the volume names db_data and uploads_data
  exactly, and check that files written by main's image (uid 1000, under
  /app/backend/uploads) are readable and writable by the new user at the new mount path.
- .dockerignore for node_modules, .svelte-kit, build, e2e artefacts, backups, .env.
- The build still needs DATABASE_URL, ORIGIN and BETTER_AUTH_SECRET (see "Open issues"). Set
  placeholders on the `bun run build` line of the build stage only (inline env or ARG, never
  ENV), so they don't reach the runtime image. Add a comment saying step 8 removes them.
- Add a CI job "docker" (needs app + e2e) that builds amd64 always, and arm64 via buildx/QEMU
  on main and tags.
- Update .env.example: ORIGIN replaces BETTER_AUTH_URL and APP_BASE_URL, Docker-relevant notes.
Verify locally with docker compose (with a restored copy of backups/pre-svelte.dump if
convenient), curl /api/health, check `docker inspect` health. Tick Step 7 and commit as
"build: Bun Docker image and compose app service".
```

**Outcome.** Every stage is `oven/bun:1.4.2-slim`: Debian trixie (glibc 2.41), published for
amd64 and arm64. sharp loads its `linux-<arch>` prebuild there, which was checked on both. Its `bun`
user is uid/gid 1000, the same as v1.3.1's `node` user. The uploads volume now mounts at
`/app/uploads` (it was `/app/backend/uploads`), keeping the name `uploads_data`. A copy of the
local volume written by v1.3.1 (1000:1000, `0644`/`0755`) was readable and writable by the new
user. A fresh volume starts out owned by `bun`. Only `/app/uploads` is writable; the code is
root-owned. The image is 104 MB of content. Other findings:

- **`bun install --production` still installs better-auth's optional peers** (vite, drizzle-kit,
  typescript, …), with both the hoisted and the isolated linker. `--omit peer` halves
  `node_modules` to 132 MB. A sign-up and session round-trip against the container showed nothing
  required went missing.
- **The process didn't exit on SIGTERM** once a request had opened the postgres pool. adapter-node
  closed the server, but idle connections kept the process alive for about 20 s, so
  `docker stop` always hit its 10 s kill. `src/lib/server/db/index.ts` now ends the client on
  adapter-node's `sveltekit:shutdown` event, and a stop takes under a second. Bun runs as PID 1
  (`exec`), so no init process is needed.
- **adapter-node throws when `ADDRESS_HEADER` is missing** from a request. Express fell back to the
  socket address. `scripts/serve.ts` sets a missing `X-Forwarded-For` to the peer, so the image also
  works with no proxy in front. Nothing calls `getClientAddress()` until step 8, so this isn't
  exercised end to end yet.
- **The healthcheck uses `--start-interval=2s`**, so the container reports healthy within seconds
  of starting instead of after the first 30 s interval.
- The CI `docker` job builds amd64 on every run and smoke-tests it against a Postgres service: it
  migrates an empty database and waits for `healthy`. On `main` and `v*` tags it also builds arm64
  under QEMU. Tags were added to the push trigger.

Verified locally on an isolated `yumbry-step7` compose project with `pre-svelte.dump` restored:

- The app adopted the Prisma-era database, and row counts were unchanged.
- A restart logged "Database is up to date".
- `/api/health` answered and the container reported healthy.
- The amd64 image was also healthy under emulation.

## Phase B: Platform

### 8. Server platform: env, hooks, security headers, rate limits, auth helpers

**Goal:** the cross-cutting server behaviour from `main`'s `app.ts`, middleware and `index.ts`,
expressed in SvelteKit primitives. Features then only have to call helpers.

**Done when:**

- Unit tests cover the rate limiter, the auth/family helpers and the error mapping.
- Response headers match `main`'s helmet output in substance (checked with `curl -I` against both
  builds).
- The allowlisted e2e specs are still green.

**Commit:** `feat(server): hooks, security headers, rate limiting and auth helpers`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 8), then plan Step 8.

Reference: main:backend/src/app.ts, index.ts, auth.ts, middleware/*, utils/kinded-error-response.ts,
utils/async-handler.ts, services/family.service.ts (sweepOrphanedFamilies). Express middleware
order no longer applies. Build the SvelteKit-native equivalents:
- src/env.ts: declare every variable from .env.example and e2e/playwright.config.ts appEnv
  (OPENROUTER_*, GEMINI_*, AI_MODEL_*, AI_*_BUDGET_USD, GEMINI_DAILY_REQUEST_LIMIT,
  RESEND_BASE_URL, UPLOADS_DIR, BROWSER_CDP_URL, BROWSER_PROXY_HOST, E2E_SAFE_FETCH_ALLOW,
  OPENROUTER_BASE_URL, GEMINI_BASE_URL). Optional ones stay optional, so the app boots without
  AI or email. BETTER_AUTH_SECRET is required in production, with a fixed dev placeholder
  otherwise (as on main).
- Fix the "build needs runtime secrets" open issue: `bun run build` must succeed with no
  environment at all, and missing required variables must fail when the server starts instead.
  Prove it with `env -i PATH="$PATH" HOME="$HOME" bun run build` from a clean clone (no .env).
  Then remove the build-time placeholders from ci.yml and the Dockerfile, and the entry under
  "Open issues".
- hooks.server.ts: an `init` hook that sweeps orphaned families at startup; security headers
  equivalent to main's helmet setup (prefer kit.csp in svelte.config/vite config, with img-src
  'self' data: blob: https:, and other headers in handle); handleError that logs and returns a
  generic message.
- src/lib/server/rate-limit.ts: a small in-memory fixed-window limiter keyed by
  event.getClientAddress(), switched off by DISABLE_RATE_LIMITS=1, with the same windows and
  limits as main's express-rate-limit instances (api 300/min, url import 20/15min, photo
  import 10/15min, family join 10/15min). Better-auth's own limits stay in auth.ts. Decide
  whether the global /api limiter still makes sense without a JSON API, and say why.
- src/lib/server/guards.ts (or similar): requireUser(event) → { user, familyId } or redirect
  to /login?redirectTo=…, and a recipe-access helper that 404s ("Recipe not found.") for
  other families' recipes, replacing requireAuth / requireRecipeAccess / validateRecipeIdParam.
- Error mapping: domain errors with a .kind (AiProviderError, UrlImportError) map to
  error()/fail() status codes in one place, replacing sendKindedError.
- Port the useful unit tests from main:backend/tests (kinded-error-response, recipe-id.schema).
Don't build features or pages yet. Tick Step 8 and commit as
"feat(server): hooks, security headers, rate limiting and auth helpers".
```

### 9. i18n with Paraglide

**Goal:** all of `main`'s UI strings in four languages, served through Paraglide with locale
resolution that matches today's.

**Done when:**

- `messages/{en,nl,fr,es}.json` hold every key from `main`'s locale files.
- A unit test checks that all four locales have the same keys.
- Locale resolution needs no URL prefix and is SSR-correct for signed-in users, with no flash of
  the wrong language.

**Commit:** `feat(i18n): Paraglide messages converted from main's locales`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 9), then plan Step 9.

Reference: main:frontend/src/i18n/index.ts, localeLabels.ts, locales/{en,nl,fr,es}.json
(i18next, about 429 keys each), main:frontend/tests/i18n-keys.test.ts,
main:frontend/src/hooks/useLocaleSync.ts, SUPPORTED_LOCALES in src/lib/shared.
- Write a one-off conversion script (scripts/, delete it after use or keep it under scripts/
  if it's reusable) that turns the i18next files into inlang message format in messages/:
  flatten nested keys to Paraglide-friendly identifiers, {{var}} → {var}, i18next plurals
  (_one/_other) → inlang plural variants. Keep the English wording byte-identical: the e2e
  specs select on it.
- Configure Paraglide with no URL strategy: no locale prefixes, so remove reroute/deLocalizeUrl
  from src/hooks.ts and the hidden locale links in +layout.svelte. Resolution order: the
  signed-in user's users.locale (set on the request in hooks.server.ts) → cookie →
  Accept-Language → 'en'. `<html lang>` must be right in the SSR output.
- Changing language as a signed-out visitor sets the cookie. For a signed-in user it also
  writes users.locale (the action for that arrives in step 15; leave a clear seam).
- Users' existing anonymous choice lives in localStorage "yumbry.locale". Carry it over once on
  the client (write the cookie if there is none yet, then remove the key).
- Port the key-parity test.
Don't build pages. Tick Step 9 and commit as
"feat(i18n): Paraglide messages converted from main's locales".
```

**Outcome.** `messages/{en,nl,fr,es}.json` hold 311 messages each. `main` has 308 strings per
locale (not ~429), and English is byte-identical apart from `{{var}}` → `{var}`. The conversion
script was a one-off and is gone. Later steps translate `main`'s keys with these rules:

- **Key names:** the path is joined with `_` and camelCase becomes snake_case, so
  `t('aiChat.units.label')` is `m.ai_chat_units_label()`.
- **Plurals:** `x_one`/`x_other` became one message with plural variants, called as
  `m.recipe_versions_differences({ count })`.
- **Lists:** Paraglide has no list messages. The five `onboarding.pwa.steps.*` arrays
  (`returnObjects: true` on `main`) became numbered messages, `onboarding_pwa_steps_ios_safari_1`
  to `_3` and so on. Step 16 lists them per platform.

Locale resolution has no URL strategy and no `reroute`:

- **Shared config:** `paraglide.config.ts` holds the compiler options for both the Vite plugin and
  `prepare` (`scripts/paraglide-compile.ts`, because the CLI can't set `cookieName`). Paraglide's
  own `project.inlang/paraglide.config.ts` would be ignored by the `.gitignore` that inlang
  manages in that folder.
- **Order:** the strategy is `custom-session` → `cookie` (`yumbry-locale`) → `preferredLanguage` →
  `baseLocale`.
- **Server:** `custom-session` reads the signed-in user's `users.locale`, which `hooks.server.ts`
  hands over through a `WeakMap` keyed by the request (`#lib/server/locale.ts`). That makes
  better-auth run before Paraglide in `sequence`. When a signed-in user's cookie differs from
  their saved language, the response rewrites the cookie, so pages they see after signing out
  stay in that language, as `main`'s localStorage mirror did.
- **Client:** on the client, `custom-session` reads `<html lang>`, the server's answer, so
  hydration always agrees with the SSR output.
- **Seam for steps 15 and 16:** `saveLocaleChoice(event, locale)` sets the cookie and, when signed
  in, `users.locale`. Every language switch goes through it. A client-only `setLocale()` would be
  overruled by the saved preference on the next request.
- **Legacy carry-over:** `hooks.client.ts` `init` moves `localStorage['yumbry.locale']` into the
  cookie if there is none yet, reloading once if the language changes, and always removes the
  key. A re-seeded key (as `i18n.spec.ts` does) can't loop.
- **e2e:** no specs turn green yet. The i18n specs need the pages from steps 10 and 11.

### 10. App shell and design system

**Goal:** the app looks like `main`: tokens, fonts, icons, header and navigation, plus the
primitives every page uses (card, chip, dialog, confirm dialog, toast). Also the not-found page.

**Done when:**

- Side-by-side screenshots of the shell and the not-found page (desktop and mobile width) match
  `main`'s build closely.
- e2e `i18n.spec.ts › an unknown path shows the not-found page to signed-out visitors too` is
  green and allowlisted.

**Commit:** `feat(ui): app shell, design tokens and base components`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 10), then plan Step 10.

Reference: main:frontend/src/index.css (Tailwind 4 @theme tokens: cream, clay, serif font, the
custom animation, base layer), main:frontend/index.html, main:frontend/public/* (favicons,
apple-touch-icon, manifest icons), main:frontend/src/App.tsx (header, Add recipe menu, Profile
menu, layout), components Card, Chip, Dialog, ConfirmDialog, CollapsibleActions, FilterChips,
context/ToastProvider, pages/NotFoundPage.
- Move the CSS into src/routes/layout.css (keep the Tailwind 4 setup). Move the icons to static/
  at the same public paths, and put the head tags in src/app.html.
- Build the shell in src/routes/+layout.svelte with Svelte 5 runes, bits-ui (menus, dialog) and
  @lucide/svelte. Accessible names must match main exactly: "Yumbry" link, "Add recipe"
  button with links "Manually", "Import JSON-LD", "Paste URL", "From a photo", "Create with
  AI", "Profile" button, "Log out" button. Menu entries may link to pages that don't exist yet.
  Visibility rules (JSON import/export preference, AI configured) come from the layout's
  server load. Stub them false/true for now if the data isn't there.
- Base components go in src/lib/components/ (flat). Toasts are a small rune-based module, not a
  context provider port.
- src/routes/+error.svelte: the not-found page with a way home, translated.
Compare against main's build with screenshots (desktop and ~390px wide) using Playwright from
a scratch script. Add the passing not-found spec to e2e/ported-specs.txt. Tick Step 10 and
commit as "feat(ui): app shell, design tokens and base components".
```

**Outcome.** The not-found page and the header (signed out, signed in, both menus open) are
pixel-identical to `main` at 1280×800 and 390×844. Seams later steps build on:

- **Header menus** use bits-ui `NavigationMenu`, as `main` used Radix's. `DropdownMenu` would
  render the entries as `menuitem`s, and the specs select them as `link`s. Each `List` needs
  `class="relative"` to anchor its content as Radix's wrapper did.
- **Shell data** comes from the root `+layout.server.ts`: `user` (only
  `jsonImportExportEnabled` for now) and `aiConfigured`, which is `Boolean(OPENROUTER_API_KEY)`
  as on `main`. Later steps widen `user`.
- **Log out** is a `POST` form to `/logout`. Step 11 adds that action.
- **`ConfirmDialog`** takes `onconfirm`, or `action` (a form action URL), which submits with
  `use:enhance`, shows its own pending state and closes on success. It builds on bits-ui `Dialog`,
  not `AlertDialog`, because the specs look for `role=dialog`.
- **Toasts:** `showToast({ title, description })` from `#lib/toast.svelte.ts`, rendered by
  `<Toaster />` in the root layout. Main's swipe-to-dismiss was dropped.
- **Onboarding** has a full-screen layout since step 16 (`fullScreen` page data).

### 11. Auth pages and route protection

**Goal:** register, log in, log out, and redirects for protected pages, all with progressively
enhanced forms on better-auth.

**Done when:** these are green and allowlisted:

- `auth.spec.ts › signing in and out`
- `auth.spec.ts › registering an email that is taken shows an error`
- `isolation.spec.ts › signed-out visitors`
- `i18n.spec.ts › anonymous pages are translated` (×4 locales)
- the remaining `http-contract.spec.ts › better-auth endpoints`

**Commit:** `feat(auth): login, register, logout and protected routes`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 11), then plan Step 11.

Reference: main:frontend/src/pages/LoginPage.tsx, RegisterPage.tsx,
components/ProtectedRoute.tsx, lib/auth-client.ts, hooks/useCurrentUser.ts, and
main:backend/src/auth.ts vs src/lib/server/auth.ts.
- Route groups: protected pages live under a group whose +layout.server.ts calls requireUser
  (redirect to /login?redirectTo=<path>). Public pages (login, register, forgot/reset, share,
  join-family, error) stay outside. Visiting /login or /register while signed in redirects
  home (or to redirectTo).
- /login and /register use form actions that call auth.api.signInEmail / signUpEmail with the
  request headers (the sveltekitCookies plugin sets the cookies), and show main's error
  messages. Log out is a form action. There is no client-side session store and no
  better-auth client in the browser unless something truly needs it.
- After registering, go to /onboarding (a placeholder page until step 16). After logging in, go
  to redirectTo (safe-guarded to same-origin paths) or /.
- Keep cookie names and attributes exactly as main (yumbry prefix), so existing sessions stay
  valid. Add a unit test that pins the session cookie name.
- /settings may be an empty protected placeholder, so the sign-out contract test can pass.
Add every newly green test to e2e/ported-specs.txt. Tick Step 11 and commit as
"feat(auth): login, register, logout and protected routes".
```

**Outcome.** Login, register and logout are form actions over `auth.api.*`, and there is no
better-auth client in the browser. Main's error messages come through as better-auth's own text,
for example "Invalid email or password" and "User already exists. Use another email.". Later steps
build on these seams:

- **The return path goes in a cookie, not `?redirectTo=`.** The specs expect a bare `/login` after a
  protected redirect, and Playwright's string `toHaveURL` is an exact match. On a GET,
  `requireUser` stores path and query in `yumbry-return-to` (httpOnly, lax, 10 minutes;
  `#lib/server/return-to.ts`) and redirects to `/login`. Logging in, or a signed-in visit to
  `/login` or `/register`, takes it, after a same-origin check. Registering leaves it for
  **step 16**'s onboarding to send the user on to, as `main` passed `from` along.
- **The `(app)` route group** holds every protected page. Its `+layout.server.ts` calls
  `requireUser`, but that only covers navigation: page loads run in parallel with it, and actions
  never run it. Every page load and action must still call `requireUser` or `requireRecipe`
  itself.
- **Placeholders**, each to be replaced by its step:
  - `/` (step 12)
  - `/recipes/[id]` (step 12), which runs `requireRecipe`, so other families' recipes already 404
  - `/recipes/new` (step 13)
  - `/recipes/[id]/edit` (step 13), which also runs `requireRecipe`
  - `/settings` (step 15), with its translated heading
  - `/onboarding` (step 16)
- **Rate limits on the forms.** better-auth limits only requests through its own router, so
  server-side `auth.api.*` calls skip it. `signInLimiter` and `signUpLimiter` (10 per 15 minutes,
  `#lib/server/rate-limit.ts`) carry its sign-in and sign-up rules over to the form actions.
- **Cookies** are unchanged from `main`: `yumbry.session_token` with `Max-Age=2592000; Path=/;
HttpOnly; SameSite=Lax`, the same from the form as from `/api/auth/sign-in/email`. That is pinned
  by `src/lib/server/auth.spec.ts`.
- **e2e:** these were allowlisted, along with the signed-in not-found test (`i18n.spec.ts:158`):
  - `auth.spec.ts:18`, `:43`, `:52` and `:61`
  - `isolation.spec.ts:95`
  - `i18n.spec.ts:79`
  - `http-contract.spec.ts:94`

  `i18n.spec.ts:146` (the Settings heading) passes in English only. The other locales need the
  Language picker, so it waits for **step 15**.

## Phase C: Features

### 12. Recipe list and detail (read side, photo serving)

**Goal:** the family's recipe list (search, category and tag filters) and the recipe detail page
(scaling, nutrition, times, tags, steps). `/uploads/*` is served behind auth and family checks.

**Done when:** these are green and allowlisted:

- `recipe-list.spec.ts`
- `recipe-detail.spec.ts`
- `isolation.spec.ts`, except the edit-page and photo tests, and `:50`, which also checks the
  recipe form's chips and tag suggestions (step 13)
- `http-contract.spec.ts › path traversal…`
- `auth.spec.ts › a protected deep link returns there after logging in` (`:31`, moved here from
  step 11: it needs the detail page)

The services' unit tests pass.

**Commit:** `feat(recipes): recipe list, detail page and photo serving`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 12), then plan Step 12.

Reference: main:backend/src/services/recipe.service.ts (read paths), tag-category.service.ts,
recipe.types.ts, middleware/require-photo-access.ts, the /uploads static mount in app.ts,
main:frontend/src/pages/RecipeListPage.tsx, RecipeDetailPage.tsx and components RecipeCard,
SearchBar, FilterChips, RecipeDetailView, RecipeHero, IngredientList, InstructionList,
ServingsStepper, NutritionStats, TimeStat, RecipeTagBadges, hooks/useScaledIngredients.ts.
- Port the read services to Drizzle in src/lib/server/services/, scoped by familyId (relational
  queries where they read well). Port their unit tests, run against TEST_DATABASE_URL (skip
  when unset, as on main).
- `/` (protected): list via load. Search and filter state may live in the URL search params if
  that's simpler than component state (the specs don't care), and must not trigger full
  reloads.
- /recipes/[id]: load returns the recipe or 404 "Recipe not found." for other families. Build
  RecipeDetailView as a shared component (the share page reuses it in step 19). Scaling uses
  src/lib/shared/recipe-scaling with the reader's locale. It never converts units, as on main.
- src/routes/uploads/[...path]/+server.ts: requireUser + family check on the recipe that owns
  the path, path-traversal-proof resolution against UPLOADS_DIR, Content-Disposition: inline,
  X-Content-Type-Options: nosniff, the right Content-Type, efficient streaming (Bun.file).
  Existing stored paths (/uploads/recipes/<id>/<file>) must keep resolving.
- The detail page's actions row (Export, Edit, Improve with AI, Delete, Menu on narrow
  screens) may link to pages that later steps build.
Add the green tests to e2e/ported-specs.txt. Tick Step 12 and commit as
"feat(recipes): recipe list, detail page and photo serving".
```

**Outcome.** The list filters through URL params (`?search=&category=&tag=`), with
`goto(url, { replace: true, reset: false })`. Kit 3 renamed `replaceState`/`keepFocus`/`noScroll` to
`replace` and `reset`. Scaling never converts units, as on `main`: unit preferences stay AI-chat
only. Seams later steps build on:

- **DTOs:** `RecipeSummary` and `RecipeDetail` in `#lib/shared/recipe-dto.ts`, in `main`'s
  snake_case. Decimal columns go through `decimalString`, so `numeric(65,30)` reads `"4"` rather than
  `"4.000…"`, as Prisma printed it (main's version snapshots hold those strings).
- **Read services:** `listRecipes`, `getRecipe` (`#lib/server/services/recipes.ts`), and `listTags`,
  `listCategories` (`tags-categories.ts`). Search escapes LIKE wildcards. `/api/tags` leaked
  `familyId`; these return `{ id, name }` only.
- **DB-backed tests:** `*.db.spec.ts` run in their own vitest project, `server-db`, with
  `fileParallelism: false`, against `TEST_DATABASE_URL` (skipped when unset; Bun reads it from
  `.env`). `#lib/server/testing/db.ts` resets the schema, migrates and seeds. A spec mocks
  `#lib/server/db/index.ts` with a getter (see that file). CI's `app` job now has a Postgres service.
- **Photos:** `#lib/server/uploads.ts` has `uploadsRoot()` and `resolveUploadPath()`. Only
  `recipes/<id>/<plain file name>` with a webp/jpg/jpeg/png/gif extension resolves. Step 13 writes
  through the same module. `/uploads/*` answers **401** when signed out (not the login redirect),
  404 for everything else that isn't the family's file, and sends `Cache-Control: private`.
- **`.gitignore`** had `uploads/`, which also hid `src/routes/uploads/`. It is now `/uploads/`.
- **Not-found:** `(app)/recipes/[id]/+error.svelte` shows "Recipe not found." inline for any 404
  under `/recipes/[id]`, the edit page included (so `isolation.spec.ts:31` is green already).
- **Actions row:**
  - Edit, Improve with AI, Export, Version history and Delete are in place.
  - Export links to `/recipes/[id]/export` with `download`, which **step 20** must serve.
  - Delete posts `?/delete` through `ConfirmDialog`, and **step 13** must add that action.
  - Share is left out for **step 19**.
  - The PWA-standalone export variant is for **step 24**.
- **e2e:** allowlisted the following.
  - All of `recipe-list.spec.ts` and `recipe-detail.spec.ts`.
  - `isolation.spec.ts:17` and `:31`, `auth.spec.ts:31`, `export.spec.ts:73` and `minimal.spec.ts:28`.
  - The earlier shell and login tests that the run of the full suite found green: `import.spec.ts:39`
    and `minimal.spec.ts:16` and `:61`.

### 13. Create, edit and delete recipes; photo upload

**Goal:** the recipe form (new/edit) with every field, reorderable ingredient and instruction
editors, category picker, tags, delete with confirmation, and photo upload/replace with
server-side WebP re-encoding. Saving an edit also writes a version snapshot.

**Done when:** these are green and allowlisted:

- `recipes-crud.spec.ts`
- `photos.spec.ts`
- the rest of `isolation.spec.ts`
- `http-contract.spec.ts › recipe photo files`

**Commit:** `feat(recipes): create, edit, delete and photo upload`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 13), then plan Step 13.

Reference: main:backend/src/services/recipe.service.ts (write paths), recipe-version.service.ts
(snapshot on update), image-prep.service.ts, ingredient-parser.ts, iso-duration.ts,
middleware/upload.ts, multer-error.ts, schemas/recipe.schema.ts, controllers/recipes.controller.ts
(post/put/delete/photo), main:frontend/src/pages/RecipeFormPage.tsx and components
IngredientListEditor, InstructionListEditor, ReorderableListEditor, CategoryPicker, ImageUpload,
ConfirmDialog; src/lib/shared/recipe-form.ts.
- /recipes/new and /recipes/[id]/edit: one form component, with load and form actions (Zod
  validation with the same rules and messages; fail() with field errors). Progressive
  enhancement with use:enhance. Redirect to the recipe after saving.
- Reorderable lists: keyboard and pointer reordering with the same accessible names as main
  (use svelte-dnd-action or native pointer events, whichever gives cleaner accessible code).
- Photo upload: its own action or +server.ts taking request.formData(). Same allowlist of
  types (jpeg/png/webp/gif, no SVG), 25 MB ceiling, sharp re-encode to WebP, saved under
  UPLOADS_DIR/recipes/<id>/<uuid>.webp, old file removed. A refused upload leaves the photo
  unchanged and tells the user why (main's message). Check BODY_SIZE_LIMIT is set wherever the
  server runs (e2e config, Dockerfile).
- Delete: confirm dialog, removes the recipe and its uploads dir.
- Edits write a recipe_versions snapshot exactly as main does (the history UI is step 14).
Port the related unit tests (ingredient-parser, iso-duration, image-prep, upload helpers).
Add the green tests to e2e/ported-specs.txt. Tick Step 13 and commit as
"feat(recipes): create, edit, delete and photo upload".
```

**Outcome.** The form is one `RecipeForm` component posting `?/save` on both pages (Kit forbids
mixing a `default` action with the edit page's `?/photo`). Seams later steps build on:

- **Write services** (`#lib/server/services/recipes.ts`): `createRecipe(input, { familyId, authorId })`
  returns the id; `updateRecipe(id, input, familyId)` and `deleteRecipe(id, familyId)` return false
  for another family's recipe; `setRecipePhoto(id, path, familyId)`. `getRecipe` takes an optional
  transaction. `updateRecipe` writes the `recipe_versions` snapshot in the same transaction, before
  the update (`savedAt` = the replaced `updated_at`), on every save, as on main; **step 14's revert
  calls it** with the snapshot turned back into a `RecipeBody`. Tags and categories are upserted
  lowercased and pruned when orphaned (`tags-categories.ts`). `DbExecutor` (`db/index.ts`) types
  "the client or a transaction".
- **Validation:** `RecipeBodySchema` (`#lib/server/recipe-schema.ts`, Zod 4, main's rules and
  Zod's messages, plus `.int()` on the integer time columns). The form posts named fields read by
  `formStateFromFormData` (`#lib/shared/recipe-form.ts`), then `recipeInputFromForm`, then the
  schema, in `parseRecipeForm` (`#lib/server/recipe-form-action.ts`), which returns
  `fail(400, { values, errors })` so a no-JS failure re-renders what was typed.
- **Shared helpers:** `parseIngredientLine` (`#lib/shared/ingredient-parser.ts`, for steps 14, 20
  and 21), `isoDurationToMinutes`/`minutesToIsoDuration` (`iso-duration.ts`, step 20),
  `prepareImageForModel` (`#lib/server/image-prep.ts`, step 23) next to `optimizeRecipePhoto`.
- **Photos:** `uploads.ts` now writes too: `checkPhotoFile` (type allowlist, 25 MB),
  `saveRecipePhoto`, `deleteUploadedFile`, `deleteRecipeUploadsDir`, `absoluteUploadPath`. The
  `?/photo` action answers `fail(400, { photoError })` with a `PhotoError` kind; Kit 3 sends that
  status on enhanced requests too, which `photos.spec.ts` relies on. `PhotoUpload` shows the
  translated reason inline and checks the size before uploading. `BODY_SIZE_LIMIT=30M` was already
  set in the Dockerfile and the e2e config. **Step 19's share import** adds main's
  `copyRecipeUpload` here.
- **Drafts (steps 21 and 23):** `RecipeForm` takes `initial: RecipeFormState`; a new recipe posts
  `image_path` as a hidden field, and `createRecipe` keeps it only as an external http(s) URL. The
  nutrition card has a marked spot for **step 22's** "Estimate with AI" button.
- **Reordering** is native pointer events plus dnd-kit's keyboard scheme on the handle (Space/Enter,
  arrows, Escape), with translated `aria-live` announcements (`reorder_*` messages). No e2e spec
  covers it, so `ReorderableListEditor.svelte.spec.ts` does.
- **Fixed on the way** (both broke forms submitted before hydration or without JS):
  - `Referrer-Policy` is `same-origin`, not helmet's `no-referrer`: under that, Chrome sends
    `Origin: null` on a native form POST and Kit's CSRF check refused it.
  - A plain `value={...}` on an input wipes what was typed before hydration (`bind:value` keeps
    it). The login and register email fields now use `defaultValue`; the form binds everything.
- **e2e:** allowlisted `recipes-crud.spec.ts`, `photos.spec.ts`, all of `isolation.spec.ts`,
  `http-contract.spec.ts:126` and `minimal.spec.ts:44`.

### 14. Version history

**Done when:** `versions.spec.ts` is green and allowlisted.

**Commit:** `feat(recipes): version history, compare and revert`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 14), then plan Step 14.

Reference: main:backend/src/services/recipe-version.service.ts, recipes.controller.ts (versions
endpoints), main:frontend/src/pages/RecipeVersionsPage.tsx, src/lib/shared/recipeDiff.ts and
recipe-snapshot.ts.
Build /recipes/[id]/versions: a load listing versions (family-scoped; another family gets
"Recipe not found."), version selection, a comparison with the current recipe, and a revert
form action that is itself undoable (reverting snapshots the current state first, as on main).
Cancelling leaves the recipe untouched. Match main's accessible names and texts. Add
versions.spec.ts to e2e/ported-specs.txt. Tick Step 14 and commit as
"feat(recipes): version history, compare and revert".
```

**Outcome.** `/recipes/[id]/versions` picks its version through `?version=<id>` (the newest when
it's missing or not this recipe's), as the list does with its filters. The load reads only that one
snapshot and runs `diffRecipes` on the server, so the page just renders the two `VersionPane`s.

- **Without JS:** the select sits in a GET form with a `<noscript>` Compare button, which needs one
  new message, `recipe_versions_compare`.
- **A pick before hydration:** an attachment on the select catches it up.
- **Dates:** printed in UTC on the server, then in the reader's time zone once hydrated.

Seams later steps build on:

- **Services** (`#lib/server/services/recipe-versions.ts`): `listVersions`, `getVersion` and
  `revertToVersion`, all scoped by joining `recipes.familyId`. `snapshotToRecipeBody` turns a
  snapshot back into a save. It never carries `image_path`, so a revert leaves the photo alone.
- **Revert:** `?/revert` goes through `updateRecipe`, which snapshots the replaced state first, so a
  revert can itself be reverted. An unknown version answers `fail(404, { revertError })`, shown
  inline. The "reverted" toast is shown from the enhance callback, so a no-JS revert redirects
  without it.
- **List components:** `IngredientList` and `InstructionList` take an optional
  `line: Snippet<[index]>` that renders a row in place of its plain text (`DiffText`, the
  highlights).
- **e2e:** allowlisted all of `versions.spec.ts`, which replaces the old `:110` placeholder entry.
  See the open issue on the edit form's hydration race.

### 15. Settings

**Goal:** language, units and small-volume preferences, the JSON import/export switch, change
password, and delete account. Family and the AI usage card come later.

**Done when:** these are green and allowlisted:

- `settings.spec.ts`
- `i18n.spec.ts › signed-in pages are translated`
- `i18n.spec.ts › the Settings page heading is translated`

**Commit:** `feat(settings): preferences, password change and account deletion`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 15), then plan Step 15.

Reference: main:frontend/src/pages/SettingsPage.tsx, main:backend/src/controllers/me.controller.ts,
schemas/user-preferences.schema.ts, services/user-profile.service.ts,
services/account-deletion.service.ts, the deleteUser hooks in main:backend/src/auth.ts.
- /settings (protected) as sections with form actions: preferences (locale, unit system,
  small volumes, JSON import/export), validated against the shared enums. Changing the
  language updates users.locale and the Paraglide cookie, and the UI switches at once (no
  reload needed beyond SvelteKit's own invalidation).
- Change password through auth.api.changePassword with revokeOtherSessions. Mismatched new
  passwords are flagged before submit, and a wrong current password is rejected (main's
  messages).
- Delete account: enable better-auth deleteUser with beforeDelete/afterDelete hooks ported to
  Drizzle (the family clean-up exactly as main), password-confirmed, then signed out.
- Leave seams in the page for the family section (step 18) and the AI usage card (step 22).
Add the green tests to e2e/ported-specs.txt. Tick Step 15 and commit as
"feat(settings): preferences, password change and account deletion".
```

**Outcome.** `/settings` is four cards (Language, Password, JSON import/export, Danger zone) over
three form actions. Every form works before hydration and without JS. Seams later steps build on:

- **`?/preferences`** takes any subset of `locale`, `unitSystem`, `smallVolumes` and
  `jsonImportExportEnabled` (`'true'`/`'false'`). `parsePreferences` (`#lib/server/preferences.ts`)
  validates it against the shared enums, and `updatePreferences`
  (`#lib/server/services/user-preferences.ts`) saves it, the language through `saveLocaleChoice`.
  As on `main`, Settings shows no unit pickers: **step 23**'s chat page posts its unit selects to
  `/settings?/preferences`.
- **Switching language without a reload:** the root layout load returns `locale`, and
  `+layout.svelte` wraps the header and main in `{#key data.locale}`. An enhanced form calls
  `applyLocale(locale)` (`#lib/locale-client.ts`, which moves `<html lang>`) before `update()`.
  **Step 16**'s onboarding picker does the same. A plain form POST can't do this, because the
  response's language was settled before the action ran. So a non-enhanced language change
  redirects back to `/settings`.
- **Early picks:** a language picked before hydration is caught up by an attachment. It waits a
  `tick()` first, so `use:enhance` is attached and the submit doesn't become a full-page POST. The
  JSON switch is the form's submit button and isn't optimistic: it shows what is saved, as on
  `main`.
- **Password and delete** call `auth.api.changePassword` (`revokeOtherSessions: true`) and
  `auth.api.deleteUser({ password })`. Errors are better-auth's own text ("Invalid password"),
  through `authRefusal` (`#lib/server/auth-forms.ts`). `changePasswordLimiter` and
  `deleteAccountLimiter` carry better-auth's `/change-password` and `/delete-user` limits over to
  the actions.
- **Account deletion:** `deleteUser.afterDelete` is `cleanUpFamilyAfterDelete`
  (`#lib/server/services/account-deletion.ts`). better-auth passes the session user, `familyId`
  included, to both hooks, so `main`'s `beforeDelete` and its in-memory map are gone.
  `lockFamilies`, `deleteFamilyIfEmpty` and `removeRecipeUploads` are in `services/family.ts` for
  **step 18**.
- **Seams:** the page has marked spots for Family (**step 18**) and AI usage (**step 22**), and
  its load has a comment where `family` and the AI budget go.
- **Zod in tests:** `import { z } from 'zod'` comes back undefined under `bun --bun vitest`.
  `import * as z from 'zod'` works. No earlier spec had loaded Zod at runtime.
- **e2e:** allowlisted all of `settings.spec.ts`, `i18n.spec.ts:116` and `:146` (all four
  locales), and `minimal.spec.ts:53`.

### 16. Onboarding

**Done when:** these are green and allowlisted:

- `onboarding.spec.ts`
- `auth.spec.ts › registration` (both tests)

**Commit:** `feat(onboarding): first-run flow`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 16), then plan Step 16.

Reference: main:frontend/src/pages/OnboardingPage.tsx (about 420 lines; the step flow and
copy) and how main decides when to send a user there.
Rebuild /onboarding the SvelteKit way: steps as client-side state on one page, or as form
actions where a step saves something. Picking a language switches the flow to it at once and
saves it to users.locale. Finishing lands on the recipe list. Reuse the settings actions or
services from step 15 rather than duplicating them. Replace the step-11 placeholder. Add the
green tests to e2e/ported-specs.txt. Tick Step 16 and commit as "feat(onboarding): first-run
flow".
```

**Outcome.** `/onboarding` is one page. The steps are client state, and two form actions do the
saving. Seams later steps build on:

- **Full-screen pages:** a page whose load returns `fullScreen: true` gets no app header or footer.
  The root layout reads it from `page.data` and renders the page outside its `{#key data.locale}`,
  so a language switch doesn't remount it and lose its state. Such a page keys its own markup on
  `data.locale`.
- **Language pick:** the buttons submit to `/settings?/preferences`, step 15's action, with
  `use:enhance`. Then `applyLocale`, then `update({ navigate: false })`. **Kit 3's `enhance`
  navigates to the action's page** on success when it belongs to another route, as a native submit
  would, so **step 23**'s unit selects need `navigate: false` too.
- **Clicks before hydration:** the language buttons are `disabled` until mount, since a full-page
  POST would land on `/settings`, and Playwright waits for them to be enabled. Next and Back are
  client state, so the flow needs JS, as on `main`, which rendered nothing without it.
- **Finishing:** the `?/finish` action redirects to `takeReturnTo(event)`, which is the page a
  signed-out visitor was headed to before registering, or `/`.
- **Family:** `getFamily(familyId)` in `services/family.ts` returns the shared `Family` DTO, with
  members oldest first. **Step 18** reuses it for Settings. The `/join-family/…` link it shows
  doesn't resolve until then.
- **Install step:** `detectInstallPlatform(userAgent, maxTouchPoints)` is in
  `#lib/shared/install-platform.ts`, and `isStandalonePwa()` is in `#lib/install-platform.ts`, both
  for **step 24**. Both are read on mount. SSR assumes the install step is shown.
- **e2e:** allowlisted all of `onboarding.spec.ts` and `auth.spec.ts:5` (the `registration`
  describe, which takes over step 11's `:18`). Both passed 10 of 10 runs with `--repeat-each=10`.

### 17. Password reset email

**Done when:** these are green and allowlisted:

- `auth.spec.ts › password reset`
- `minimal.spec.ts › the login page has no Forgot your password? link`

**Commit:** `feat(auth): forgot and reset password via Resend`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 17), then plan Step 17.

Reference: main:backend/src/services/email.service.ts, sendResetPassword in
main:backend/src/auth.ts, main:frontend/src/pages/ForgotPasswordPage.tsx and
ResetPasswordPage.tsx.
- Port email.service with the resend SDK (RESEND_BASE_URL honoured for the e2e fakes). Email
  is "configured" only when RESEND_API_KEY and EMAIL_FROM are set. The reset link is
  ${ORIGIN}/reset-password?token=…, the same URL as main, since links in inboxes must keep
  working.
- Add sendResetPassword to src/lib/server/auth.ts: a silent no-op when email isn't configured.
- /forgot-password and /reset-password as form actions over auth.api.requestPasswordReset and
  resetPassword. The same confirmation shows for unknown emails, a missing or invalid token is
  reported, and success signs out other sessions.
- The login page shows "Forgot your password?" only when email is configured (from the layout
  or page load).
Add the green tests to e2e/ported-specs.txt. Tick Step 17 and commit as
"feat(auth): forgot and reset password via Resend".
```

**Outcome.** `/forgot-password` and `/reset-password` are public pages, each with one form action
over `auth.api.requestPasswordReset` and `auth.api.resetPassword`. Both work without JS. Seams later
steps build on:

- **Email:** `#lib/server/services/email.ts` holds `isEmailConfigured()` (`RESEND_API_KEY` and
  `EMAIL_FROM`; `APP_BASE_URL` is gone) and `sendPasswordResetEmail`. The latter builds a `Resend`
  client per send, with `RESEND_BASE_URL` passed as `baseUrl`. The link is
  `${ORIGIN}/reset-password?token=…`, as on `main`. better-auth's own `url` is ignored.
- **`sendResetPassword`** in `auth.ts` returns silently when email isn't configured. better-auth
  answers unknown emails with the same success, so the "Check your email" confirmation never says
  whether an account exists.
- **The token** travels from the link's query into a hidden form field. Without one, the page shows
  "Invalid link". A bad token shows better-auth's own "Invalid token". Success redirects to `/login`:
  `revokeSessionsOnPasswordReset` has dropped every session, this browser's included.
- **The login flag** is `passwordResetEnabled` in the login page's own load, not the layout, since
  no other page needs it.
- **Rate limits:** `passwordResetRequestLimiter` (5 per 15 minutes) and `passwordResetLimiter` (10)
  carry better-auth's `/request-password-reset` and `/reset-password` rules over to the actions.
- **e2e:** allowlisted `auth.spec.ts:68`. `minimal.spec.ts:61` was already listed and now checks a
  real flag. Both passed 5 of 5 runs with `--repeat-each=5`.

### 18. Families

**Done when:** `family.spec.ts` is green and allowlisted.

**Commit:** `feat(family): invite links, join and leave`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 18), then plan Step 18.

Reference: main:backend/src/services/family.service.ts (join, leave, merge collections, orphan
sweep), controllers/family.controller.ts, routes/family.routes.ts (rate-limited join),
utils/invite-token.ts, main:frontend/src/pages/JoinFamilyPage.tsx, the family section of
SettingsPage.tsx, hooks/useInvalidateFamilyData.ts.
- Port the family service to Drizzle in transactions. Merge and leave semantics must match main
  exactly, because this is where data moves between families. Port or write service tests
  (merge, leave, last member cannot leave) against TEST_DATABASE_URL.
- Settings: the family section (members, invite link, leave).
- /join-family/[token] (public): a signed-out invitee is sent to log in and comes back. Joining
  is a rate-limited form action. An invalid token shows main's error.
- After leaving, a recipe page viewed before is "Recipe not found." without a reload. Load
  functions re-run on navigation, so make sure nothing caches family data client-side.
Add family.spec.ts to e2e/ported-specs.txt. Tick Step 18 and commit as
"feat(family): invite links, join and leave".
```

**Outcome.** `joinFamily`, `leaveFamily` and the private `mergeFamilyContent` are in
`#lib/server/services/family.ts`. Each runs in one `db.transaction`, statement for statement as on
`main`: categories, then tags (`INSERT … ON CONFLICT DO NOTHING`), then recipes, with the merge only
when the joiner was alone. Settings has the Family card and a `?/leaveFamily` action.
`/join-family/[token]` is public, with one default action. Seams later steps build on:

- **`FamilyError`** lives in `#lib/server/family-error.ts`, and `kindedError` maps it (404/409/409)
  with `main`'s English messages, as `main` showed the server's text.
- **`createFamily(executor = db)`** takes a transaction, which `leaveFamily` uses. The auth hook
  still calls it bare. `inviteUrl(origin, token)` builds the link for Settings and onboarding.
- **Flash notices:** `#lib/server/flash.ts` has `setFlash(event, key)` and `takeFlash`. The root
  layout load hands the key to `+layout.svelte`, which shows it as a toast. Unlike a toast fired in
  an enhance callback, this also survives a plain POST or a click before hydration. Keys, not text,
  so the toast is in the viewer's language. "You've joined the family" is the first one. **Step 19**'s
  "Save a copy" can add its own.
- **Logging in to join:** a signed-out POST calls `rememberReturnTo(event, event.url.pathname)`. It
  now takes an explicit path, which an action may store. Then it redirects to `/login`, and the
  login action's `takeReturnTo` brings the visitor back. Register goes through onboarding's
  `?/finish`. Nothing happens on load, so previews can't use the invite up.
- **Nothing to invalidate:** there is no client cache. Loads read `familyId` fresh on every request,
  so a recipe of the old family 404s on the next navigation, `goBack()` included.
- **Service tests:** `family.db.spec.ts` covers the merge (including duplicate tags and
  categories), invalid and same-family tokens, a sharing member joining a third family, leaving,
  and that the last member can't leave.
- **e2e:** allowlisted all of `family.spec.ts`. It passed 10 of 10 runs with `--repeat-each=10`.

### 19. Public share links

**Done when:** `share.spec.ts` is green and allowlisted.

**Commit:** `feat(share): public share links`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 19), then plan Step 19.

Reference: CLAUDE.md "Public share links", main:backend/src/services/recipe-share.service.ts,
controllers/shared.controller.ts, routes/shared.routes.ts, utils/share-token.ts,
copyRecipeUpload in middleware/upload.ts, main:frontend/src/pages/SharedRecipePage.tsx,
components/ShareRecipeDialog.tsx.
- The share dialog on the recipe page: create (idempotent), copy (confirmed with a toast),
  stop sharing (nulls share_token). Sharing again makes a new token.
- /share/[token] (public, outside the protected group): load with optional session, rendering
  RecipeDetailView minus ids. The owner's family is pointed to its own copy. An unknown token
  shows the dead-link page.
- The shared photo needs its own public endpoint (e.g. /share/[token]/photo/+server.ts), since
  /uploads is family-gated. The URL is internal and free to change.
- "Save a copy" form action (requires login): copy the recipe into the caller's family,
  recreating tags and category by name and copying the photo file.
- Visitors who log in or register from the page come back to it (register goes through
  onboarding first), using the redirectTo mechanism from step 11.
Add share.spec.ts to e2e/ported-specs.txt. Tick Step 19 and commit as
"feat(share): public share links".
```

**Outcome.** The recipe page's Share button opens `ShareRecipeDialog`, which posts `?/share` and
`?/unshare` on `/recipes/[id]`. The load hands it `shareUrl`. `/share/[token]` is public, with one
`?/import` action. Copying is confirmed by the button turning into "Copied!", which is what main did
and what the spec checks, so there is no separate toast. Seams later steps build on:

- **Services** (`#lib/server/services/recipe-share.ts`):
  - `enableShare` is idempotent and race-safe: it updates only while `share_token IS NULL`.
  - `enableShare` and `disableShare` both keep `updated_at` (set to itself, since the schema's
    `$onUpdate` would bump it). Sharing isn't an edit.
  - `getSharedRecipe` drops `id`, `share_token` and `category_id`, and adds `own_recipe_id` for the
    owner's family (the `SharedRecipe` DTO).
  - `importSharedRecipe` copies through `createRecipe`. Tags and the category travel by name, and
    ingredient lines are parsed again, as on every save. Main copied the parsed columns as stored.
  - `getRecipeByShareToken` (`recipes.ts`) is the one read not scoped by family, on purpose.
- **A malformed, unknown or stopped token** is the same 404, shown by `share/[token]/+error.svelte`
  as the dead-link page. The page is `Cache-Control: no-store`.
- **Photos:** a local photo is served from `/share/<token>/photo` (`Cache-Control: no-cache`, so
  stopping sharing takes it down too). Remote URLs pass through. `uploads.ts` gained
  `resolveStoredUpload` and `copyRecipeUpload`. The copy is best-effort: a missing file still
  copies the recipe.
- **Coming back after logging in:** explicit links can ask for it with `/login?redirectTo=<path>`
  or `/register?redirectTo=<path>`. Both loads call `rememberRequestedReturnTo`, which puts a
  same-origin path into step 11's return-to cookie, and the existing `takeReturnTo` calls do the
  rest (register goes through onboarding's `?/finish`). Protected redirects still go to a bare
  `/login`. A signed-out POST to `?/import` sends the visitor to log in, as join-family does.
- **Flash:** the `recipe_imported` key shows "Added to your recipes" on the new copy.
- **Tests:** `recipe-share.db.spec.ts` covers idempotence and `updated_at`, other families, stop
  then share again, the public shape, photos, and import (including a missing photo file).
- **e2e:** allowlisted all of `share.spec.ts`. It passed 90 of 90 runs with `--repeat-each=10`.
  `recipe-list.spec.ts:116`, the open issue's filter-chip race, failed now and then under local
  load. HEAD fails it just as often (8 of 20), so this step doesn't cause it.

### 20. JSON-LD import and export

**Done when:** these are green and allowlisted:

- `import.spec.ts › JSON-LD import`
- `export.spec.ts`

**Commit:** `feat(import): JSON-LD import and export`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 20), then plan Step 20.

Reference: main:backend/src/services/jsonld-import.service.ts, jsonld-export.service.ts,
strip-html.ts, import-log.service.ts, recipes.controller.ts (importRecipe, exportRecipe),
main:frontend/src/pages/ImportPage.tsx, lib/export-share.ts.
- Port both services and their unit tests (jsonld-import, jsonld-export, strip-html,
  import-log).
- /import: paste JSON-LD or upload a .json file (2 MB cap). On success, save straight away and
  open the new recipe. Invalid JSON shows main's error and saves nothing. The page and the
  "Import JSON-LD" menu entry exist only while the JSON import/export preference is on.
- Export: a +server.ts GET (e.g. /recipes/[id]/export) that streams the schema.org JSON-LD
  as a download with main's filename. Offered only while the preference is on. An exported
  file must import back as the same recipe.
Add the green tests to e2e/ported-specs.txt. Tick Step 20 and commit as
"feat(import): JSON-LD import and export".
```

**Outcome.** `/import` is one default action that takes pasted text or a `.json` file (a file wins,
2 MB cap), saves it straight away and redirects to the new recipe. `/recipes/[id]/export` is a
`+server.ts` download named `<slug>.json`, as on main. Both 404 while the JSON import/export
preference is off, so they exist only when the menu entry and the Export button show. Seams later
steps build on:

- **Parsing and serializing** live in `#lib/server/jsonld-import.ts` (`parseRecipeFromJsonLd`,
  `findRecipeNode`), `#lib/server/jsonld-export.ts` (`recipeToJsonLd`) and
  `#lib/server/strip-html.ts`. These are main's code. One change: the parser returns a `RecipeBody`
  with ingredients as plain lines, since `createRecipe` parses every line on save. **Step 21**
  turns that body into its draft.
- **Errors:** main's English messages are returned as `fail(400, { message })`:
  - malformed JSON shows the parser's own `SyntaxError` text (Bun's "JSON Parse error: …");
  - a document that isn't an object or array has its own message;
  - so does a document with no Recipe in it.
- **The upload form** submits as soon as a file is picked. A `<noscript>` button covers no-JS use.
  A failed upload clears the input, so the same file can be picked again.
- **Export in an installed PWA:** the plain `<a download>` traps a standalone iOS PWA in Quick Look.
  So only under `isStandalonePwa()` does the recipe page prefetch the file and hand it to Web Share
  or a Blob download on click (`#lib/export-share.ts`, main's code). Browser tabs keep the plain
  link.
- **Import analytics for step 21:** `logImportAttempt` (`#lib/server/services/import-log.ts`) and
  `ImportMethod` (next to `UrlImportError`) are ported but not called yet. Step 21 calls them.
- **Tests:**
  - `jsonld-import.spec.ts`, `jsonld-export.spec.ts` (with an export → import round trip) and
    `strip-html.spec.ts` are main's tests;
  - `import-log.db.spec.ts` runs against `TEST_DATABASE_URL` instead of a mocked Prisma.
- **e2e:** allowlisted `import.spec.ts:38` (the JSON-LD describe) and all of `export.spec.ts`. They
  replace the step 12 entries `import.spec.ts:39` and `export.spec.ts:73`. They passed 70 of 70 runs
  with `--repeat-each=10`.

### 21. URL import

**Done when:** these are green and allowlisted:

- `import.spec.ts › URL import`
- `minimal.spec.ts › a page behind a bot challenge reports the block…`

The network-layer unit tests are ported and pass on Bun.

**Commit:** `feat(import): URL import with SSRF-safe fetch and browser fallback`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 21, and the "Bun runtime notes" from step 2),
then plan Step 21.

Reference: CLAUDE.md "URL import", main:backend/src/services/url-recipe-import.service.ts,
utils/safe-fetch.ts, ssrf-proxy.ts, headless-fetch.ts, url-import-error.ts,
schemas/url-import.schema.ts, and tests safe-fetch*.test.ts, ssrf-proxy.test.ts,
headless-fetch.test.ts, url-recipe-import.service.test.ts; main:frontend/src/pages/UrlImportPage.tsx.
- Port the network stack using step 2's decisions. Where Bun needed a different
  implementation, write it Bun-native rather than forcing undici/node:http to fit. The security
  properties are not negotiable: DNS pinned to checked addresses, every redirect hop
  re-checked, every browser request through the per-fetch authenticated proxy that re-checks
  CONNECT and HTTP hops, E2E_SAFE_FETCH_ALLOW as an exact host:port allowlist only.
- The browser fallback over CDP (BROWSER_CDP_URL, BROWSER_PROXY_HOST): one context per fetch,
  closed afterwards, no UA/locale/timezone emulation. Same fallback triggers as main.
- /import/url: a rate-limited form action. On success, pre-fill the recipe form for review (as
  main does). Saving creates the recipe. A page without a recipe shows an error and stays
  put. A bot-blocked page without a browser fallback reports the block.
- Port the unit tests and make them pass under bun --bun vitest.
Add the green tests to e2e/ported-specs.txt. Tick Step 21 and commit as
"feat(import): URL import with SSRF-safe fetch and browser fallback".
```

**Outcome.** `/import/url` is one rate-limited default action. It fetches the page, logs the
attempt with `logImportAttempt`, then hands the recipe to `/recipes/new` as a draft and redirects
there. Nothing is saved until the cook presses Save. Errors are main's English messages, returned
through `failKinded`. The network stack is in `src/lib/server/`. Seams later steps build on:

- **Pinned fetch** (`safe-fetch.ts`): the Bun recipe from step 2, with no undici.
  - `assertSafeTarget` resolves the host. An IPv6 literal is looked up without its brackets. The
    check uses ipaddr.js `unicast`, and `E2E_SAFE_FETCH_ALLOW` is an exact `host:port` match.
  - `pinnedFetch` dials `addresses[0]` by IP. The hostname goes only in `Host`, plus
    `tls.serverName` for https.
  - Each redirect hop is parsed, checked and dialled again. Cookies carry over in a tough-cookie
    jar.
  - A timeout that fires while the body is streaming is still reported as `timeout`.
- **Proxy** (`ssrf-proxy.ts`): main's `node:http` proxy. Both hops dial the checked IP: plain HTTP
  uses `http.request({ host: address })` and keeps the client's `Host`, CONNECT uses `net.connect`.
  There are no `lookup` callbacks.
- **Browser fallback** (`headless-fetch.ts`): main's code. It reads `BROWSER_CDP_URL` and
  `BROWSER_PROXY_HOST` from `$app/env/private`, opens one context per fetch, and does no
  emulation. The fallback triggers are the same as main's (`services/url-recipe-import.ts`).
- **JSON-LD extraction** uses Bun's built-in `HTMLRewriter` instead of cheerio. Its
  `transform(string)` is synchronous and returns script text raw. Each block goes through step
  20's `parseRecipeFromJsonLd`.
- **Draft hand-off** (`draft-handoff.ts`), for **steps 22 and 23**: `stashDraft(cookies, userId,
draft, source)` and `takeDraft(cookies, userId)`.
  - The cookie (`yumbry-draft`, path `/recipes/new`) carries only a random id. The draft waits in
    an in-memory map for 10 minutes, since a draft can outgrow a cookie.
  - It is bound to the user and taken once, so opening a blank form later never revives an
    abandoned draft. A reload of the review page loses it.
  - `/recipes/new` turns it into the form's `initial`. `RecipeForm`'s new `notice` prop shows
    `recipe_form_reviewing_{url,photo,ai}_draft`.
- **Dependencies:** `ipaddr.js` and `tough-cookie` are pure JS, so they are bundled and sit in
  devDependencies.
- **Tests:** these are main's tests, ported:
  - `safe-fetch.spec.ts` spies on the global `fetch` and asserts the dialled IP, `Host` and SNI;
  - `safe-fetch.socket.spec.ts` uses real Bun `fetch` and fetches a `pinned.invalid` host, which
    proves the hostname was never looked up;
  - `ssrf-proxy.spec.ts` also checks that `Host` is kept and the proxy credentials are dropped;
  - `headless-fetch.spec.ts`;
  - `services/url-recipe-import.spec.ts`.

  `draft-handoff.spec.ts` is new.

- **e2e:** allowlisted `import.spec.ts:99` (the URL import describe) and `minimal.spec.ts:69`. They
  passed 40 of 40 runs with `--repeat-each=10`.

### 22. AI provider, budget, nutrition estimates

**Done when:** these are green and allowlisted:

- `ai.spec.ts › Nutrition estimate`
- `ai-budget.spec.ts › the Settings page shows how much of today's allowance is left`
- `minimal.spec.ts › the recipe form has no Estimate with AI button`
- `minimal.spec.ts › Settings has no AI usage card`

The provider and budget unit tests are ported and pass.

**Commit:** `feat(ai): provider, budget ledger and nutrition estimates`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 22), then plan Step 22.

Reference: CLAUDE.md "AI provider", main:backend/src/services/ai-provider.service.ts,
ai-budget.service.ts, middleware/require-ai-budget.ts, controllers/ai.controller.ts
(nutrition, status), controllers/config.controller.ts, schemas/ai-nutrition.schema.ts, tests
ai-provider.service.test.ts and ai-budget.service.test.ts, main:frontend/src/components/NutritionStats.tsx,
AiErrorBanner.tsx, the nutrition part of RecipeFormPage.tsx, the AI card in SettingsPage.tsx;
src/lib/shared/ai-*.ts.
- Port chatWithAi (four tiers, the small tier via Gemini's OpenAI-compatible endpoint), with env
  read lazily so the app boots without keys. Normalise errors into AiProviderError. Honour
  OPENROUTER_BASE_URL and GEMINI_BASE_URL.
- Port the budget ledger and the checks (monthly pool, per-user daily cap, Gemini daily
  request limit) as a guard function called at the start of each AI action, before any upload
  is read. Refusals carry kind quota_exceeded, scope and retryAt.
- "AI configured" (OPENROUTER_API_KEY) and "nutrition configured" (GEMINI_API_KEY) flags
  replace /api/config. They come from the root layout load and hide AI UI on the minimal
  server.
- The recipe form's "Estimate with AI" fills the nutrition fields, keeping typed values the AI
  leaves blank.
- Settings: the AI usage card shows today's remaining allowance (shared/ai-budget-display).
Port the unit tests. Add the green tests to e2e/ported-specs.txt. Tick Step 22 and commit as
"feat(ai): provider, budget ledger and nutrition estimates".
```

**Outcome.** The provider and ledger are main's code on Drizzle and `$app/env/private`, read at call
time. The four target tests passed 40 of 40 runs with `--repeat-each=10`. Seams for **step 23**:

- **Provider** (`services/ai-provider.ts`): `chatWithAi(messages, { userId, tier, jsonSchema?,
sampling? })`. It has the same tiers, defaults, reasoning efforts and response_format downgrade
  ladder as main, and writes the ledger row itself.
- **Budget** (`services/ai-budget.ts`): `getOpenRouterBudget`, `getGeminiQuota` and `recordAiUsage`.
  Drizzle returns `sum()` over a numeric column as a string, so the sums go through `Number`.
  Main's `readNumberEnv` fallback is gone because `env.ts` already refuses bad numbers at boot.
- **Guards** replace the middleware: `assertOpenRouterBudget(userId)` and `assertGeminiQuota()` throw
  `AiQuotaExceededError` (`#lib/shared/ai-provider-error.ts`, carrying `scope` and `retryAt`). An
  action calls one first, **before `request.formData()`**, and returns `failKinded(err)`.
  `KindedError`, `failKinded`, `throwKinded` and `App.Error` now pass `scope` and `retryAt` through.
- **`AiErrorBanner.svelte`** takes that failure data (`message`, `kind`, `scope`, `retryAt`) and
  renders a spent budget from Paraglide in the reader's time zone.
- **Flags:** the root layout returns `aiConfigured` (`OPENROUTER_API_KEY`) and `nutritionConfigured`
  (`GEMINI_API_KEY`). The Estimate button checks `nutritionConfigured`, not the OpenRouter flag main
  used, because it only calls Gemini. Settings loads `aiBudget` only when OpenRouter is configured.
- **Estimate with AI** is the `estimateNutrition` action (`#lib/server/nutrition-action.ts`) on the
  new and edit pages. It returns `{ estimate }`. The button is `type="button"` and posts the form's
  `FormData` with `deserialize`, then merges the four fields locally with `mergeNutritionEstimate`.
  It is not a second submit button because a submit button ahead of Save would become the form's
  default and run on Enter. It therefore needs JS, as main's did.
- **Tests:** `ai-provider.spec.ts` and `ai-budget.spec.ts` are main's tests ported. The provider
  spec stubs global `fetch`, and the OpenAI SDK uses it under Bun. `ai-budget.db.spec.ts` is new:
  it covers the windows, numeric sums, guards and ledger writes on a real database.

### 23. AI chat (create/improve) and photo import

**Done when:** these are green and allowlisted:

- all of `ai.spec.ts`
- all of `ai-budget.spec.ts`
- `minimal.spec.ts › the Add recipe menu offers no AI entries`
- `minimal.spec.ts › a recipe offers no Improve with AI action`

**Commit:** `feat(ai): create and improve with AI, photo import`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 23), then plan Step 23.

Reference: main:backend/src/controllers/ai.controller.ts (chat: the big tier only for mode
'create' on the first turn; photo import), schemas/ai-chat.schema.ts, image-prep.service.ts,
main:frontend/src/pages/AiChatPage.tsx, PhotoImportPage.tsx, components RecipePreview.tsx,
src/lib/shared/ai-recipe-draft.ts, render-draft.ts, ai-photo-import.ts.
- /create-with-ai and /recipes/[id]/ai-improve share one chat page component: transcript, live
  draft preview (rendered with the user's units; switching to imperial redraws without asking
  the AI again), error banner that leaves the chat usable. Each turn is a form action (or a
  small +server.ts if streaming or the client-side transcript makes an action awkward;
  justify the choice) guarded by the budget check from step 22. Saving goes through review on
  the recipe form, and improve lands its change on the edit form.
- /import/photo: a rate-limited, budget-guarded upload (25 MB, sharp downscale, image tier) →
  draft for review.
- Menu entries and the "Improve with AI" action are shown only when AI is configured.
Add the green tests to e2e/ported-specs.txt. Tick Step 23 and commit as
"feat(ai): create and improve with AI, photo import".
```

**Outcome.** All of `ai.spec.ts` and `ai-budget.spec.ts` are allowlisted as whole files, replacing
step 22's two line entries. The minimal-server checks (`minimal.spec.ts:16`, `:28`) were already
listed. The new AI specs passed 100 of 100 runs with `--repeat-each=10`, and the full allowlist
(119 tests) is green. Seams and choices:

- **A chat turn is a form action, not `+server.ts`.** `chatWithAi` answers in one piece, so there
  is nothing to stream. Both chat routes mount `?/chat` and `?/review`, from
  `#lib/server/ai-chat-action.ts` (`chatTurn`, `reviewDraft`).
  - **Transcript:** the page holds the transcript and draft and posts them each turn, as hidden
    `messages` / `current_draft` JSON plus the new `message`. The action returns the whole next
    state, and a failure returns `{ ...kinded, messages, draft }`. The page seeds its state from
    `form`, so a plain POST works too.
  - **Server-side checks:** the posted JSON is validated by `#lib/server/ai-chat-schema.ts`, main's
    schema with size bounds added.
  - **Mode and tier:** the mode comes from the route, never from the client. `chatTier` picks big
    only for create on turn 1.
  - **Budget check:** `assertOpenRouterBudget` runs _after_ the small body is read here, so a refusal
    can echo the transcript back. Photo import still checks the budget before reading the upload.
- **The units selects** redraw the preview locally (`renderDraftForReader`), with no AI call. They
  also save the preference by posting to `/settings?/preferences`, fire-and-forget, as main did.
- **The draft hand-off** now carries a target: `stashDraft(..., source, target)` and
  `takeDraft(cookies, userId, target)`, where `null` means `/recipes/new` and a number is the recipe
  whose edit form should take it. The cookie path widened to `/recipes`. A draft for another form is
  left in place. The edit page shows the AI notice and saves through `updateRecipe`. The notice
  mapping is shared in `#lib/draft-notice.ts`.
- **Photo import** (`/import/photo`) is one default action:
  - `photoImportLimiter`, then the budget check, then reading the form;
  - the first non-empty `photo` (the page has camera and file inputs), checked by `checkPhotoFile`;
  - `prepareImageForModel` and the image tier, then the draft is handed off.
  - An empty envelope becomes 422 with the model's reply as the message, as on main. Like main, it
    logs no import attempt.
- **Prompt fix:** main's chat prompt carried literal merge-conflict markers and listed the fields
  twice. The per-serving nutrition block is now `nutritionFieldsSection()`, used by both the chat
  and photo prompts. Their specs assert there are no markers and that each field is listed once.
- **Bun quirk:** `import { z } from 'zod'` came out `undefined` under `bun --bun vitest` for the new
  schema module, so it uses `import * as z`, as `preferences.ts` already did.

### 24. Server-unavailable screen and PWA

**Goal:** the outage screen works, the app is installable again, and **existing installs of
`main`'s PWA move to the new app by themselves**. Their old Workbox service worker would otherwise
keep serving the cached React shell, which calls a `/api` that no longer exists.

**Done when:**

- `server-unavailable.spec.ts` is green and allowlisted.
- A manual test passes: install `main`'s build as a PWA in a Chromium profile, switch the server
  to the new build on the same origin, reopen. The new app loads and nothing breaks.
- Lighthouse marks the app installable.

**Commit:** `feat(pwa): service worker, manifest, legacy SW takeover and outage screen`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 24), then plan Step 24.

Reference: main:frontend/vite.config.ts (VitePWA: manifest, workbox runtimeCaching, sw.js and
registerSW.js names), main:frontend/src/pwa.ts, lib/server-status.ts,
components/ServerUnavailable.tsx, main:backend/src/app.ts (no-cache rules for index.html,
sw.js and the manifest), deploy/offline-worker/*, src/lib/shared/server-availability.ts.
- Outage screen: the spec loads the page, aborts every /api/** request, reloads, and expects
  "Temporarily offline" with "Try again". SSR still renders the page, so detection must
  include a client-side /api/health probe on start and on navigation or action failures
  (fetch errors on __data.json or actions). Retrying re-probes and calls invalidateAll(). Keep
  the copy and accessible names identical.
- PWA, SvelteKit-native: src/service-worker.ts (precache build/files from $service-worker,
  never cache /api, /__data.json or form posts, stale-while-revalidate for /uploads with an
  entry cap, clean up old caches). The manifest stays at /manifest.webmanifest with the same
  name, colours, start_url, scope and icons.
- Legacy takeover: installed copies of main's app have a Workbox worker registered at /sw.js,
  which keeps controlling the page and checks /sw.js for updates. Serve a /sw.js that, once
  installed, deletes every cache, unregisters itself and reloads its clients onto the new app,
  which then registers the SvelteKit worker. Also serve a harmless /registerSW.js. Confirm the
  update check actually fetches /sw.js uncached (Cache-Control headers).
- Check that the Cloudflare offline worker's status-code rules still fit what the app returns
  (it skips 503, which main used for AI errors). Update deploy/offline-worker/README.md if
  they don't.
Do the manual legacy-takeover test described in MIGRATION.md and write down how you did it.
Add server-unavailable.spec.ts to e2e/ported-specs.txt. Tick Step 24 and commit as
"feat(pwa): service worker, manifest, legacy SW takeover and outage screen".
```

**Outcome.** `server-unavailable.spec.ts` is allowlisted and passed 10 of 10 runs with
`--repeat-each=10`. The full allowlist (120 tests) is green, apart from the pre-existing Add recipe
menu flake now listed under Open issues. Seams and choices:

- **Outage detection** lives in `#lib/server-status.svelte.ts`, which is main's `server-status.ts`
  rewritten with runes (`up` / `checking` / `down`). Every suspicion is confirmed by a health ping
  first. `hooks.client.ts` `init` runs `observeFetch()` and then a start probe (`checkServer()`).
  - **Why a fetch observer:** it watches every same-origin `window.fetch`, and Kit calls
    `window.fetch` at request time precisely so it can be wrapped. A rejection, or a non-JSON response
    that `isServerUnavailableResponse` matches, starts a check. Hooks alone miss cases: a non-ok
    `__data.json` throws `HandledHttpError`, which skips the client `handleError`, and several
    enhance callbacks ignore `type: 'error'` results.
  - **The cover:** `ServerUnavailable.svelte` sits in the root layout, outside the `{#key}`. The shell
    under it goes `inert`. "Try again" pings, then calls `markServerUp()` and `invalidateAll()`.
- **Service worker:** `src/service-worker/index.ts`. Kit 3 wants the directory form, with its own
  `tsconfig.json` extending `$app/tsconfig/service-worker`, so the root tsconfig excludes it and
  `bun run check` adds a `tsc -p src/service-worker` pass.
  - It precaches `$app/manifest`'s `immutable` and `assets`, except the manifest itself. It serves
    `/uploads/*` stale-while-revalidate from an unversioned `uploads` cache, keeping only `200`s and
    at most 300 entries. Main's 30-day expiry is dropped.
  - Everything else is left alone: navigations, `/api`, `__data.json` and form posts. It uses
    `skipWaiting` plus `clients.claim`, and deletes every other cache on activate.
  - Main's hourly `registration.update()` became `version.pollInterval` (1 h) in `vite.config.ts`.
- **Intended difference (for step 25's list):** a PWA opened with no network shows the browser's
  offline page. Main showed its cached shell under the outage cover. The user chose network-only
  navigations: pages are rendered per user, so there is no shell to cache.
- **Manifest:** `static/manifest.webmanifest`, main's content verbatim, linked from `app.html`.
  adapter-node serves it as `application/manifest+json`.
- **Cache headers:** adapter-node gives only `/_app/immutable/*` a `cache-control`, so
  `scripts/serve.ts` adds `no-cache` to `/service-worker.js` and `/manifest.webmanifest`. The header
  survives adapter-node's `writeHead` under Bun.
- **Legacy takeover:**
  - `src/routes/sw.js/+server.ts` serves a worker that, once activated, deletes every cache,
    unregisters itself and navigates its windows to their own URL.
  - `src/routes/registerSW.js/+server.ts` is a no-op script. Main's build didn't emit one
    (`injectRegister: false`), but it costs nothing.
  - Both send `cache-control: no-cache`. The browser's update check fetches `/sw.js` past the HTTP
    cache anyway (`updateViaCache: 'imports'`); the header stops Cloudflare's edge from keeping a
    copy.
- **Offline Worker:** its rules still fit. The app's AI errors stay 503 JSON, and the app returns
  no 502, 504 or 52x. Only its README changed: the reasons, and the favicon path.
- **Manual legacy-takeover test**, run on macOS with Playwright's Chromium 1243 (full Chromium,
  `channel: 'chromium'`, headless). It used one persistent profile on `http://localhost:4100`, and a
  scratch database and uploads directory shared by both servers. The script was a throwaway in the
  session scratchpad.
  1. Built `main` in a git worktree (`npm ci`, then shared, frontend and backend builds). Copied
     `frontend/dist` to `backend/public`, ran `prisma migrate deploy` on the scratch database, and
     started `node dist/index.js`.
  2. Phase 1, against main:
     - signed up through `/api/auth/sign-up/email`, created a recipe and uploaded a photo through
       main's API;
     - opened `/` until Workbox controlled the page (controller `/sw.js`, cache
       `workbox-precache-v2-…`);
     - installed it with CDP `PWA.install`. The headless shell lacks the `PWA` domain, hence full
       Chromium. `Page.getInstallabilityErrors` was `[]`.
  3. Stopped main and started this build (`bun scripts/serve.ts`) on the same port, database and
     uploads directory, with main's dev secret as `BETTER_AUTH_SECRET`.
  4. Phase 2 reopened the installed app with CDP `PWA.launch`. A plain tab navigation in that profile
     never commits: Chrome captures in-scope navigations into the app window. Results:
     - **Takeover:** the window first showed main's cached React shell. Its `/api` calls got 404s.
       Then the legacy worker reloaded it onto the SvelteKit page.
     - **After the takeover:** the controller and only registration is `/service-worker.js`, the only
       caches are `cache-<version>` and `uploads`, and the browser console shows no errors.
     - **Session:** still signed in (`yumbry.session_token` kept), and the recipe page opened.
     - **Photo:** after a reload of the recipe page, its photo is in `uploads`.
  5. `curl -I` showed `cache-control: no-cache` on `/sw.js`, `/registerSW.js`,
     `/service-worker.js` and `/manifest.webmanifest`.
- **Installability:** Lighthouse 12 dropped its PWA category, so the check used is the one that
  category reported, Chrome's own installability check. On the new app, `Page.getInstallabilityErrors`
  returns `[]` and `Page.getAppManifest` reports no errors.

## Phase D: Finish

### 25. Full parity pass

**Goal:** prove the migration. Every spec passes, the app looks the same, and nothing from the
scaffold or the old stack is left over.

**Done when:**

- `bun run e2e:all` passes three runs in a row: both projects, locally and in CI.
- `e2e/ported-specs.txt` is deleted, and `bun run e2e` runs the whole suite.
- A screenshot comparison of every page (desktop and mobile) against `main` shows no unintended
  differences.
- `bun run check` reports zero errors and zero warnings.

**Commit:** `test: full e2e suite green on SvelteKit; remove allowlist`

**Prompt:**

```text
Read MIGRATION.md (Decisions, Ground rules, Step 25), then plan Step 25.

1. Run `bun run e2e:all` and fix the app until every spec passes in both the full and minimal
   projects, three runs in a row (look for flakiness: races after enhanced form submits,
   hydration timing). Don't edit specs.
2. Delete e2e/ported-specs.txt and make `bun run e2e` (and CI) run the whole suite.
3. Visual parity: build main (in a git worktree) and this branch. With a scratch Playwright
   script, screenshot every route from main:frontend/src/App.tsx with the same seeded data at
   1280px and 390px, in light conditions, and compare. Fix unintended differences (spacing,
   fonts, focus rings, empty states, toasts, dialogs). List any intended differences in
   MIGRATION.md.
4. Clean-up: unused dependencies, dead components, leftovers from the scaffold or the
   migration (the conversion script, placeholders), TODOs. svelte-check must be clean.
Tick Step 25 and commit as "test: full e2e suite green on SvelteKit; remove allowlist".
```

**Outcome.** The whole suite (124 tests, both projects) is green on the final build: three runs in
a row with local workers, plus a run with `--workers=2` as in CI. Before the fixes, two of three
baseline runs failed on the Add recipe menu. `e2e/ported-specs.txt` and `run-ported.ts` are gone,
`bun run e2e` runs everything and `e2e:all` is dropped. The allowlist had a dead entry
(`i18n.spec.ts:116`), so `i18n.spec.ts:102` ("signed-in pages are translated", four locales) had
never run in CI. It passed as is.

- **Hydration races** (the Open issues entry, now removed). Fixed in the app, specs untouched.
  `--repeat-each=5` over the nine specs that use these controls passed 320 of 320, and
  `versions.spec.ts --repeat-each=20` passed 140 of 140.
  - **Menus are native popovers.** `#lib/components/PopoverMenu.svelte`: a
    `<button popovertarget>` plus a `<div popover>`, placed with CSS anchor positioning, with a
    `getBoundingClientRect` fallback for browsers without it. It opens, light-dismisses and closes
    on Escape before hydration. The header's Add recipe and Profile menus and `CollapsibleActions`
    use it, which replaced bits-ui `NavigationMenu`. That menu opened on a 200 ms hover timer and
    ignored the click once hovering had opened it, so an early click was lost both ways.
    `afterNavigate` closes the menu, but not on the `enter` navigation that hydration itself
    reports. Closing then dropped a menu opened before hydration: the first fix failed 4 of 372
    tests that way.
  - **Filter chips are a GET form.** They are submit buttons with `name`/`value` and keep
    `aria-pressed`. `data-sveltekit-replacestate` and `data-sveltekit-reset="false"` match the old
    `goto(…, { replace: true, reset: false })`. An active chip and "All" send no parameter, and the
    load treats `''` as absent.
  - **The edit form's appended title** came from Svelte's `remove_input_defaults`. On an input with
    `bind:value` plus a spread, it runs in a hydration microtask and collapses the selection that
    Playwright's `fill` makes. A `defaultValue` attribute skips it, and SSR still emits `value`.
    `bind:value` text and number inputs that render before hydration carry one now. Textareas
    have no such skip; none raced.
  - **The other JS-only controls are disabled until hydrated.** That covers the dialog triggers,
    copy-link, the servings stepper and the form's picker, tag, list, photo and estimate buttons.
    The flag lives in `#lib/hydrated.svelte.ts` and the root layout's `onMount` sets it. Playwright
    waits for them to be enabled. Onboarding uses the same flag now.
  - **Checked with JavaScript off:** the menus open and navigate, the chips filter and clear, the
    actions menu opens, and logout works.
- **Visual parity.** `main` was built in a git worktree and both apps ran on fresh databases with
  identical seed data: four users, five recipes, a photo, a share link, an invite token and two
  saved versions with fixed timestamps. The seeding used `e2e/support`'s `Db` and `signUpViaApi`,
  plus SQL. A scratch Playwright script took 40 states at 1280×800 and 390×844, light scheme,
  reduced motion and a fixed clock. That covers every route in main's `App.tsx`, the three menus,
  the share, delete and leave-family dialogs, a version compare, a save toast, an import error and
  the outage cover. `pixelmatch` compared each pair. All but the ones below are pixel-identical,
  the menus included. Fixed along the way:
  - the recipe form and AI chat had `pb-28`/`pb-24` where main has `pb-4`, so there was extra
    space above the footer;
  - the timing fields' labels were inline (wrapped in a `div`) where main's are grid items, which
    moved them 4px;
  - instruction rows lacked main's `mt-2` alignment and block textarea wrapper;
  - the list editor's screen-reader live region came after the Add button, so Tailwind 4's
    `space-y-2` gave that button 8px of bottom margin;
  - a stray space before "(you)" in the family member list;
  - the share link field scrolled to the end of the URL when its text was selected.
- **Intended differences:**
  - **Dialog backdrops cover the header.** Main's Radix overlay had no z-index, so the sticky
    header stayed bright above it.
  - **Menus open on click only.** Main's Radix `NavigationMenu` also opened on hover.
  - **"Estimate with AI"** is hidden when `GEMINI_API_KEY` is unset. Main showed it whenever
    OpenRouter was configured, and it then failed with `not_configured`.
  - **JSON import errors** quote the runtime's `JSON.parse` message: JavaScriptCore under Bun, not
    V8.
  - **The outage cover sits over the server-rendered page.** Main rendered only the cover. The
    viewport looks identical.
  - **A PWA opened offline** shows the browser's offline page (step 24).
  - **Before hydration,** the photo-upload and Estimate buttons look dimmed for a moment (their
    existing `disabled:opacity-50`).
- **Clean-up:**
  - removed `@sveltejs/enhanced-img` and its Vite plugin, and the scaffold's `src/lib/index.ts` and
    `#lib` import entry;
  - removed the empty eslint override block, the old-stack `.gitignore` entries, and dead exports
    (`isModelUnit`, `modelUnitDimension`, `AiStatusResponse`, `AiChatTurnRequest`/`Response`);
  - removed 11 unused message keys and two stale step-number comments.
  - The i18next conversion script was never committed, and there were no TODOs. bits-ui stays, for
    `Dialog.svelte`.
  - Left for later: `rehearse-migrate.ts`, `backups/` and the `svelte` CI branch (step 27). Also
    the e2e `E2E_PUBLIC_DIR` hook, which keeps the harness runnable against main, and the docs
    (step 26).

### 25a. Hydration audit: before-hydration, not no-JS

**Goal:** the code follows the Hydration decision. Several steps wrote "works without JS" where they
meant "works before hydration", so some controls got fallbacks only JS-disabled users would need.
Remove those, and fix any control that still misbehaves before hydration.

**Done when:**

- Every piece of no-JS or before-hydration handling in `src/` is listed in the Outcome as kept,
  removed or changed, each with a one-line reason.
- No `<noscript>` is left, unless the Outcome says why it's still needed.
- The full e2e suite passes three runs in a row, and `bun run check`, `bun run lint` and
  `bun run test:unit -- --run` are clean.

**Commit:** `refactor: align hydration handling with the before-hydration policy`

**Prompt:**

```text
Read MIGRATION.md (Decisions, especially Hydration; Ground rules; Open issues; and the Outcomes
of steps 13 to 25, which record why each workaround was added), then plan Step 25a.

The policy: forms and links must work before hydration (form actions, GET forms, real links).
Supporting browsers with JS turned off is not a goal. Inherently interactive controls are
disabled until `hydrated.current` and need no no-JS fallback.

1. Inventory. Search src/ for `<noscript>`, `hydrated`, comments mentioning "no-JS", "without
   JS" or "before hydration", attachments that catch up input made before hydration, server
   branches that only a non-enhanced post can reach, and flash or redirect paths that exist
   only for no-JS posts. Classify each one:
   - keep: it makes a form or link work before hydration;
   - remove: it only serves JS-disabled users;
   - change: it should become a link or GET form, or be disabled until hydrated.
2. Put the table in your plan. Ask me about every item that isn't clear-cut before changing
   it, for example where removing a fallback changes what an early click does.
3. Apply the changes. Don't edit specs. Never break a form submitted before hydration.
4. Remove the Open issues entries this step resolves, write the Outcome (the final table plus
   any seams), tick Step 25a and commit as
   "refactor: align hydration handling with the before-hydration policy".
```

**Outcome.** No `<noscript>` is left in `src/`, and nothing in it exists only for JS-off browsers.
Every form that rendered enabled still posts natively before hydration. No Open issues entry
belonged to this step.

| Item                                                                                                                    | Verdict | Reason                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `hydrated` flag (`#lib/hydrated.svelte.ts`), set by the root layout's `onMount`                                         | keep    | The policy's mechanism.                                                                                 |
| Dialog triggers, copy-link buttons, servings stepper, tag/category/list/photo/estimate buttons, disabled until hydrated | keep    | Inherently interactive.                                                                                 |
| Onboarding language buttons disabled until hydrated                                                                     | keep    | An early click would be a full-page POST landing on `/settings`.                                        |
| `PopoverMenu` native popover, not closed on the `enter` navigation                                                      | keep    | Menus open and navigate before hydration.                                                               |
| Filter chips as a GET form                                                                                              | keep    | A real GET form.                                                                                        |
| `defaultValue` on `bind:value` inputs                                                                                   | keep    | Hydration would otherwise wipe or collapse early typing.                                                |
| `Referrer-Policy: same-origin`                                                                                          | keep    | A native POST must pass Kit's CSRF check.                                                               |
| Recipe form `fail(400, { values, errors })`                                                                             | keep    | Save renders enabled, so an early submit is a native POST.                                              |
| Settings password mismatch checked on the server                                                                        | keep    | Same: an early submit skips the client check.                                                           |
| Settings JSON switch as the submit button                                                                               | keep    | Works before hydration.                                                                                 |
| Settings language select catch-up attachment                                                                            | keep    | Saves an early pick once enhanced.                                                                      |
| Settings language `<noscript>` Save button                                                                              | removed | Only JS-off users could reach it.                                                                       |
| `?/preferences` redirect for a non-enhanced language change                                                             | removed | Only the `<noscript>` button reached it.                                                                |
| Flash cookie (`#lib/server/flash.ts`)                                                                                   | keep    | Early clicks are native POSTs.                                                                          |
| Draft hand-off cookie                                                                                                   | keep    | Carries the draft across the redirect either way.                                                       |
| Versions select catch-up attachment                                                                                     | keep    | An early pick still navigates.                                                                          |
| Versions `<noscript>` Compare button and its GET form                                                                   | removed | JS-off only; the form is a `div` now, and `recipe_versions_compare` is gone from the messages.          |
| "Reverted" toast from the enhance callback                                                                              | changed | Now the `recipe_reverted` flash key, so an early revert shows it too.                                   |
| JSON-LD upload `<noscript>` button                                                                                      | removed | JS-off only.                                                                                            |
| JSON-LD file input                                                                                                      | changed | A catch-up attachment submits a file picked before hydration.                                           |
| JSON-LD paste and URL import: text seeded from `form`, echoed by `fail()`                                               | removed | Their buttons render disabled while empty, so no native POST happens; enhanced failures keep the state. |
| Photo import `<noscript>` button, and the error falling back to `form`                                                  | removed | JS-off only.                                                                                            |
| Photo import file inputs                                                                                                | changed | A catch-up attachment previews a photo picked before hydration.                                         |
| AI chat seeded from `form` (the `form` prop)                                                                            | removed | The chat is inherently interactive; Send renders disabled.                                              |
| AI chat input, Send and unit selects                                                                                    | changed | Disabled until hydrated. "Save and review" stays a form that works early.                               |
| `chatTurn` with an empty message                                                                                        | changed | `fail(400)`, like a malformed transcript; the page never sends one.                                     |
| Estimate with AI over `fetch`                                                                                           | keep    | Inherently interactive.                                                                                 |
| Version dates in UTC, then local after mount                                                                            | keep    | Rendering, not a fallback.                                                                              |

Seams:

- **Catch-up attachments** are the pattern for a control whose change handler does the work (the
  language select, the version select, the JSON-LD and photo pickers). The attachment runs at
  hydration and acts on a value the DOM already holds. One that submits waits a `tick()` first, so
  `use:enhance` is attached; one that sets state does it in `untrack`.
- **Flash keys** are now `family_joined`, `recipe_imported` and `recipe_reverted`.

### 26. Docs and release tooling

**Done when:**

- `CLAUDE.md`, `README.md`, `e2e/README.md` and `.env.example` describe the SvelteKit/Bun app.
- `scripts/release.sh` works with Bun (dry run).

**Commit:** `docs: describe the SvelteKit + Bun architecture`

**Prompt:**

```text
Read MIGRATION.md (all of it), then plan Step 26.

- Rewrite CLAUDE.md for the new architecture, in the same style and depth as main's: commands
  (bun), the route layout and groups, load/action conventions, guards and family scoping,
  auth (including what's load-bearing: cookie names, ORIGIN, no cookieCache), the Paraglide
  setup, Drizzle (schema rules, migrate script, no hand-edited migrations, the Prisma-era
  baseline), uploads, URL import, AI, PWA and service worker (including the legacy /sw.js
  takeover), e2e rules, and where framework-free logic lives. Remove everything about
  Express, React, Prisma, workspaces and shared/ builds.
- README.md: setup, development, Docker, environment and upgrade notes for self-hosters
  (ORIGIN replaces BETTER_AUTH_URL and APP_BASE_URL; the migration runs automatically on
  start).
- e2e/README.md: the contract table and how to run, with Bun.
- scripts/release.sh: bump the version with Bun (no npm workspaces any more), read the version
  with bun instead of node. Dry-run it without committing or tagging.
Tick Step 26 and commit as "docs: describe the SvelteKit + Bun architecture".
```

**Outcome.**

- **`CLAUDE.md`** is rewritten for this branch, at `main`'s depth. It covers:
  - commands, the vitest projects and the `db:*` scripts;
  - the server platform: env, `ORIGIN` and `serve.ts`, hooks, rate limits, kinded errors;
  - routes, loads and actions, and the hydration policy;
  - guards and family scoping, and auth, with what is load-bearing;
  - Paraglide, Drizzle and the Prisma-era baseline, uploads, share links, URL import, AI and email;
  - the PWA, including the legacy `/sw.js` takeover;
  - frontend conventions, `src/lib/shared/`, Docker, and the e2e rules.

  Nothing about Express, React, Prisma, workspaces or `shared/` builds is left.

- **`README.md`** is rewritten for self-hosters: setup with the required variables, an environment
  table, "Upgrading from 1.x", development on Bun, testing, Drizzle migrations and releasing. The
  upgrade notes say `ORIGIN` replaces `BETTER_AUTH_URL` and `APP_BASE_URL`, that the database migrates
  itself on start, and that 1.x can still roll back. Two stale claims were dropped:
  - "no sharing between accounts" (families and share links exist now);
  - "ah.nl is refused straight away" (no such list exists, on `main` either).
- **`e2e/README.md`** lists the env vars `appEnv` actually passes. `NODE_ENV`, `BROWSER_CDP_URL` and
  `BROWSER_PROXY_HOST` were missing. `RESEND_BASE_URL` is passed by the app, not read by the SDK.
- **`.env.example`** documents `BROWSER_PROXY_HOST`, and a stale `/api/auth/forget-password` note is
  gone. The other variables it leaves out are test-only.
- **`scripts/release.sh [patch|minor|major|<version>] [--dry-run]`** bumps only the root package with
  `bun pm version` and reads the version with `bun -p`. It refuses a dirty tree, and commits only
  `package.json`. `--dry-run` prints `Would release vX.Y.Z` and restores `package.json`.
  - **Dry run:** done in a throwaway clone for patch, minor, major and an explicit version. It left
    no commit, tag or change behind.
  - **e2e version:** `e2e/package.json` lost its unused `version`, so a release never touches
    `bun.lock`.

### 27. Production cutover

**Goal:** release the SvelteKit app to production with a rehearsed, reversible plan.

**Done when:**

- The rehearsal passes on a copy of current production data.
- The release is deployed, and the post-deploy checks pass.
- Rollback was rehearsed once.

**Commit:** `chore: cutover notes` (and the release commit made by `scripts/release.sh`)

**Prompt:**

```text
Read MIGRATION.md (all of it), then plan Step 27. This step touches production: ask before
every action outside this repo (deploys, Coolify settings, pushes, releases).

Prepare and walk me through the cutover:
1. Rehearsal (local or staging, never production):
   - Restore a fresh production pg_dump and a copy of the uploads_data volume.
   - Run the new image against them with step 3's rehearsal script and confirm row counts are
     unchanged.
   - Log in as an existing test account. Open recipes with photos and check they load.
   - Session continuity: take a session cookie issued by main's v1.3.1 container on that same
     data and check the new app accepts it without a new login.
   - Installed-PWA takeover (step 24) against the staging origin.
2. Rollback rehearsal: stop the new app, start the v1.3.1 image on the same database (now with
   the drizzle schema added). Confirm it works and the sessions are still valid.
3. Write a cutover checklist in MIGRATION.md:
   - Coolify env: set ORIGIN; remove BETTER_AUTH_URL and APP_BASE_URL after the switch; keep
     BETTER_AUTH_SECRET unchanged.
   - Volume names and mount path, and the build target (arm64).
   - Backup right before deploying: pg_dump plus a tar of uploads_data.
   - Deploy: merge svelte → dev → main, then release (major version, as it's a new stack).
   - Post-deploy smoke checks: health, login, photos, share link, URL import, AI chat, PWA.
   - Exact rollback commands.
   - When it's safe to drop _prisma_migrations: in a later, normal migration, not now.
Then run the checklist with me step by step. Tick Step 27 when production is verified.
```

**Rehearsal** (2026-10-09, local Docker on arm64, project `yumbry-cutover`, a throwaway
`BETTER_AUTH_SECRET` shared by both images, `COOKIE_SECURE=true` as in production).

- **Data:** a fresh production dump (`yumbry-prod-20261009.dump`) and uploads archive
  (`yumbry-uploads-20261009.tgz`, 16 files, uid 1000). Every local `recipes.image_path` (16) had
  its file.
- **`bun run db:rehearse --dump backups/yumbry-prod-20261009.dump`:** 11 of 11 checks passed. That
  covers no schema drift and row counts unchanged over two runs (30 recipes, 5 users, 12 sessions,
  …).
- **Forward:**
  - v1.3.1 (`yumbry:v1.3.1`, built from the tag) ran first on the restored copy. It issued a
    `__Secure-yumbry.session_token` and installed its PWA in a Chromium profile (Workbox `/sw.js`,
    `workbox-precache-v2-…`).
  - Then v2 (`yumbry:v2-rc`) adopted the database. Row counts were unchanged.
  - The v1 cookie was accepted (`/` 200, `get-session` returns the user), and all 16 photos
    answered `200 image/*`.
  - The installed PWA, relaunched with `PWA.launch`, showed the old shell for about 3 s. During
    that time it logged 404s for `/api/*`. It then ended up on `/service-worker.js`, with only the
    `cache-…` and `uploads` caches, still signed in, with the photo rendered and no errors after
    that.
  - **Test pitfall:** a cookie injected without `expires` is a session cookie, and closing the
    profile drops it. The browser must sign in itself.
- **Rollback:**
  - v1.3.1 started on the migrated database: "No pending migrations to apply".
  - It accepted both the v1-issued and the v2-issued session.
  - It read everything v2 had written: an edited title and its version snapshot, a new `.webp`
    photo, and a share link (API and `/share/…` page).
  - Rolling forward again logged "Database is up to date".

#### Cutover checklist

Production is the Coolify Docker Compose resource `y7el9ogongnyv8r9mh3gp46b` (origin
`https://yumbry.com`, deployed manually from `main`). Staging is `i54awsfi2cpps9d4xlp2thi9`, built
from `dev`. Coolify names the volumes `<resource>_db-data` and `<resource>_uploads-data`, from the
compose keys `db_data` and `uploads_data`, which v2 keeps. Container names end in a per-deploy
suffix, so the commands look them up by prefix. Docker on the server needs `sudo`.

```sh
P=y7el9ogongnyv8r9mh3gp46b          # production; use i54awsfi2cpps9d4xlp2thi9 for staging
DB=$(sudo docker ps -qf name=db-$P)
APP=$(sudo docker ps -qf name=app-$P)
```

1. **Coolify env, before deploying.** Do this on staging first, then production.
   - Set `ORIGIN` to the resource's URL, e.g. `https://yumbry.com`, the value `BETTER_AUTH_URL`
     holds.
   - Keep `BETTER_AUTH_SECRET` and `COOKIE_SECURE=true` unchanged. A new secret logs everyone out.
   - `POSTGRES_PASSWORD` is URL-safe (checked). Compose now builds the app's `DATABASE_URL` from it.
   - Leave `BETTER_AUTH_URL`, `APP_BASE_URL` and `DATABASE_URL` in place: v2 ignores them, and a
     rollback to v1.3.1 needs them. Remove them once the rollback window is closed (step 8).
2. **Volumes and build.**
   - The volumes keep their names. Photos move from `/app/backend/uploads` to `/app/uploads`, which
     the compose file handles.
   - Coolify builds on the server, so the image is natively arm64. CI also builds arm64 on `main`.
   - Keep v1.3.1's image (`y7el9ogongnyv8r9mh3gp46b_app:8c5ff79…`) during the rollback window:
     no `docker image prune` on the server.
3. **Backup, right before deploying** (in your home directory on the server):

   ```sh
   D=$(date +%Y%m%d-%H%M)
   sudo docker exec $DB sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > yumbry-$P-$D.dump
   sudo docker run --rm -v ${P}_uploads-data:/data:ro -v "$PWD":/b alpine \
     tar czf /b/yumbry-$P-uploads-$D.tgz --numeric-owner -C /data .
   sudo chown "$USER": yumbry-$P-uploads-$D.tgz
   sudo docker exec $DB sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "
     select (select count(*) from users), (select count(*) from recipes),
            (select count(*) from ingredients), (select count(*) from recipe_versions),
            (select count(*) from sessions), (select count(*) from families)"' | tee counts-$D.txt
   ```

4. **Deploy.**
   1. Merge `svelte` into `dev` and push. Wait for green CI.
   2. **Staging dress rehearsal:** set `ORIGIN` on the staging resource, back it up (step 3), and
      deploy it. Run the smoke checks (step 5) on the staging URL. This is the first run behind
      Cloudflare and HTTPS, with Coolify's volume handling.
   3. Merge `dev` into `main` and push. Wait for green CI, including the arm64 image.
   4. On `main`: `scripts/release.sh major`, which makes v2.0.0 (commit, tag, push).
   5. Production: back up (step 3), then press Deploy in Coolify. Watch the deploy log for
      "Adopted Prisma-era database: recorded … (baseline) as applied." and the container turning
      healthy.
5. **Smoke checks.**
   - `curl -s https://yumbry.com/api/health` returns `{"status":"ok"}`.
   - `curl -sI https://yumbry.com/sw.js` shows `cache-control: no-cache`, and
     `curl -sI https://yumbry.com/` shows the security headers.
   - Run `sudo docker inspect -f '{{range .Mounts}}{{.Name}} -> {{.Destination}} {{end}}' $APP`. It
     shows `${P}_uploads-data -> /app/uploads`.
   - The same row-count query as step 3 matches `counts-$D.txt`. Sessions may only go up.
   - A browser that was signed in before the deploy is still signed in, with no new login.
   - Recipes with photos show their photos.
   - An existing share link opens in a private window.
   - A URL import of a known recipe site works.
   - One AI chat turn works ("Create with AI").
   - The installed PWA on a phone, reopened, swaps itself to the new app and stays signed in.
6. **Rollback** (any smoke check fails and can't be fixed forward).
   1. In Coolify, open the resource, then Configuration → Git Source. Set the commit SHA to
      `8c5ff79` (v1.3.1) and press Deploy. v1.3.1's entrypoint runs `prisma migrate deploy`, which
      finds nothing pending. The `drizzle` schema it ignores, and the rehearsal showed v1.3.1 reads
      what v2 wrote.
   2. Afterwards, set the commit SHA back to `HEAD` so later deploys follow `main` again.
   3. Restore data only if v2 damaged it. Stop the app first, then:

      ```sh
      sudo docker stop $APP
      sudo docker exec -i $DB sh -c \
        'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
        < yumbry-$P-<D>.dump
      sudo docker run --rm -v ${P}_uploads-data:/data -v "$PWD":/b alpine \
        sh -c 'rm -rf /data/* && tar xzf /b/yumbry-$P-uploads-<D>.tgz --numeric-owner -C /data'
      ```

      Then deploy again, as in 6.1.
7. **After a successful deploy.**
   - Remove `svelte` from CI's push triggers (done in this step's commit). The `svelte` branch can
     go once `main` has it.
   - Keep `scripts/rehearse-migrate.ts` and `backups/` (git-ignored) for future schema changes.
8. **Closing the rollback window** (later, not in this step). Once v2 has run for a few weeks and
   going back to 1.x is no longer wanted:
   - remove `BETTER_AUTH_URL`, `APP_BASE_URL` and `DATABASE_URL` from both Coolify resources;
   - drop `_prisma_migrations` in an ordinary migration
     (`bunx drizzle-kit generate --custom`, containing `DROP TABLE IF EXISTS "_prisma_migrations";`).

   Never drop it by hand, and never in the baseline. A 1.x database upgrading straight past that
   release is still adopted first, because `migrate.ts` checks `_prisma_migrations` before pending
   migrations run. After that it can no longer roll back to 1.x.

---

## Bun runtime notes

Found in step 2 on Bun 1.4.2 (macOS arm64). `src/lib/server/runtime.spec.ts` keeps the regression
guards. It runs hermetically under `bun --bun vitest`, needs `openssl` on the PATH for its test
certificate, and fails at once if it ever runs on Node. Its CDP block runs only when
`BROWSER_CDP_URL` is set. Against `docker run --rm -p 127.0.0.1:9222:9222
cloakhq/cloakbrowser:0.5.11 cloakserve` on macOS, also set
`BROWSER_PROXY_HOST=host.docker.internal`. Against `e2e/scripts/cdp-browser.ts`, the default
`127.0.0.1` is right.

| #   | Part                                         | Verdict                   | Reason                                                                                                                                                                                                                                                                                                                                      | Consequence                                                                                                                                                                                                          |
| --- | -------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | sharp                                        | **Works**                 | sharp 0.35 loads its N-API prebuild under Bun. Main's `rotate → resize(inside, withoutEnlargement) → webp` applies EXIF orientation, drops metadata and rejects non-images. `bun.lock` carries the `@img/sharp-linux(musl)-{x64,arm64}` prebuilds.                                                                                          | Steps 13 and 23 port `image-prep.service.ts` unchanged.                                                                                                                                                              |
| 2   | undici `Agent` with `connect.lookup`         | **Replacement**           | `undici` is a Bun built-in that wins even over an installed npm copy. Its `Agent` is an empty stub, so the request resolves the hostname itself and the lookup is never called. That is a silent SSRF hole. A canary test fails if Bun ever changes this.                                                                                   | Step 21 does not use undici. Use the recipe below.                                                                                                                                                                   |
| 3   | `node:http` forward proxy (CONNECT and HTTP) | **Works, one workaround** | The `'connect'` event fires with `head` bytes, the 407 handling works, and TLS through the tunnel stays end-to-end. Main's plain-HTTP hop pinned with `http.request({ lookup })`, but Bun calls `lookup` with `all: true` and throws "Invalid IP address: undefined" on the `(address, family)` callback main used.                         | Step 21 keeps `node:http` for `ssrf-proxy.ts`, with no `Bun.listen` rewrite. Every hop dials the checked IP directly (`host: address`, client `Host` header kept), with no `lookup` callbacks.                       |
| 4   | playwright-core `connectOverCDP`             | **Works**                 | Tested against `cloakserve` 0.5.11 in Docker and against the local CloakBrowser. A context with `proxy: { server, username, password }` sends plain HTTP and CONNECT through the authenticated proxy. `context.close()` and `browser.close()` only disconnect, and the browser survives.                                                    | Step 21 ports `headless-fetch.ts` unchanged.                                                                                                                                                                         |
| 5   | openai and resend SDKs                       | **Works**                 | `openai` follows a custom `baseURL`, keeps OpenRouter's `usage.cost`, and maps errors to `NotFoundError`/`APIConnectionError` as on Node. `resend` reads `RESEND_BASE_URL` in the `Resend` constructor, not at import, and also accepts an explicit `baseUrl` option.                                                                       | Steps 17 and 22 port as on main. Construct clients at call time (main already does), so tests can set env first. Prefer passing `baseUrl` from our own env reading over relying on the SDK's implicit `process.env`. |
| 6   | vitest under `bun --bun vitest`              | **Works**                 | Both projects run. Server specs execute on Bun. The browser project renders `.svelte` components in Playwright Chromium (checked with a throwaway component). The `transform_index_html_unsupported` warning also appears on Node: it comes from Kit 3 plus vitest browser mode, not Bun.                                                   | `test:unit` is now `bun --bun vitest`. Step 6 installs Playwright Chromium for the browser project, and CI needs `openssl` (present on GitHub runners).                                                              |
| 7   | Playwright test runner and e2e scripts       | **Works; stays on Node**  | `bun --bun x playwright test` ran a multi-worker suite with a `webServer` on Bun 1.4.2. `prepare.ts`, `fakes/server.ts` and `cdp-browser.ts` also run under `bun`. They stay on `node` anyway: Playwright supports only Node, and `e2e/` is the stack-neutral harness that must also run against `main`. Node 24 strips the types natively. | No harness change. Bun installs the `e2e` workspace and Node runs it, as in step 6. Revisit only if Playwright adds official Bun support.                                                                            |

**Pinned fetch on Bun (for step 21).** For each hop: parse the URL, run `assertSafeTarget`, then
call Bun's `fetch` with the checked **IP** in the URL (bracketed for IPv6). Pass
`headers: { host: url.host }` and, for https, `tls: { serverName: url.hostname }`, plus
`redirect: 'manual'`. Bun verifies the certificate against `serverName`. A wrong or missing name
fails with `ERR_TLS_CERT_ALTNAME_INVALID`, and so does an unknown CA. The `.invalid` tests prove
that no DNS lookup happens. `res.headers.getSetCookie()` returns every cookie, and
`res.body.getReader()` can be cancelled mid-body for the size cap. Re-run all of it on each
redirect `Location`. `node:https.request` with `lookup` plus `servername` also pins if `lookup`
honours `options.all`, but `fetch` keeps the WHATWG `Response` the rest of the code expects.
