# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Yumbry is a self-hosted, multi-user recipe manager: manual entry or JSON-LD import from recipe sites, tag/category filtering, serving-size scaling, photo uploads, and optional AI-assisted recipe creation/improvement. It's an npm workspaces monorepo of three packages — `backend/` (Express + Prisma + Postgres), `frontend/` (React + Vite + Tailwind, PWA-enabled), and `shared/` (the AI chat prompt/envelope-parsing logic both of them import as the real npm package `yumbry-shared`) — with a root `package.json` declaring the workspace, but each package still has its own scripts and can be worked on from inside its own directory. Every recipe, tag, category, and AI-settings row belongs to exactly one user (open self-registration, no admin/roles, no cross-user sharing).

## Commands

```sh
# from the repo root — installs all three workspaces into one hoisted node_modules
npm install

# from backend/ or frontend/ (or `npm run <script> --workspace=<name>` from the root)
npm run dev            # backend: tsx watch src/index.ts, :3000 — frontend: vite, :5173, proxies /api and /uploads to :3000
npm run typecheck       # tsc --noEmit
npm run lint            # eslint .
npm run format          # prettier --write .   (format:check for CI-style verification)
npm test                # vitest run
npm run build           # backend: tsc -> dist/. frontend: tsc --noEmit && vite build. shared: tsc -> dist/ (+ .d.ts)

# single test file / by name
npx vitest run tests/ingredient-parser.test.ts
npx vitest run -t "parses fractional quantities"

# backend only — Prisma migrations
npm run db:migrate:dev      # prisma migrate dev: generate + apply a new migration from schema.prisma changes
npm run db:migrate          # prisma migrate deploy: apply pending migrations
npm run db:migrate:status
```

`backend/` and `frontend/` both import `yumbry-shared` from `node_modules` like any other dependency — i.e. its **compiled** `dist/`, not its TypeScript source. Neither `tsx watch` (backend) nor Vite (frontend) rebuilds it automatically, so after editing anything in `shared/src/`, run `npm run build --workspace=shared` (or `cd shared && npm run dev` to `tsc --watch` it continuously) before the change is visible to either package.

Backend integration tests (files matching `*.api.test.ts`, plus `ai-settings.service.test.ts`) hit a real Postgres instance and drop/recreate the `public` schema on every run. They're skipped automatically unless `TEST_DATABASE_URL` (or `DATABASE_URL`) is set — always point this at a disposable database, never the dev/prod one (if running via `docker compose up`, that same Postgres server is already up on port 5432 — create the scratch database inside it once with `docker exec -it <db-container-name> psql -U chef -d postgres -c "CREATE DATABASE recipe_vault_test;"`, a different database name on the same server so it can never collide with real data):

```sh
TEST_DATABASE_URL=postgres://chef:changeme@localhost:5432/recipe_vault_test npm test
```

`backend/vitest.config.ts` sets `fileParallelism: false` (all DB tests share one database and must run sequentially) and stubs env vars that several services require at import time (`AI_SETTINGS_ENCRYPTION_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`) so importing them doesn't throw under test.

Full stack locally:

```sh
cp .env.example .env
docker compose up --build     # app (Express + built frontend) + db (postgres:16-alpine)
```

CI (`.github/workflows/ci.yml`) has four jobs: `shared`, `backend`, `frontend` (each running `npm ci` at the repo root, then `typecheck`/`lint`/`format:check`/`test`/`build` scoped with `--workspace=<name>` — `backend`/`frontend` also `needs: [shared]` and rebuild `shared` themselves first, since both import its compiled output; the `backend` job runs against a real `postgres:16-alpine` service container), and `docker` (`docker build .`, `needs: [backend, frontend]`). Match this locally before considering a change done.

## Architecture

### Backend layering

`backend/src/` follows `routes/` → `controllers/` → `services/` → `db/prisma.ts`, one set of each per resource (`auth`, `recipes`, `tags`, `categories`, `ai`). `app.ts` assembles the Express app but never calls `.listen()`; `index.ts` is the only file that does, and is what's excluded when tests import `app.ts` directly via `supertest`.

Middleware order in `app.ts`: `trust proxy` → `express.json({limit: '2mb'})` → `cookieParser()` → `apiRateLimiter` on all of `/api` → `/uploads` static files (gated by `requireAuth` then `requirePhotoOwner`, since uploaded photo paths aren't namespaced by user) → `GET /api/health` (before auth, so container healthchecks work without a cookie) → the five resource routers (`/api/recipes`, `/api/tags`, `/api/categories`, `/api/ai` are mounted behind `requireAuth`; `/api/auth` gates per-route internally, since register/login/forgot-password must be reachable unauthenticated) → static `frontend/dist` (copied in as `public/`) with a SPA fallback regex that excludes `/api` and `/uploads` → a catch-all error handler returning a generic 500.

Route handlers are wrapped in `asyncHandler()` (`utils/async-handler.ts`) rather than manual `try/catch(err) { next(err) }`. A controller adds its own `try/catch` only to turn a specific error into a specific response — e.g. a `ZodError` into a 400 (auth, recipes), or an AI envelope-parse failure into a 502.

### Data model and ownership

Six tables plus Prisma's own migrations table, defined in `backend/prisma/schema.prisma`: `users`, `recipes` (with `ingredients`, `instructions`, `recipe_tags` as child tables), `tags`, `categories`, `ai_settings`, `password_reset_tokens`. Every user-owned table carries a `NOT NULL user_id` FK (`onDelete: Cascade` from `User`), and `tags`/`categories` are unique per `(user_id, name)`. Prisma model fields are camelCase; `@map`/`@@map` translate to the snake_case columns/tables that raw SQL, controllers, and the JSON API contract all use directly.

Row-level ownership is enforced at the query layer, not just by the FK: every service function takes a `userId` argument and includes it in every `where` clause. `middleware/require-auth.ts` is what supplies that `userId`, reading it off the verified JWT and setting `req.userId`; nothing downstream re-derives it from anything else.

The generated Prisma Client lives at `backend/src/generated/prisma/` (gitignored — regenerate with `npx prisma generate`), configured via `output` in the `generator client` block to emit TypeScript source rather than the default prebuilt output. `db/prisma.ts` constructs the client with an explicit `@prisma/adapter-pg` driver adapter (Prisma 7 no longer accepts a bare `new PrismaClient()`), and stashes the singleton on `globalThis` outside production so `tsx watch`'s hot reload doesn't leak connections. `backend/prisma.config.ts` (not `schema.prisma`) is where the connection string is supplied, from `DATABASE_URL`.

### Auth and password reset

Sessions are a stateless JWT in an httpOnly cookie (`utils/jwt.ts`; cookie name from `AUTH_COOKIE_NAME`) — no server-side session table, but tokens are revocable via a `token_version` counter on `users`: the JWT embeds the version it was signed with, and `requireAuth` rejects it (401) if that no longer matches the user's current value in the DB. Logout and password reset both increment `token_version` (`revokeAuthSessions()` in `auth.service.ts`), which immediately invalidates every JWT previously issued to that user, everywhere — there's no per-device session tracking, so revocation is global per user rather than scoped to one browser/device. `auth.service.ts` hashes passwords with bcrypt and, on login with an unknown email, still runs a bcrypt compare against a dummy hash so response timing doesn't reveal which emails are registered.

Password reset (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`) follows the same anti-enumeration shape: the forgot-password endpoint returns an identical 200 response whether or not the email exists, and `requestPasswordReset()` burns a comparable amount of time either way by hashing a throwaway password in the not-found case. When the email does exist, a random 32-byte token is generated (`utils/reset-token.ts`), only its SHA-256 hash is stored in `password_reset_tokens` (1-hour expiry), and the raw token is emailed via Resend (`services/email.service.ts`) as a link into the frontend's `/reset-password` route — the raw token never touches the database. Redeeming it is one transaction: look up by hash, reject if missing/used/expired, mark used, update the password hash and increment `token_version` together in the same write — so a token can't be replayed even under a race, and any JWT issued before the reset stops working the instant the new password takes effect. On success the response sets a freshly-signed auth cookie (carrying the incremented `token_version`) directly, logging the user in.

Two rate limiters guard these paths (`middleware/rate-limit.ts`): `loginRateLimiter` (10/15min/IP — login, register, account deletion, reset-password) and a stricter `forgotPasswordRateLimiter` (5/15min/IP — forgot-password specifically, since each request triggers a real outbound email). `apiRateLimiter` is a much looser backstop (300/min/IP) across all of `/api`. `COOKIE_SECURE` is a standalone env var rather than derived from `NODE_ENV`, because this app is routinely run over plain HTTP on a LAN, where a `secure` cookie would be silently dropped. `email.service.ts`, `JWT_SECRET`, and `AI_SETTINGS_ENCRYPTION_KEY` all throw at import/startup time if their env vars are missing rather than falling back to an insecure default.

### Recipes: ingredients, scaling, import/export

`recipe.service.ts`'s `createRecipe`/`updateRecipe` replace all of a recipe's `ingredients`/`instructions`/`recipe_tags` rows on every save (delete then batched `createMany()`, no per-row diffing), wrapped in `db/transaction.ts`'s `withTransaction()`. Ingredient parsing (`services/ingredient-parser.ts`) is the single point that turns a raw ingredient line into `{amount, unit, name, is_scalable}`; it never throws, falling back to an unscalable raw-text-only ingredient. It's a self-contained hand-rolled parser built around a leading-quantity regex (mixed numbers, plain fractions, decimals — including Unicode vulgar fractions like `½`, normalized to ASCII first) followed by a lookup against a fixed `UNIT_WORDS` set of recognized unit spellings; a line with no leading quantity, or one whose amount doesn't resolve, falls back unscalable, and everything else is always `is_scalable: true`. The frontend always sends raw ingredient lines, never pre-parsed amounts, since this is recomputed server-side on every save.

Serving-size scaling is entirely a frontend concern: `hooks/useScaledIngredients.ts` multiplies each ingredient's amount by `desiredServings / baseServings`; ingredients marked `is_scalable: false` always render their stored raw text unscaled. Because `servings`/`amount` are Postgres `Decimal` columns, they cross the API as strings (`RecipeRow`/`Ingredient` types), not numbers — `frontend/src/utils/numeric.ts`'s `toNumber()` is the one place that converts for arithmetic.

JSON-LD import/export (`jsonld-import.service.ts` / `jsonld-export.service.ts`) round-trips schema.org `Recipe` data, including `@graph`-wrapped documents and `HowToSection`-nested instructions; both `recipeCategory` and `keywords` feed the same `tags` table on import.

### AI-assisted recipe creation

AI settings are per-user and DB-configured (`ai_settings` table: `provider`/`base_url`/`model`/`api_key_encrypted`, all nullable — AI features stay off until a user configures them). `services/ai-provider.service.ts` talks to any OpenAI-compatible endpoint (OpenAI, Anthropic, Gemini, Ollama, or a custom `base_url`) through one `openai` client, always non-streaming with `response_format: {type: 'json_object'}`. Provider failures are normalized into a typed `AiProviderError` and mapped to HTTP 502. API keys are encrypted at rest with AES-256-GCM (`utils/crypto.ts`, key from `AI_SETTINGS_ENCRYPTION_KEY`) and only decrypted server-side at the moment of calling the provider — the settings-read endpoint returns `has_api_key: boolean`, never the key or its ciphertext.

Create and Improve are the same backend endpoint, `POST /api/ai/chat`, distinguished only by what `current_draft` the frontend starts from. The chat contract is stateless — `{messages, current_draft}` in, `{reply, recipe}` out every turn, no conversation or draft persisted server-side. `pages/AiChatPage.tsx` is mounted at both `/create-with-ai` and `/recipes/:id/ai-improve`; whether a route `:id` param is present is the only branch between the two modes. Saving a draft navigates to the existing manual recipe form with the draft in router state, rather than saving directly from the chat page.

The system prompt and JSON-envelope parsing (`buildChatMessages`/`parseChatEnvelope`) live in `shared/src/ai-recipe-draft.ts` (package `yumbry-shared`), not in `backend/` — both `ai.controller.ts`'s `/api/ai/chat` proxy and the frontend's direct-Ollama client import the same compiled logic, so there's exactly one copy of the prompt to edit. The `ollama` provider is the one exception to the backend-proxy model: `frontend/src/services/ollama-direct.ts` always calls a local Ollama instance straight from the browser (plain `fetch`, no API key, same error wording as the backend's `AiProviderError`), unconditionally — never through `/api/ai/chat` — since reaching a user's own local Ollama is only ever possible from their browser, not from wherever the backend happens to be hosted. Every other provider (openai/anthropic/gemini/custom) still goes through the backend proxy, encrypted key and all; `SettingsPage.tsx` hides the API key field entirely when `provider === 'ollama'` and instead shows two reminders (`settings.ai.ollamaNote`, `settings.ai.ollamaCorsNote`): that no API key is sent, and that because the request comes straight from the browser, Ollama must be reachable from whatever device is loading the app (not the server) and its `OLLAMA_ORIGINS` must allow this app's origin if it isn't served from `localhost`.

### Frontend conventions

State that depends on an async query result (e.g. seeding form state once a recipe loads) is synchronized during render — `if (data && trackedId !== data.id) { setTrackedId(...); setState(...) }` in the component body — rather than via a `useEffect`. Shared list-editing UI (`components/ReorderableListEditor.tsx`) backs both the ingredient and instruction editors as thin wrappers; `Chip.tsx`/`FilterChips.tsx` back both the recipe-list filters and the category picker. React Query keys/fetches for tags, categories, and AI settings are centralized in `api/queryKeys.ts` plus one hook per resource — don't hand-write a raw query key array at a new call site.

Tag/category names are stored lowercase (normalized only in `tag-category.service.ts`'s upsert functions, not enforced by the DB) and capitalized for display purely via Tailwind's `capitalize` utility at each render site.

### Build and deploy

The root `Dockerfile` builds each workspace in its own stage (`shared-build`, `frontend-build`, `backend-build`, including `prisma generate` and compiling with `tsc`), then assembles a slim runtime image running as the non-root `node` user. Because `npm ci` needs the root `package-lock.json`, the runtime image's internal layout mirrors the monorepo shape — `/app/backend/{dist,node_modules,public,uploads,...}` — rather than the old flat single-package `/app/{dist,node_modules,...}`; `UPLOADS_DIR` is `/app/backend/uploads` accordingly, and `WORKDIR`/`ENTRYPOINT` run from `/app/backend`. `docker-entrypoint.sh` runs `prisma migrate deploy` before starting the server on every container start, so migrations apply automatically in Docker but must be run manually (`npm run db:migrate`) in local dev after pulling new ones. `docker-compose.yml` defines only `app` and `db`, with photo uploads and the Postgres data directory in separate named volumes, mounted at `/app/backend/uploads` — a different location from `backend/uploads/` used by local `npm run dev`.

The frontend is a PWA (`vite-plugin-pwa`): `/api/*` is excluded from the service worker's cache (`NetworkOnly`), `/uploads/*` uses `StaleWhileRevalidate`. The service worker is registered manually in `main.tsx`, not via the plugin's auto-injection.

## Gotchas worth knowing before touching related code

- Prisma 7 forbids a `url` in `schema.prisma`'s `datasource` block (only `prisma.config.ts` may set it) and requires an explicit driver adapter — `new PrismaClient()` with no arguments throws on first query.
- `backend/tsconfig.json` (type-checking, includes `tests/`) and `backend/tsconfig.build.json` (emit, `rootDir: "src"`) are intentionally separate and can't be merged, since `tests/` sits outside `src/`.
- Any test file that imports `auth.service.ts` transitively imports `email.service.ts`, which throws at import time without `RESEND_API_KEY`/`EMAIL_FROM`/`APP_BASE_URL` — already handled globally in `vitest.config.ts`, but worth knowing if a new test file mocks environment differently.
- `uuid`'s own types only ship from v10+; don't add `@types/uuid` (it's an empty stub) on top of `uuid@^11`.
- A stale Tailwind `content` glob in `tailwind.config.js` silently drops utility classes only from the production build, not from `npm run dev` — if styling looks fine locally but breaks after `npm run build`, check that first.
- `npm ci --workspace=backend` (used in the Dockerfile's production install) installs most of backend's own dependencies straight into `backend/node_modules` rather than hoisting them to the repo root, but still hoists a handful of shared transitive deps (plus the `yumbry-shared` workspace symlink itself) to the root `node_modules` — which package ends up where isn't worth hand-reasoning about; the Dockerfile copies both locations into the runtime image, nested exactly as npm left them, and lets Node's normal node_modules walk-up resolution sort it out.
- `jsdom` is a devDependency of `frontend/` only, but `vitest` (hoisted to the repo root since all three workspaces depend on it) resolves it relative to its own install location — if `jsdom` isn't _also_ hoisted to the root, `npm run test --workspace=frontend` fails with `Cannot find package 'jsdom'`. It's listed as a root-level `devDependency` in the top-level `package.json` specifically to force that hoist; don't remove it even though `frontend/package.json` also lists it.
