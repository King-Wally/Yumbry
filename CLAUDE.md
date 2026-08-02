# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Recipe Vault: a self-hosted, multi-user recipe manager. Every recipe/tag/category/AI-settings row belongs to exactly one user; users authenticate with email+password (open self-registration, no invite system — trusted network, not the open internet). Two independent npm packages, `backend/` and `frontend/`, both TypeScript, built together into one Docker image and deployed with `docker compose up` (`app` + `db` services).

## Commands

Run from `backend/` or `frontend/` respectively (not the repo root — there is no root `package.json`).

```sh
npm install          # each package manages its own node_modules
npm run dev          # backend: tsx watch src/index.ts (port 3000, runs TS directly, no build step)
                      # frontend: vite dev server (port 5173, proxies /api and /uploads to :3000)
npm run typecheck    # tsc --noEmit, both packages
npm run lint         # eslint . (flat config, typescript-eslint), both packages
npm run format       # prettier --write .   /   format:check for CI-style verification
npm test             # vitest run, in both packages
npx vitest run tests/ingredient-parser.test.ts   # run a single backend test file
npx vitest run -t "parses fractional quantities" # run tests matching a name
npm run build        # backend: tsc -> dist/. frontend: tsc --noEmit && vite build (type errors fail the build)
npm run db:migrate:dev     # backend: prisma migrate dev — generate+apply a new migration against a local Postgres
npm run db:migrate         # backend: prisma migrate deploy — apply pending migrations
npm run db:migrate:status  # backend: prisma migrate status
```

Backend integration tests (`recipes.api.test.ts`, `auth.api.test.ts`, `ai.api.test.ts`, `ai-settings.service.test.ts`) hit a real Postgres and drop/recreate the `public` schema on every run via `tests/helpers/db.ts`'s `resetTestDatabase()` — point them at a scratch database via `TEST_DATABASE_URL`, never a real one:

```sh
TEST_DATABASE_URL=postgres://chef:changeme@localhost:5432/recipe_vault_test npm test
```

Without `TEST_DATABASE_URL` (or `DATABASE_URL`) set, that suite is skipped automatically (`describe.skipIf`) and the rest of the tests still run. `backend/vitest.config.ts` sets `fileParallelism: false` — all DB-touching test files share one database and must run sequentially, not concurrently.

To test a new migration's data-transforming logic (e.g. a one-off `UPDATE`/merge migration) against pre-existing data rather than an empty schema, use a disposable Postgres container:

```sh
docker run --rm -d --name mig-test -p 5433:5432 -e POSTGRES_USER=chef -e POSTGRES_PASSWORD=changeme -e POSTGRES_DB=recipe_vault_test postgres:16-alpine
# seed via: docker exec mig-test psql -U chef -d recipe_vault_test -c "..."
# migrate via (from backend/): DATABASE_URL=postgres://chef:changeme@localhost:5433/recipe_vault_test npx prisma migrate deploy
docker stop mig-test   # --rm cleans up automatically
```

Full stack via Docker:

```sh
cp .env.example .env
docker compose up --build
```

## Architecture

**Build/deploy.** Root `Dockerfile`, three stages: `frontend-build` (`npm ci && npm run build` → `frontend/dist`), `backend-build` (`npm ci`, `npx prisma generate`, `tsc -p tsconfig.build.json` → `backend/dist`), `runtime` (`npm ci --omit=dev`, copies `backend/prisma/` + `prisma.config.ts` in for the entrypoint's migration step, copies both `dist/` outputs in — backend `dist/` as the server, frontend `dist/` as `public/`). Runs as the non-root `node` user; `RUN mkdir -p /app/uploads && chown -R node:node /app` happens before `USER node`. `HEALTHCHECK` hits `GET /api/health` (mounted before `requireAuth` in `app.ts`, since a container healthcheck has no auth cookie). `docker-entrypoint.sh` runs `prisma migrate deploy` then `exec node dist/index.js` on every container start. `docker-compose.yml` defines only `app` and `db` (`postgres:16-alpine`); named volumes `db_data` and `uploads_data` (`uploads_data:/app/uploads` — a Docker-managed volume, not a bind mount, so `backend/uploads/` used by local `npm run dev` and the container's `/app/uploads` are two different places).

**PWA.** `vite-plugin-pwa` (`frontend/vite.config.ts`) generates the manifest, `sw.js`, and Workbox runtime at build time into `frontend/dist` root, served as plain static files. `/api/*` is `NetworkOnly`; `/uploads/*` is `StaleWhileRevalidate` (30-day/300-entry cap). `registerType: 'autoUpdate'`. `devOptions.enabled: true` so the manifest/SW pipeline also runs under `npm run dev`. Service worker registered manually in `frontend/src/main.tsx` via `virtual:pwa-register` (`injectRegister: false`). Full install/offline behavior requires a secure context (HTTPS).

**Backend layering** (`backend/src/`): `routes/` → `controllers/` → `services/` → `db/prisma.ts`, consistent across `recipes`, `tags`, `categories`, `ai`, `auth`. `app.ts` builds the Express app (no `listen()`); `index.ts` is the only file that calls `app.listen()`. Tests import `app.ts` directly via `supertest`. Keep new server-level wiring in `app.ts`, not `index.ts`.

`app.ts` middleware order: `trust proxy` → `express.json({limit:'2mb'})` → `cookieParser()` → `apiRateLimiter` on `/api` → `/uploads` static route (`requireAuth` → `requirePhotoOwner` → `express.static(UPLOADS_DIR)`) → `GET /api/health` → `/api/auth` (routes gate internally per-route) / `/api/recipes` / `/api/tags` / `/api/categories` / `/api/ai` (all behind `requireAuth`) → static `public/` + SPA fallback (regex excludes `/api` and `/uploads`) → generic error handler (500, `{error: 'Internal server error'}`).

Route handlers are wrapped in `utils/async-handler.ts`'s `asyncHandler()`, not manual `try/catch { next(err) }`. A controller only needs its own `try/catch` when intercepting a specific error type for a custom response (e.g. `postRecipe`/`putRecipe` catching `ZodError` → 400, `postAiChat` catching an envelope-parse failure → 502).

**Services** (`backend/src/services/`):
- `recipe.service.ts` — `createRecipe`, `updateRecipe`, `deleteRecipe`, `getRecipeById`, `listRecipes`, `setRecipePhoto`. `createRecipe`/`updateRecipe` delete-and-reinsert all `ingredients`/`instructions`/`recipe_tags` rows per save (no diffing), each via one batched `createMany()` (not a per-row loop), inside `db/transaction.ts`'s `withTransaction<T>()`.
- `recipe.types.ts` — row/input types (`RecipeRow`, `IngredientRow`, `InstructionRow`, `RecipeWithRelations`, `IngredientInput`, `InstructionInput`, `RecipeInput`, `TagRef`, `CategoryRef`) — hand-written snake_case shapes matching the API's JSON contract, distinct from Prisma's generated camelCase model types. `toRecipeRow`/`toIngredientRow`/`toInstructionRow` in `recipe.service.ts` (and equivalents in `auth.service.ts`/`ai-settings.service.ts`) are the conversion point between Prisma's model shape and these types. `RecipeInput` derives from `RecipeBody` (`z.infer` of `RecipeBodySchema`) via `Omit<RecipeBody, 'ingredients'|'instructions'> & {ingredients?: IngredientInput[]; instructions?: InstructionInput[]}` — add new scalar fields to `RecipeBodySchema`, not to `RecipeInput` directly.
- `tag-category.service.ts` — `upsertTags`, `upsertCategory`, `deleteOrphaned` (parameterized `'tags'|'categories'`), `listTags`, `listCategories`. `upsertTags`/`upsertCategory` lowercase+trim names before writing — this is the only place normalization happens, there is no DB-level backstop.
- `ingredient-parser.ts` — `parseIngredientLine()` wraps the `parse-ingredient` npm package; single source of truth for turning a raw ingredient line into `{amount, unit, name, is_scalable}`. Called from `jsonld-import.service.ts` and `controllers/recipes.controller.ts`'s `normalizeIngredients()`. Never throws; falls back to `{amount: null, is_scalable: false}` with the raw text as name. The frontend only ever sends raw text lines for ingredients — never pre-parsed `amount`/`unit` — because this is re-derived on every save.
- `jsonld-import.service.ts` — `parseRecipeFromJsonLd()`. `findRecipeNode()` unwraps `@graph`; `extractInstructionTexts()` recursively flattens `HowToSection.itemListElement`; `image`/`author`/`recipeYield`/`keywords` each accept a bare value or array/object per schema.org. `recipeCategory` and `keywords` both feed the same `tags` table (no separate category column at import time beyond the one `category` field). Array fields (`recipeIngredient`, `keywords`) are filtered to `typeof entry === 'string'` rather than cast, since real-world JSON-LD sometimes has non-string entries.
- `jsonld-export.service.ts` — `recipeToJsonLd()`, the inverse of import; omits null/empty fields.
- `db/transaction.ts` — `Queryable` type, `withTransaction<T>(fn)` wrapping `prisma.$transaction()`. Use this for any new multi-statement mutation rather than a bare `prisma.$transaction()` call inline in a service.

**Ownership.** Every `Recipe`/`Tag`/`Category`/`AiSettings` row has a `NOT NULL` `userId` FK. Every service function takes a `userId` and scopes every query with `where: { userId }` (or a `@@unique([userId, name])`-backed upsert) — this query-layer scoping, not just the DB constraint, is what prevents cross-user access. `middleware/require-auth.ts` sets `req.userId` from the JWT cookie; controllers pass it straight to the service call.

**Auth.** Stateless JWT in an httpOnly cookie (`utils/jwt.ts`, cookie name `token` / `AUTH_COOKIE_NAME`), no server-side session store. `signAuthToken(userId)` / `verifyAuthToken(token)` (returns `null` on any failure). `postRegister`/`postLogin` set the cookie (`sameSite: 'lax'`, `secure: COOKIE_SECURE` env, 30-day `maxAge`); `postLogout` clears it — there is no revocation, a token remains valid until expiry regardless of logout. `middleware/require-auth.ts` reads the cookie, verifies, sets `req.userId`; downstream code only ever reads `req.userId`. `auth.service.ts` hashes passwords with `bcryptjs` (cost 12) and always compares against a dummy hash when an email doesn't exist, so login timing doesn't leak registered emails. `middleware/rate-limit.ts` exports `loginRateLimiter` (10/15min/IP, on `/api/auth/register` + `/api/auth/login`) and `apiRateLimiter` (300/min/IP, on all `/api/*`). `COOKIE_SECURE` is its own env var, not tied to `NODE_ENV` — this app is commonly deployed as plain HTTP on a LAN, and a `secure` cookie is silently dropped by the browser over HTTP. Uploaded photos (`/uploads/recipes/:id/...`) aren't user-scoped by directory structure, so `middleware/require-photo-owner.ts` checks `recipes.user_id` before `express.static` serves anything, and `middleware/require-recipe-owner.ts` runs before multer's disk storage on the photo-upload route. `JWT_SECRET` and `AI_SETTINGS_ENCRYPTION_KEY` both throw at import time if unset — no insecure fallback in any environment. `app.set('trust proxy', 1)` is required alongside `COOKIE_SECURE` for correct `req.ip` behind a reverse proxy (otherwise `express-rate-limit` collapses every user behind the proxy into one bucket). No CSRF middleware — the only auth cookie is the JWT itself, `sameSite: 'lax'` already blocks cross-site delivery on state-changing requests.

**Types across the Prisma boundary.** `Recipe.servings` and `Ingredient.amount` are Prisma `Decimal` columns; `recipe.service.ts`'s mappers call `.toString()` on them when building `RecipeRow`/`IngredientRow`, so `string | null` is the type on both backend (`RecipeRow`) and frontend (`Recipe`/`Ingredient` in `src/types.ts`). Don't type these as `number`. `frontend/src/utils/numeric.ts`'s `toNumber(value, fallback?)` is the one conversion point for doing math on a `servings`/`amount` value — used by `useScaledIngredients.ts`, `RecipeDetailPage.tsx`, `RecipeFormPage.tsx`.

**Scaling** is a frontend concern. `frontend/src/hooks/useScaledIngredients.ts` computes `amount * (desiredServings / baseServings)` per ingredient; `utils/format-fraction.ts` renders the result rounded to the nearest eighth with a comma decimal separator (e.g. `1.5 → "1,5"`). Ingredients with `is_scalable: false` always render their original `raw_text` untouched regardless of the multiplier.

**Frontend state synced from async data** is adjusted during render, not via `useEffect` + `setState`: `RecipeDetailPage.tsx` and `RecipeFormPage.tsx` both use `if (data && trackedId !== data.id) { setTrackedId(data.id); setState(...) }` directly in the component body.

**Shared frontend primitives** — reuse these rather than recreating them: `components/Chip.tsx` (single active/inactive pill button), `components/FilterChips.tsx` (the "All + one chip per item" filter row built on `Chip`, used on `RecipeListPage.tsx`), `CategoryPicker.tsx` (form category selector, composes `Chip` directly), `components/ReorderableListEditor.tsx` (generic add/remove/move-by-index list editor — `IngredientListEditor.tsx`/`InstructionListEditor.tsx` are thin wrappers supplying only `renderItem`), `api/queryKeys.ts` + `hooks/useCategories.ts`/`useTags.ts`/`useAiSettings.ts` (single source of truth for React Query keys/fetches — don't reintroduce a raw `['tags']`/`['categories']` array literal).

**DB schema and migrations are managed by Prisma.** `backend/prisma/schema.prisma` is the single source of truth for the data model — models map to `snake_case` tables/columns via `@map`/`@@map` (e.g. `raw_text`, `is_scalable`, `user_id`) since controllers/tests/the API's JSON contract use those names directly. `backend/prisma/migrations/` holds generated timestamped SQL migrations tracked in Prisma's `_prisma_migrations` table. `backend/prisma.config.ts` (loaded automatically by the `prisma` CLI) supplies `datasource.url` from `DATABASE_URL` and points at the schema/migrations paths — `schema.prisma` itself has no `datasource.url` field (Prisma 7 rejects one there). To add a schema change: edit `schema.prisma`, run `npm run db:migrate:dev` against a local Postgres, commit the generated migration folder. Prisma migrations have no down-migration concept.

**Generated Prisma Client** lives at `backend/src/generated/prisma/` (gitignored, regenerated via `npx prisma generate`), not in `node_modules/` — `schema.prisma`'s `generator client` block sets `provider = "prisma-client"` (TypeScript-source generator) and `output = "../src/generated/prisma"`. `db/prisma.ts` wraps `PrismaClient` with `@prisma/adapter-pg` (`new PrismaPg({connectionString: ...})` passed as `{adapter}`) rather than a bare `new PrismaClient()` — Prisma 7 requires an explicit driver adapter. The singleton is stashed on `globalThis` outside production so `tsx watch`'s hot reload doesn't open a fresh connection pool on every save.

**AI features** (recipe creation and improvement) support OpenAI, Anthropic, Google Gemini, Ollama, or any OpenAI-compatible custom endpoint through one client, are non-streaming, and are DB-configured per user (`ai_settings` table, `UNIQUE(user_id)`, columns `provider` / `base_url` / `model` / `api_key_encrypted`, all nullable — a fresh user must explicitly configure this in Settings before AI features activate). `services/ai-provider.service.ts` constructs a fresh `new OpenAI({baseURL, apiKey, maxRetries: 0})` per call in `chatWithAi()`/`listAiModels()`, calling `.chat.completions.create()`/`.models.list()` against each provider's OpenAI-compatible endpoint (`resolveBaseUrl(provider, baseUrl)` picks the default base URL per provider when unset). Every failure normalizes into a typed `AiProviderError` (`kind: 'unreachable'|'bad_status'|'malformed_response'`), mapped to HTTP 502 by `utils/ai-provider-error-response.ts`'s `sendAiProviderError()`. Every chat call passes `response_format: {type: 'json_object'}` and `stream: false`.

**API key encryption.** `utils/crypto.ts` provides AES-256-GCM `encrypt()`/`decrypt()` keyed by `AI_SETTINGS_ENCRYPTION_KEY` (must decode to exactly 32 bytes). `ai-settings.service.ts`'s `updateAiSettings()` encrypts a provided `api_key`; `undefined` leaves the stored key unchanged, `null` clears it. `getAiSettings()` (backing `GET /api/ai/settings`) never decrypts — returns `has_api_key: boolean`. Only `getAiSettingsForCall()` decrypts, server-side, at the point of calling the provider.

**Every AI chat turn returns `{reply: string, recipe: AiRecipeDraft}`** — JSON-object response mode requires the whole response be valid JSON, so reply text and structured draft travel together. `services/ai-recipe-draft.service.ts`'s `buildChatMessages(conversation, currentDraft)` builds the message array (static system prompt + a separate system message carrying `JSON.stringify(currentDraft)`); `parseChatEnvelope(rawContent, currentDraft?)` strips a markdown fence if present and extracts `{reply, recipe}` with per-field fallbacks (`title` → `'Untitled recipe'`, `servings` → `1`). `image_path` is carried over unchanged from `currentDraft.image_path` every turn — the LLM never generates or reads it. `AiRecipeDraft` matches the frontend's `RecipeInput` shape (raw ingredient-line strings, `{step_number, text}` instructions, `servings: number`), not this backend's own `recipe.types.ts` `RecipeInput`.

**Create and Improve share one backend endpoint** (`POST /api/ai/chat`), differing only in the frontend-supplied `current_draft` starting point. `routes/ai.routes.ts` also mounts `GET`/`PUT /api/ai/settings` and `GET /api/ai/settings/models`. The chat endpoint is stateless (`{messages, current_draft}` every call, no conversation persistence, no `recipe_id` in the contract) — seeding `current_draft` from an existing recipe for the improve case is entirely a frontend concern (`getRecipe` + `utils/recipe-mapping.ts`'s `toRecipeInput()`).

**Frontend AI chat UI**: `pages/AiChatPage.tsx` is mounted at both `/create-with-ai` and `/recipes/:id/ai-improve`; `useParams<{id?: string}>()` alone determines improve-vs-create mode, no other branching. State is `messages: AiChatMessage[]` and `draft: RecipeInput | null`; in improve mode a render-time init block (same state-sync pattern as above, keyed on a `seededForId` guard) seeds `draft` from `toRecipeInput(recipe)` with no LLM call. Every turn calls `chatAboutRecipe({messages, current_draft: draft})` and replaces `draft` wholesale with the response's `recipe`. `components/RecipePreview.tsx` is a read-only renderer for a `RecipeInput`-shaped draft. Save hands off to the existing manual form: `navigate('/recipes/new', {state: {aiDraft: draft}})` for create, `navigate('/recipes/:id/edit', {state: {aiDraft: draft}})` for improve — `RecipeFormPage.tsx` hydrates from `location.state.aiDraft` for both new and existing recipes, guarded so a later-resolving `existingRecipe` query doesn't clobber an already-present `aiDraft`. Both AI entry points (`App.tsx`'s nav link, `RecipeDetailPage.tsx`'s "Improve with AI" button) are gated on `Boolean(useAiSettings().data?.model)` — the same "configured" check `ai.controller.ts`'s `requireModel()` uses server-side for its 409.

**Tags and categories are stored lowercase**; display capitalization is CSS-only (Tailwind's `capitalize` utility at each render site — `RecipeCard`, `RecipeDetailPage`, `RecipeFormPage`, `Chip`/`FilterChips`, `CategoryPicker`). The two category badges in `RecipeCard`/`RecipeDetailPage` use `uppercase` instead. `tags.name`/`categories.name` have `@@unique([userId, name])`; lowercasing is enforced only in `upsertTags`/`upsertCategory`, not by a DB constraint — any new write path for tag/category names must go through those functions, and any new code comparing/deduping names should compare case-insensitively.

## Type-package gotchas

- `typescript-eslint@8.x` currently pins its `typescript` peer range to `>=4.8.4 <6.1.0`. Check that range before bumping `typescript` past it, or ESLint will silently mismatch the compiler it lints against.
- `uuid`'s bundled types only exist from v10+; the `@types/uuid` package is an empty stub with no real declarations. Use `uuid@^11` (own types) rather than installing `@types/uuid`.
- Prisma 7: `schema.prisma`'s `datasource` block cannot have a `url` field (`P1012` if it does) — the connection string only lives in `prisma.config.ts`. `new PrismaClient()` with no arguments throws at the first query — an explicit driver adapter (`@prisma/adapter-pg`) is required. The `prisma-client` generator requires an explicit `output` path and emits TypeScript source (not prebuilt JS+`.d.ts`); it auto-detects `NodeNext` from `tsconfig.json` and emits `.js`-suffixed relative imports to match — re-verify by regenerating and checking `src/generated/prisma/client.ts`'s import specifiers if a Prisma upgrade changes generator defaults.
- `eslint-plugin-react-hooks`'s `configs['recommended-latest']` export is legacy eslint-plugin config shape, not flat-config — spread only `.rules` into a flat config block and register the plugin object under `plugins: { 'react-hooks': reactHooks }` (see `frontend/eslint.config.js`).
- Tailwind's `content` glob in `tailwind.config.js` must list the actual source extensions (`**/*.{ts,tsx}`) — a stale glob silently purges nearly all utility classes from the production build only, not dev.
- `frontend/eslint.config.js`'s `ignores`, `frontend/.prettierignore`, and the root `.dockerignore` all exclude `dev-dist/**`/`dev-dist` — the PWA plugin's dev-mode service-worker output, generated locally after `npm run dev`. Check these first if lint/format reports spurious errors from a generated Workbox bundle.
- `backend/tsconfig.json` (`include: ["src", "tests"]`, no `rootDir`/`outDir`) is the type-checking config; `backend/tsconfig.build.json` (`extends` the former, adds `rootDir: "src"`/`outDir: "dist"`, `include: ["src"]`) is the emit config used only by `npm run build`. They can't be merged: `tests/` sits outside `rootDir: "src"`. The root `Dockerfile`'s `backend-build` stage `COPY`s both explicitly.
- Backend test files that reset the DB in `beforeAll` must go through `tests/helpers/db.ts`'s `resetTestDatabase()` and must not disable `vitest.config.ts`'s `fileParallelism: false` — concurrent `prisma migrate deploy` runs against the same test database race each other.

## Quality bar before calling a change done

- CI (`.github/workflows/ci.yml`) runs `typecheck`/`lint`/`format:check`/`test`/`build` for both packages against a real Postgres service container, plus a `docker build .` job. Keep it in sync with local tooling.
- Run `npm run typecheck && npm run lint && npm test` in every package you touched, not just the one with the obviously-changed file — the ingredient parser, JSON-LD import/export, and scaling hook each have call sites in the other package. If you touched frontend code, also run `npm run build`.
- Treat console/lint/test warnings as failures to fix, not noise to skim past.
- Check `npm audit` before and after adding a dependency. Findings in the vite/vitest/esbuild dev-tooling chain are dev-server-only and accepted; a new finding against a runtime dependency (express, pg, multer, zod, etc.) is not.
- Match existing conventions: ESM everywhere (`type: module`, no CommonJS `require`), `strict: true` TypeScript in both packages, Tailwind v3-style config, functional React components with hooks, zod only at trust boundaries (API request bodies), not sprinkled through internal function signatures.
- Dependency versions are pinned as a compatible set (Tailwind v3/Vite v5/vitest v2/typescript-eslint's supported TS range). Don't bump one in isolation without checking the others still resolve and `typecheck`/`lint`/`test`/`build` all pass.
- No browser automation in this repo (no Chromium/Playwright/Puppeteer). Verify frontend changes via `typecheck`/`lint`/`test`/`build` plus reading the rendered JSX/Tailwind classes; ask the user to check visually if a real check is needed.

## Maintaining this file

Keep this file factual and current, not historical. When you change something with real architectural weight (a new service, a new table, a non-obvious constraint), update the relevant section to describe what the code does now — file/function names, current behavior, config values.

- Do not add prose reasoning, design-decision justification, or "used to be X, now it's Y" narrative. State the current fact only. If a past approach matters at all, it's because it explains a genuine non-obvious constraint a future editor could otherwise break — write that constraint as a terse warning, not a story.
- When something described here is renamed, removed, or superseded, delete or rewrite that entry — don't leave it stale. An incorrect entry is worse than no entry.
- Prefer one dense sentence with exact file/function names over a paragraph of context.
