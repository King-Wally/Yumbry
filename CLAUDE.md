# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Yumbry is a self-hosted, multi-user recipe manager: manual/JSON-LD recipe import, tag/category
filtering, serving-size scaling, photo attachments, and an optional per-user AI assistant for
drafting/improving recipes. Every user's data (recipes, tags, categories, AI settings) is siloed —
no sharing between accounts.

npm workspaces monorepo: `backend` (Express + Prisma + Postgres), `frontend` (React + Vite),
`shared` (types + logic consumed by both).

## Commands

Run from `backend/`, `frontend/`, or `shared/` (each has the same script names):

```sh
npm run dev            # backend: tsx watch; frontend: vite; shared: tsc --watch
npm run build           # backend: tsc→dist; frontend: tsc --noEmit && vite build; shared: tsc→dist
npm run typecheck       # tsc --noEmit
npm run lint            # eslint .
npm run format          # prettier --write .
npm run format:check
npm test                # vitest run
```

`shared` must be built (`npm run build --workspace=shared`, or `npm run dev --workspace=shared`
for a watcher) before backend/frontend will pick up changes to it — it's consumed as a compiled
package (`dist/`), not source-aliased. CI (`.github/workflows/ci.yml`) always builds `shared`
first for exactly this reason.

Database (from `backend/`):

```sh
npm run db:migrate          # prisma migrate deploy — apply pending migrations
npm run db:migrate:dev      # generate + apply a new migration from schema.prisma changes
npm run db:migrate:status
```

Local dev needs `backend/.env` with its own `DATABASE_URL` (pointing at `localhost`, not the
`db` Docker hostname) and `JWT_SECRET` — see README "Development (without Docker)" for the full
setup including starting just the `db` service via `docker compose up -d db`.

Backend tests (from `backend/`): unit tests (`*.service.test.ts`) always run; integration tests
(`*.api.test.ts`, e.g. `recipes.api.test.ts`) spin up the real Express app against a real,
disposable Postgres and are skipped unless `TEST_DATABASE_URL` is set:

```sh
TEST_DATABASE_URL=postgres://chef:changeme@localhost:5432/recipe_vault_test npm test
```

Never point `TEST_DATABASE_URL` at a real database — integration tests drop and recreate the
`public` schema on every run. `vitest.config.ts` sets `fileParallelism: false` because multiple
`*.api.test.ts` files share/reset that same DB and would race otherwise; it also injects fixed
dummy `JWT_SECRET`/`AI_SETTINGS_ENCRYPTION_KEY`/email env vars since several backend modules
throw at import time if those are unset.

To run a single test file: `npx vitest run tests/recipes.api.test.ts` (from `backend/` or
`frontend/`).

## Architecture

### Backend layering

Routes → controllers → services → Prisma, applied loosely rather than strictly enforced —
`requireAuth` middleware queries Prisma directly, and controllers do their own Zod
parsing/error-shaping inline rather than through a shared validation middleware. Every
controller is wrapped in `asyncHandler` at the route so promise rejections reach `next(err)`.

`app.ts` builds the Express app; `index.ts` just imports it and listens. Middleware order:
`express.json` → `cookieParser` → global `/api` rate limiter → static `/uploads` (behind
`requireAuth` + `requirePhotoOwner`) → health check → feature routers, each wrapped with
`requireAuth` at mount time (only `/api/auth` is unauthenticated) → SPA static fallback →
one generic 4-arg error handler at the very end (logs + generic 500, no per-kind mapping).

Validation: Zod schemas live under `backend/src/schemas/`, called directly as
`SomeSchema.parse(req.body)` inside each controller's try/catch, with `ZodError` manually mapped
to `400 { error: issues }`. This pattern repeats near-verbatim across controllers — there is no
shared "validate" middleware, so match the existing pattern rather than introducing a new one.

Error handling beyond Zod: domain error classes (`AiProviderError`, a URL-import error type) are
mapped to HTTP responses via the shared generic helper `sendKindedError`
(`utils/kinded-error-response.ts`), which type-guards the error class and looks up status by
`.kind`. Anything unrecognized falls through to the catch-all handler in `app.ts`.

### Auth

JWT in an httpOnly cookie (`AUTH_COOKIE_NAME = 'token'`), not a bearer header.
`signAuthToken(userId, tokenVersion)` issues 30-day tokens. `JWT_SECRET` is read once at module
load (`utils/jwt.ts`) and throws immediately if unset — a fail-fast import-time check (this is
why tests must inject a dummy value via `vitest.config.ts`). Session invalidation ("log out
everywhere") works via a `tokenVersion` counter on `User`: `requireAuth` re-verifies against the
DB's current `tokenVersion` on every request, so bumping it invalidates all previously-issued
tokens without a blocklist.

`AI_SETTINGS_ENCRYPTION_KEY` is a separate secret (AES-256-GCM, `utils/crypto.ts`) used only to
encrypt/decrypt users' AI provider API keys at rest, also fail-fast at import time.
`getAiSettingsForCall` is the only place that decrypts it — never used for the public settings
GET response.

### AI provider abstraction

`services/ai-provider.service.ts` talks to `openai`, `anthropic`, `gemini`, `ollama`, and `custom`
providers all through the single `openai` npm SDK client, pointed at provider-specific default
base URLs, because all of these expose an OpenAI-compatible chat-completions endpoint (`custom`
requires the user to supply their own base URL). SDK errors are normalized into a shared
`AiProviderError` (kind: `unreachable` | `bad_status` | `malformed_response`) defined in
`shared/src/ai-provider-error.ts`.

**Ollama is the one exception to the backend-mediated flow**: the frontend calls Ollama directly
from the browser (`frontend/src/services/ollama-direct.ts`), since a self-hosted backend
generally can't reach a user's local Ollama instance. Every other provider goes through
`POST /api/ai/chat`. Both paths share the same prompt-building/response-parsing logic
(`buildChatMessages`/`parseChatEnvelope` in `shared/src/ai-recipe-draft.ts`) so behavior stays
identical regardless of which path handles a given provider — when touching AI chat behavior,
check both consumers.

### Prisma

Singleton client in `backend/src/db/prisma.ts` using `@prisma/adapter-pg` explicitly (not
Prisma's built-in driver). Stashed on `globalThis` outside production to survive `tsx watch`
hot-reloads without leaking connection pools. Generated client output is customized to
`backend/src/generated/prisma` (not the default `node_modules/.prisma`) — regenerate with
`npx prisma generate` after pulling schema changes.

Core models (`backend/prisma/schema.prisma`): `User` (has `tokenVersion`, `locale`), `Recipe`
(belongs to `User`/`Category`; has `Ingredient[]`/`Instruction[]`/`RecipeTag[]`), `Tag`/`Category`
(both scoped per-user, unique on `(userId, name)`), `RecipeTag` (join table),
`PasswordResetToken`, `AiSettings` (1:1 with `User`).

Migration conventions: edit `schema.prisma`, run `npm run db:migrate:dev` against local Postgres,
commit the generated migration folder. Never hand-edit an already-committed migration — write a
new schema change to fix it forward (Prisma migrations have no down-migration concept). In
Docker, `docker-entrypoint.sh` runs `prisma migrate deploy` synchronously before starting the
server, on every container start.

### Frontend

Routing is `react-router-dom` (classic `<Routes>/<Route>`, not file-based) — all routes defined
inline in `App.tsx`; protected routes wrapped individually in `<ProtectedRoute>`.

Server state uses `@tanstack/react-query` (thin wrapper hooks in `frontend/src/hooks/`, query
keys centralized in `frontend/src/api/queryKeys.ts`). React Context is used only for auth
(`context/auth-context.ts`, consumed via `hooks/useAuth.ts`) — no Redux/Zustand.

API calls go through one file, `frontend/src/api/client.ts`: one function per backend endpoint,
all routed through a shared internal `request<T>()` helper (adds `credentials: 'include'` for
the auth cookie, normalizes error bodies into a typed `ApiError` with a `.kind`, and forces any
401 to `kind: 'unauthenticated'` client-side regardless of server body). `frontend/src/services/`
is not a general services layer — it holds only `ollama-direct.ts`, the special-cased
direct-to-Ollama path described above, which bypasses `api/client.ts` and the backend entirely.

i18n is `i18next`/`react-i18next`, locale files under `frontend/src/i18n/locales/{en,nl,fr,es}.json`
matching `SUPPORTED_LOCALES` from `shared`. Locale resolves from localStorage
(`yumbry.locale` key) → browser language → `'en'`, read defensively so a broken `localStorage`
never crashes init; `setActiveLocale()` is the single place that persists and calls
`i18n.changeLanguage`, invoked once the authenticated user's `locale` column is fetched — locale
is otherwise anonymous/local-only until login. There is no locale segment in the URL routes.

Components and pages are flat directories (`frontend/src/components/`, `frontend/src/pages/`),
one file each, no subfolders.

### shared/ package

Real npm workspace package (`yumbry-shared`), built to `dist/` and imported as a compiled
package by both `backend` and `frontend` (`main`/`types` point at `dist/`) — there is no source
aliasing, so changes need a rebuild (or the `npm run dev` watcher) to be visible downstream.
Exports three modules from `shared/src/index.ts`:

- `recipe-dto.ts` — plain DTO interfaces (`Recipe`, `Tag`, `Category`, `Ingredient`,
  `Instruction`, `RecipeInput`, `AiChatTurnRequest/Response`) shared verbatim between backend
  responses and frontend consumption.
- `ai-recipe-draft.ts` — real logic, not just types: `buildChatMessages`/`parseChatEnvelope`
  plus `SUPPORTED_LOCALES`, the single source of truth for prompt building and response parsing
  used by both the backend SDK path and the frontend direct-to-Ollama path.
- `ai-provider-error.ts` — the `AiProvider`/`AiProviderErrorKind` types, the `AiProviderError`
  class, and canned error-message builders, for the same "one vocabulary, two consumers" reason.

In the Docker image, `backend/node_modules/yumbry-shared` (a symlink from the workspace install)
is deliberately replaced with a real copied directory (`package.json` + `dist/`) since `shared/`
source isn't present in the runtime stage — see the Dockerfile's `shared-build` stage.

## Notes for changes

- Prefer matching the existing per-controller Zod validation pattern over introducing a new
  validation abstraction, unless asked to refactor it.
- Any change to AI chat prompt/response behavior likely needs updating both consumers:
  `backend/src/services/ai-provider.service.ts` (SDK-mediated providers) and
  `frontend/src/services/ollama-direct.ts` (Ollama), since they share `shared/src/ai-recipe-draft.ts`.
- `Recipe`, `Tag`, and `Category` are all scoped per-user — new queries/mutations must filter by
  the authenticated `userId`, matching the existing ownership-check middleware
  (`requireRecipeOwner`, `requirePhotoOwner`).
