# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Yumbry is a self-hosted, multi-user recipe manager: manual/JSON-LD recipe import, tag/category
filtering, serving-size scaling, photo attachments, and an AI assistant for drafting/improving
recipes, backed by a single server-wide Google Gemini API key (`GEMINI_API_KEY`) — there is no
per-user AI configuration. Every user's data (recipes, tags, categories) is siloed — no sharing
between accounts.

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
`db` Docker hostname) and `BETTER_AUTH_SECRET` — see README "Development (without Docker)" for the full
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
dummy `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`/email env vars. Auth requests from supertest must set
an `Origin` header matching `BETTER_AUTH_URL` — better-auth rejects state-changing calls without
one, and browsers send it automatically where supertest does not (see `tests/helpers/auth.ts`). `GEMINI_API_KEY` is read lazily (not at import time), so AI chat tests mock
`chatWithAi` directly instead of needing a dummy key.

To run a single test file: `npx vitest run tests/recipes.api.test.ts` (from `backend/` or
`frontend/`).

## Architecture

### Backend layering

Routes → controllers → services → Prisma, applied loosely rather than strictly enforced —
`requireAuth` middleware queries Prisma directly, and controllers do their own Zod
parsing/error-shaping inline rather than through a shared validation middleware. Every
controller is wrapped in `asyncHandler` at the route so promise rejections reach `next(err)`.

`app.ts` builds the Express app; `index.ts` imports it, listens, and sweeps orphaned families
once at startup. Middleware order: global `/api` rate limiter → better-auth's `toNodeHandler`
catch-all → `express.json` → static `/uploads` (behind `requireAuth` + `requirePhotoAccess`) →
health check → `/api/config` → feature routers, each wrapped with `requireAuth` at mount time →
SPA static fallback → one generic 4-arg error handler at the very end (logs + generic 500, no
per-kind mapping). There is no `cookieParser` — better-auth reads cookies off the raw headers.

Validation: Zod schemas live under `backend/src/schemas/`, called directly as
`SomeSchema.parse(req.body)` inside each controller's try/catch, with `ZodError` manually mapped
to `400 { error: issues }`. This pattern repeats near-verbatim across controllers — there is no
shared "validate" middleware, so match the existing pattern rather than introducing a new one.

Error handling beyond Zod: domain error classes (`AiProviderError`, a URL-import error type) are
mapped to HTTP responses via the shared generic helper `sendKindedError`
(`utils/kinded-error-response.ts`), which type-guards the error class and looks up status by
`.kind`. Anything unrecognized falls through to the catch-all handler in `app.ts`.

### Auth

[better-auth](https://better-auth.com) owns identity and sessions. Config lives in
`backend/src/auth.ts` and is mounted as a catch-all at `/api/auth/*`; every endpoint under that
prefix (`sign-up/email`, `sign-in/email`, `sign-out`, `request-password-reset`, `reset-password`,
`change-password`, `delete-user`, `get-session`) is better-auth's, not ours. `BETTER_AUTH_SECRET`
is required in production only — dev and test fall back to a fixed placeholder, since a secret
that changed per boot would log everyone out on every restart.

Three things about the mount are load-bearing:

- **`toNodeHandler(auth)` must be registered before `express.json()`.** It consumes the raw
  request stream itself, and a body a parser already drained makes every auth POST hang. The
  `/api` rate limiter can sit above it (it never touches the body).
- **Express 4 wildcard syntax** (`'/api/auth/*'`). On Express 5 this becomes `'/api/auth/*splat'`.
- **The app's own config endpoint is `/api/config`, not `/api/auth/config`** — the latter would be
  swallowed by the catch-all.

`requireAuth` (`middleware/require-auth.ts`) calls `auth.api.getSession`, which reads the session
and user rows from the database on every request. `session.cookieCache` is deliberately **off**:
it would serve a stale `familyId`, letting someone who just left a family keep reading its
recipes. Session revocation is real row deletion now — `revokeSessionsOnPasswordReset` and
`revokeOtherSessions` replace the old `tokenVersion` counter.

The app bolts five columns onto better-auth's user table as `additionalFields`: `familyId` plus
the four preferences. All are `input: false`, so neither signup nor better-auth's `updateUser` can
write them — preferences go through `PATCH /api/me`, which validates against the shared enums.
`familyId` must be declared `required: false` despite its NOT NULL column: better-auth validates
required fields against the request payload _before_ `databaseHooks` runs, so a field the client
is forbidden to send could never satisfy it. The `user.create.before` hook creates the personal
family and supplies the id.

### AI provider

`services/ai-provider.service.ts` talks to Google Gemini
(`https://generativelanguage.googleapis.com/v1beta/openai/`) through the `openai` npm SDK client,
since Gemini exposes an OpenAI-compatible chat-completions endpoint.
`GEMINI_API_KEY`, `GEMINI_MODEL_BIG` (default `gemini-3.6-flash`) and `GEMINI_MODEL_SMALL`
(default `gemini-3.5-flash-lite`) are read from
`process.env` lazily, at call time inside `chatWithAi` — not at module import time — so the app
still boots without them; a missing key throws an `AiProviderError` with kind `not_configured`
(mapped to HTTP 503), meaning the AI assistant is simply unavailable rather than the whole app
failing to start. SDK errors are normalized into the same `AiProviderError` (kind: `unreachable` |
`bad_status` | `malformed_response` | `not_configured`) defined in `shared/src/ai-provider-error.ts`.

Two model tiers: `chatWithAi` takes a `tier` (`'big' | 'small'`, default `small`) and
`ai.controller.ts` asks for `big` only when the request's `mode` is `'create'` and it's the first
turn (`messages.length === 1`) — the one turn written from nothing. Every follow-up and every
`'improve'` turn edits an existing `current_draft` and uses `small`. `mode` comes from the client
(`AiChatMode` in `shared/src/recipe-dto.ts`, Zod-defaulted to `'improve'` so an old client falls to
the cheap tier) and never reaches the prompt. If the big model returns a quota error (429, or a
403/400 mentioning `RESOURCE_EXHAUSTED`/quota), `chatWithAi` retries the same request once on the
small model.
There is no per-user provider/API key configuration — one server-wide key serves every user via
`POST /api/ai/chat`.

### Prisma

Singleton client in `backend/src/db/prisma.ts` using `@prisma/adapter-pg` explicitly (not
Prisma's built-in driver). Stashed on `globalThis` outside production to survive `tsx watch`
hot-reloads without leaking connection pools. Generated client output is customized to
`backend/src/generated/prisma` (not the default `node_modules/.prisma`) — regenerate with
`npx prisma generate` after pulling schema changes.

Core models (`backend/prisma/schema.prisma`): better-auth's `User`/`Session`/`Account`/
`Verification` (regenerate the reference with `npx @better-auth/cli generate` into a scratch file
and hand-merge — the CLI rewrites `schema.prisma` in place and flattens the `@map` naming), `Recipe`
(belongs to `User`/`Category`; has `Ingredient[]`/`Instruction[]`/`RecipeTag[]`), `Tag`/`Category`
(both scoped per-user, unique on `(userId, name)`), `RecipeTag` (join table),
`Family`.

Migration conventions: edit `schema.prisma`, run `npm run db:migrate:dev` against local Postgres,
commit the generated migration folder. Never hand-edit an already-committed migration — write a
new schema change to fix it forward (Prisma migrations have no down-migration concept). In
Docker, `docker-entrypoint.sh` runs `prisma migrate deploy` synchronously before starting the
server, on every container start.

### Frontend

Routing is `react-router-dom` (classic `<Routes>/<Route>`, not file-based) — all routes defined
inline in `App.tsx`; protected routes wrapped individually in `<ProtectedRoute>`.

Server state uses `@tanstack/react-query` (thin wrapper hooks in `frontend/src/hooks/`, query
keys centralized in `frontend/src/api/queryKeys.ts`) — no Redux/Zustand. The session is _not_ in
react-query: `frontend/src/lib/auth-client.ts` holds the better-auth client, and
`hooks/useCurrentUser.ts` wraps its `useSession()` store. Note that `authClient` calls return
`{ data, error }` rather than throwing, so auth pages handle errors differently from every other
call in the app — they don't flow through `ApiError` or the global 401 handler. Preferences are
written through `api/client.ts`'s `updateProfile`, which must be followed by `refreshSession()`
for the session store to see the change.

API calls go through one file, `frontend/src/api/client.ts`: one function per backend endpoint,
all routed through a shared internal `request<T>()` helper (adds `credentials: 'include'` for
the auth cookie, normalizes error bodies into a typed `ApiError` with a `.kind`, and forces any
401 to `kind: 'unauthenticated'` client-side regardless of server body). There is no
`frontend/src/services/` layer — every AI chat call goes through `api/client.ts` to the backend.

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
  plus `SUPPORTED_LOCALES`, the single source of truth for prompt building and response parsing.
- `ai-provider-error.ts` — the `AiProviderErrorKind` type, the `AiProviderError` class, and
  canned error-message builders.

In the Docker image, `backend/node_modules/yumbry-shared` (a symlink from the workspace install)
is deliberately replaced with a real copied directory (`package.json` + `dist/`) since `shared/`
source isn't present in the runtime stage — see the Dockerfile's `shared-build` stage.

## Notes for changes

- Prefer matching the existing per-controller Zod validation pattern over introducing a new
  validation abstraction, unless asked to refactor it.
- AI chat prompt/response behavior lives in `shared/src/ai-recipe-draft.ts`
  (`buildChatMessages`/`parseChatEnvelope`), consumed only by
  `backend/src/services/ai-provider.service.ts` — there's a single consumer now, not two.
- `Recipe`, `Tag`, and `Category` are all scoped per-family — new queries/mutations must filter by
  the authenticated `familyId`, matching the existing access-check middleware
  (`requireRecipeAccess`, `requirePhotoAccess`). `familyId` is an `Int`; user ids are `String`
  (better-auth generates them).
