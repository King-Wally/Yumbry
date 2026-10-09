# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Yumbry is a self-hosted, multi-user recipe manager: manual/JSON-LD/URL/photo recipe import,
tag/category filtering, serving-size scaling, version history, photo attachments, and an AI
assistant for drafting/improving recipes, backed by a single server-wide OpenRouter API key
(`OPENROUTER_API_KEY`) — there is no per-user AI configuration. Data (recipes, tags, categories,
versions) is siloed per **family**: every user starts in a personal family of one and can join
another through an invite link. The only way out of a family's silo is a public share link.

One SvelteKit 3 app (Svelte 5 runes), built with `@sveltejs/adapter-node` and run on **Bun**, with
Drizzle on Postgres and better-auth. The only workspace is `e2e/` (the Playwright suite). The app
replaced an Express + React + Prisma stack (`main` up to v1.3.1); `MIGRATION.md` records how and
why, step by step, and is the place to look for the reasoning behind anything surprising below.

## Commands

From the repo root:

```sh
bun install             # also runs `prepare`: svelte-kit sync + Paraglide compile
bun run dev             # bun --bun vite dev (http://localhost:5173)
bun run build           # bun --bun vite build → build/
bun run start           # bun scripts/serve.ts (the production server; needs ORIGIN)
bun run check           # svelte-check, plus tsc over src/service-worker
bun run lint            # prettier --check . && eslint .
bun run format          # prettier --write .
bun run test            # every vitest project, once
bun run test:unit       # bun --bun vitest (watch mode)
```

Unit tests run under `bun --bun vitest` in three projects (`vite.config.ts`):

- `client`: `*.svelte.spec.ts`, rendered in Playwright Chromium (browser mode). Install it once
  with `bunx playwright install chromium`.
- `server`: every other `*.spec.ts`, on Bun.
- `server-db`: `*.db.spec.ts`, service tests against a real Postgres at `TEST_DATABASE_URL`, skipped
  when it is unset. They drop every table (`#lib/server/db/testing.ts`), so never point it at a real
  database, and they share one database, hence `fileParallelism: false`. A spec swaps the app's
  client for the test one with `vi.mock('#lib/server/db/index.ts', …)` (see that helper's header).

```sh
TEST_DATABASE_URL=postgres://chef:changeme@localhost:5432/yumbry_test bun run test
bun --bun vitest run src/lib/server/uploads/storage.spec.ts   # one file
```

Database (Drizzle):

| Script                | What it does                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `bun run db:migrate`  | `scripts/migrate.ts`: bring `DATABASE_URL` up to date with `drizzle/`. Idempotent; the Docker image runs it on every start.   |
| `bun run db:generate` | `drizzle-kit generate`: a new migration from `schema.ts` changes. Reports "No schema changes" while `schema.ts` is untouched. |
| `bun run db:rehearse` | `scripts/rehearse-migrate.ts`: migrate scratch copies (empty, v1.3.1 Prisma schema, a restored dump) and compare.             |
| `bun run db:studio`   | `drizzle-kit studio`.                                                                                                         |

Local dev needs a `.env` with `DATABASE_URL` pointing at `localhost` (start just Postgres with
`docker compose up -d db`) and `ORIGIN=http://localhost:5173`. `BETTER_AUTH_SECRET` falls back to a
fixed placeholder outside production. Photos go to `./uploads` (`UPLOADS_DIR`).

End-to-end: `bun run e2e:build && bun run e2e` (see "End-to-end tests" below and `e2e/README.md`).

Releases: `scripts/release.sh [patch|minor|major|<version>] [--dry-run]` bumps the root
`package.json` with `bun pm version`, commits `Release: vX.Y.Z`, tags and pushes. `--dry-run`
prints the version and restores `package.json`.

Before committing: `bun run check`, `bun run lint`, `bun run test` and, for behaviour changes,
`bun run e2e`. CI (`.github/workflows/ci.yml`) runs all of them, then builds the Docker image and
smoke-tests it against an empty database.

## Architecture

### Source layout

`src/lib` is split by where code may run, then grouped by feature. Folder names carry the
feature, so file names don't repeat it (`server/ai/budget.ts`, not `server/ai/ai-budget.ts`).
Specs sit next to their module.

```
src/lib/
├── client/        browser-only: hydrated, toast, server-status, locale, install-platform, …
├── components/
│   ├── ui/            generic building blocks (Card, Dialog, PopoverMenu, Chip, …)
│   ├── app/           mounted once by the root layout (Toaster, ServerUnavailable)
│   ├── recipe/        showing a recipe (RecipeDetailView and its parts)
│   ├── recipe-form/   editing a recipe (RecipeForm, TagEditor, CategoryPicker, PhotoUpload)
│   ├── recipe-list/   the home page (RecipeCard, SearchBar, FilterChips)
│   ├── versions/      VersionPane, DiffText
│   └── ai/            AiChat, AiErrorBanner, RecipePreview
├── shared/        framework-free, used by both sides
│   ├── ai/  i18n/  recipe/  units/
├── server/        server-only
│   ├── ai/            provider, budget, errors, chat and nutrition actions
│   ├── auth/          better-auth config, guards, login/register forms, return-to, reset email
│   ├── db/            Drizzle client, schemas, test-database helper
│   ├── family/        family service, account deletion, errors
│   ├── http/          request plumbing: security headers, rate limits, flash, kinded errors, locale
│   ├── preferences/   parse and update user preferences
│   ├── recipes/       recipe, tag, version and share services, form action, JSON-LD, draft hand-off
│   ├── uploads/       photo storage and image preparation
│   └── url-import/    scrape service, safe-fetch, headless-fetch, SSRF proxy, import log
└── paraglide/     generated, git-ignored
```

### Server platform

**Environment.** `src/env.ts` declares every variable with Kit's `defineEnvVars`; code imports them
from `$app/env/private` (and `$app/env` for `dev`/`building`). Validators run at build time with an
empty environment and again at start-up, so `bun run build` needs no secrets and a missing required
variable fails when the server starts. Required: `DATABASE_URL`, `ORIGIN`, and `BETTER_AUTH_SECRET`
in production. Everything else is optional, and unset and empty mean the same thing (the e2e harness
passes `''` to switch features off). Numeric budget variables reject garbage at start-up.

**`ORIGIN`** is the one base-URL setting: better-auth's `baseURL`, the origin SvelteKit's CSRF check
and `event.url` see, and links in emails and invite/share URLs. adapter-node 6 dropped its own
`ORIGIN` support, so `scripts/serve.ts` wraps `build/index.js`: it points adapter-node's
`PROTOCOL_HEADER`/`HOST_HEADER` at private headers and fills them from `ORIGIN` on every request,
overwriting whatever a client sent. It also adds `cache-control: no-cache` to
`/service-worker.js` and `/manifest.webmanifest`, and fills a missing `X-Forwarded-For` with the
peer address (adapter-node throws without its `ADDRESS_HEADER`). Always start the server through
`serve.ts`, never `bun build/index.js`.

**Hooks** (`src/hooks.server.ts`):

- `init` sweeps orphaned families once at start-up, without blocking the first request.
- `handle` is `sequence(handleSecurityHeaders, handleClientAddress, handleBetterAuth, handleParaglide)`.
  Security headers are helmet's defaults (`#lib/server/http/security-headers.ts`) except
  `Referrer-Policy: same-origin`: under helmet's `no-referrer`, Chrome sends `Origin: null` on a
  native form POST and Kit's CSRF check refuses every form submitted before hydration. The CSP is
  Kit's own (`csp` in `vite.config.ts`, `mode: 'auto'` for nonces), with `img-src https:` because
  imported recipes keep remote image URLs.
- `handleClientAddress` copies `event.getClientAddress()` into a private header better-auth's rate
  limiter reads, always overwritten so a client can't pick its bucket.
- `handleBetterAuth` puts `session`/`user` on `locals` (from the database, every request) before
  better-auth's `svelteKitHandler` answers `/api/auth/*`.
- `handleError` logs unexpected errors and returns a generic "Internal server error".

**Rate limits.** better-auth limits `/api/auth/*` itself (`#lib/server/auth/better-auth.ts`). Server-side `auth.api.*` calls
skip that, so `#lib/server/http/rate-limit.ts` carries the same rules over to the form actions
(`signInLimiter`, `signUpLimiter`, `changePasswordLimiter`, `deleteAccountLimiter`,
`passwordResetRequestLimiter`, `passwordResetLimiter`) and adds the app's own (`urlImportLimiter`,
`photoImportLimiter`, `familyJoinLimiter`). In-memory fixed windows keyed by client address;
`DISABLE_RATE_LIMITS=1` turns all of them off. There is deliberately no blanket limiter.

**Domain errors.** `AiProviderError`/`AiQuotaExceededError`, `UrlImportError` and `FamilyError`
carry a `.kind`; `#lib/server/http/kinded-errors.ts` is the one place that maps kinds to statuses.
Actions return `failKinded(err)` (`fail(status, { message, kind, scope?, retryAt? })`), loads and
endpoints call `throwKinded(err)`. Anything unrecognized is rethrown and becomes a 500 through
`handleError`. Never map to 502 or 504: behind Cloudflare those are replaced by Cloudflare's own
error page.

### Routes, loads and actions

Routes live in `src/routes/` (file-based). Protected pages sit in the `(app)` group: `/`, `/recipes/new`,
`/recipes/[id]` with `edit`, `versions`, `ai-improve` and `export`, `/import` with `url` and `photo`,
`/create-with-ai`, `/settings`, `/onboarding`. Public pages stay outside it: `/login`, `/register`,
`/logout` (action only), `/forgot-password`, `/reset-password`, `/join-family/[token]`,
`/share/[token]`. The page URLs are part of the contract (invite and reset links in inboxes point at
them).

- **Data flows through `+page.server.ts` loads and form actions** with `use:enhance`. `+server.ts`
  is only for things that aren't pages: `/api/health`, `/uploads/[...path]`,
  `/recipes/[id]/export`, `/share/[token]/photo`, and the legacy `/sw.js` and `/registerSW.js`.
  There is no JSON API and no client-side data cache: every navigation re-runs loads, which read
  `familyId` fresh, so leaving a family takes effect on the next navigation with nothing to
  invalidate.
- Validation is Zod inside the action; a failure is `fail(400, { values, errors })` (recipe form,
  via `parseRecipeForm` in `#lib/server/recipes/form-action.ts`) or `fail(status, { message })`.
- **Kit 3's `enhance` navigates** to the action's page on success when the action belongs to
  another route (posting to `/settings?/preferences` from onboarding or the AI chat), as a native
  submit would. Pass `update({ navigate: false })` there.
- **Cookies the app sets:** `yumbry-return-to` (where to go after logging in;
  `#lib/server/auth/return-to.ts`, same-origin paths only; `/login?redirectTo=` and
  `/register?redirectTo=` can request it), `yumbry-flash` (one-shot toast keys:
  `family_joined`, `recipe_imported`, `recipe_reverted`; `#lib/server/http/flash.ts`), `yumbry-draft`
  (draft hand-off id, below) and `yumbry-locale`. Protected redirects go to a bare `/login`.
- **Draft hand-off** (`#lib/server/recipes/draft-handoff.ts`): URL import, photo import and AI chat hand a
  draft to `/recipes/new` (or, with a numeric target, to that recipe's edit form) through
  `stashDraft`/`takeDraft`. The cookie carries only a random id; the draft waits in memory for 10
  minutes, bound to the user and taken once.
- **Full-screen pages** (onboarding) return `fullScreen: true` from their load and get no header.

**Hydration policy.** Forms and links must work **before hydration**: form actions, GET forms (the
list's filter chips) and real links. Supporting browsers with JS turned off is not a goal, and there
is no `<noscript>`. Controls that only do something in the browser (dialogs, copy-link, servings
stepper, list editors, tag/category pickers, AI chat input) are disabled until `hydrated.current`
(`#lib/client/hydrated.svelte.ts`, set by the root layout's `onMount`); Playwright waits for them to be
enabled. Patterns that keep early input:

- `bind:value` text/number inputs that render before hydration also carry a `defaultValue`
  attribute; otherwise hydration wipes or collapses what was typed.
- A control whose change handler does the work (language select, version select, file pickers)
  gets a catch-up attachment that acts on the value the DOM already holds. One that submits waits a
  `tick()` so `use:enhance` is attached first.
- Menus are native popovers (`PopoverMenu.svelte`), which open before hydration.

### Guards and family scoping

`#lib/server/auth/guards.ts`:

- `getUser(event)` → `{ user, familyId }` or null; `requireUser(event)` → the same, or remembers the
  page and redirects 303 to `/login`.
- `requireRecipe(event, params.id)` → adds a `recipeId` the family owns, or `error(404, 'Recipe not found.')`.
  A malformed id, a missing recipe and another family's recipe are the same 404.

The `(app)` layout's `requireUser` only covers navigation: page loads run in parallel with it and
actions never run it. **Every load, action and endpoint calls `requireUser` or `requireRecipe`
itself.** Every query that touches `recipes`, `tags`, `categories` or `recipe_versions` filters by
the signed-in user's `familyId` (an integer; user ids are better-auth strings). The one deliberate
exception is `getRecipeByShareToken` (`#lib/server/recipes/recipes.ts`), for public share links.

### Auth

[better-auth](https://better-auth.com) owns identity and sessions. Config lives in
`src/lib/server/auth/better-auth.ts` and is mounted at `/api/auth/*` by `svelteKitHandler` in the hooks; every
endpoint under that prefix is better-auth's, and the e2e suite calls them directly. The pages are
our own: `/login`, `/register`, `/logout`, `/forgot-password`, `/reset-password` and the settings
actions call `auth.api.*` server-side with the request headers, and the `sveltekitCookies` plugin
(which must stay last in `plugins`) sets the cookies. There is no better-auth client in the browser.
Errors shown are better-auth's own text, through `authRefusal` (`#lib/server/auth/forms.ts`).

Load-bearing, because production sessions from v1.3.1 must stay valid:

- **Cookie names.** `cookiePrefix: 'yumbry'` gives `yumbry.session_token` (`HttpOnly`,
  `SameSite=Lax`, 30 days), with the `__Secure-` prefix when `COOKIE_SECURE=true`. Pinned by
  `src/lib/server/auth/better-auth.spec.ts`. Set `COOKIE_SECURE` only behind HTTPS, or the browser never sends
  the cookie back.
- **`BETTER_AUTH_SECRET`** must stay the value v1.3.1 used. Changing it logs everyone out.
- **`baseURL` is `ORIGIN`.** A wrong origin breaks better-auth's path matching and Kit's CSRF check.
- **`session.cookieCache` is deliberately off.** It would let `getSession` answer from the cookie,
  serving a stale `familyId` to someone who just left a family. Session revocation is real row
  deletion (`revokeSessionsOnPasswordReset`, `revokeOtherSessions` on password change).

The app bolts five columns onto better-auth's user table as `additionalFields`: `familyId` plus the
four preferences (`locale`, `unitSystem`, `smallVolumes`, `jsonImportExportEnabled`). All are
`input: false`, so neither signup nor better-auth's `updateUser` can write them; preferences go
through `/settings?/preferences` (`parsePreferences` + `updatePreferences`). `familyId` must be
declared `required: false` despite its NOT NULL column: better-auth validates required fields
against the request payload _before_ `databaseHooks` runs. The `user.create.before` hook creates the
personal family and supplies the id; `deleteUser.afterDelete` (`cleanUpFamilyAfterDelete`) tidies
the family after an account is deleted.

### i18n (Paraglide)

Messages live in `messages/{en,nl,fr,es}.json` (inlang format, `project.inlang/`); the compiled
runtime is generated into `src/lib/paraglide/` (git-ignored) by the Vite plugin and by `prepare`
(`scripts/paraglide-compile.ts`). Both read `paraglide.config.ts`, since the CLI can't set
`cookieName`. Use messages as `m.recipe_form_title()` from `#lib/paraglide/messages.js`. Keys are
snake_case, plurals are one message with plural variants (`m.recipe_versions_differences({ count })`),
and lists are numbered messages. `src/lib/shared/i18n/messages.spec.ts` checks all four locales have the
same keys, so add every new message in all four. English wording is what e2e specs select on.

No locale in URLs. The strategy is `custom-session` → `cookie` (`yumbry-locale`) →
`preferredLanguage` → `baseLocale` (`en`):

- On the server, `custom-session` is the signed-in user's `users.locale`, handed from
  `handleBetterAuth` to Paraglide through a `WeakMap` keyed by the request (`#lib/server/http/locale.ts`).
  Hence better-auth runs before Paraglide in the sequence. `<html lang>` is set in the SSR output,
  and a signed-in user's cookie is kept in step with their saved language.
- On the client, `custom-session` reads `<html lang>`, so hydration always agrees with SSR.
- Every language switch goes through `saveLocaleChoice(event, locale)` (cookie, plus `users.locale`
  when signed in). A client-only `setLocale()` would be overruled on the next request. An enhanced
  form calls `applyLocale` (`#lib/client/locale.ts`) before `update()`, and the root layout wraps the
  shell in `{#key data.locale}` so it re-renders without a reload.
- `hooks.client.ts` moves v1.x's `localStorage['yumbry.locale']` into the cookie once.

### Database (Drizzle)

`src/lib/server/db/`: `index.ts` (postgres-js client, `db`, and `DbExecutor` for "the client or a
transaction"; it ends the pool on adapter-node's `sveltekit:shutdown` so the container stops
promptly), `schema.ts` (app tables) and `auth.schema.ts` (better-auth's `users`, `sessions`,
`accounts`, `verifications`).

**Table and column names are part of the contract.** The database was created by v1.3.1's Prisma
migrations (plural tables, snake_case columns), and `drizzle/0000_baseline.sql` reproduces exactly
that schema (`bun run db:rehearse` proves it with a `pg_dump --schema-only` diff). Never rename a
table, column, index or constraint.

`scripts/migrate.ts` (`bun run db:migrate`) runs on every container start and needs no drizzle-kit:

- A Prisma-era database (`users` exists, no Drizzle history) has the baseline recorded as applied
  instead of run, but only if `_prisma_migrations` ends at v1.3.1's last migration.
- It aborts if the recorded history holds a hash `drizzle/` doesn't, which means an edited or
  regenerated migration.
- Pending migrations run in one transaction, under an advisory lock that serialises concurrent
  starts.
- `_prisma_migrations` is left in place so v1.3.1 can still run on the database for a rollback. Drop
  it later in an ordinary migration, never by hand.

Conventions: change `schema.ts`, run `bun run db:generate`, review and commit the generated SQL and
`drizzle/meta/`. **Never hand-edit or regenerate a committed migration**, including the baseline;
fix forward with a new one. Postgres `numeric` columns are read through `decimalString`
(`#lib/shared/recipe/numeric.ts`) so they print like Prisma did (`"4"`, not `"4.000…"`), and Drizzle returns
`sum()` over numeric as a string.

Services live in the feature folders under `src/lib/server/` (see "Source layout"). Write paths that span tables run in `db.transaction`, and helpers that
can join a caller's transaction take a `DbExecutor`. `updateRecipe` writes the `recipe_versions`
snapshot of the replaced state in the same transaction, which is what makes reverts undoable.

### Uploads

Photos are stored under `UPLOADS_DIR` (image: `/app/uploads`, the `uploads_data` volume; dev:
`./uploads`) as `recipes/<id>/<uuid>.webp`, and `recipes.image_path` holds `/uploads/recipes/<id>/<file>`.
`#lib/server/uploads/storage.ts` owns the layout: `checkPhotoFile` (JPEG/PNG/WebP/GIF only, no SVG, 25 MB),
`saveRecipePhoto` (after sharp re-encodes to WebP in `#lib/server/uploads/image-prep.ts`), path resolution
that only accepts `recipes/<id>/<plain file name>` with an image extension, copy and delete helpers.
`/uploads/[...path]` answers 401 signed out and 404 for anything that isn't the family's file, with
`Cache-Control: private` and `nosniff`. `BODY_SIZE_LIMIT=30M` (image and e2e config) leaves room
for a 25 MB photo plus the rest of the form.

### Public share links

The one deliberate hole in family scoping (`#lib/server/recipes/share.ts`). `recipes.share_token`
(nullable, unique, 32 random bytes hex) is minted by the recipe page's `?/share` action
(idempotent and race-safe) and nulled by `?/unshare`, which kills the link; sharing again makes a new
token. Neither bumps `updated_at`. `/share/[token]` is public: its load uses `getUser` (never
redirects) and returns the recipe without `id`, `share_token` or `category_id`, plus
`own_recipe_id` when the viewer's family owns it. A malformed, unknown or stopped token is the same
404, shown as the dead-link page (`share/[token]/+error.svelte`). `/share/[token]/photo` serves the
local photo, since `/uploads` is family-gated. `?/import` (requires login; signed-out visitors are
sent to log in and come back) copies the recipe into the caller's family through `createRecipe`,
recreating tags and category by name and copying the photo file (best-effort). The recipe body is
shared with the owner's page through `RecipeDetailView.svelte`.

### URL import

`/import/url` is one rate-limited action. `scrapeRecipeFromUrl` (`#lib/server/url-import/scrape.ts`)
fetches the page, logs the attempt (`logImportAttempt`), and hands the recipe to `/recipes/new` as a
draft; nothing is saved until the cook presses Save. JSON-LD is extracted with Bun's built-in
`HTMLRewriter` and parsed by `parseRecipeFromJsonLd` (`#lib/server/recipes/jsonld-import.ts`).

The network stack (`#lib/server/url-import/`) is written for Bun, and its security properties are not
negotiable:

- **`safe-fetch.ts`**: `assertSafeTarget` resolves the host and rejects anything that isn't
  ipaddr.js `unicast`. `pinnedFetch` then calls Bun's `fetch` with the **checked IP** in the URL,
  the hostname only in `Host` and, for https, `tls.serverName` (so the certificate is still
  verified). Every redirect hop is parsed, checked and dialled again; cookies carry over in a
  tough-cookie jar; desktop-Chrome headers. Don't use undici: on Bun its `Agent` is a stub that
  ignores `connect.lookup` and resolves the hostname itself, a silent SSRF hole
  (`runtime.spec.ts` has a canary).
- **`headless-fetch.ts`**: if the plain fetch fails with `bot_challenge`, `no_jsonld`, or a
  401/402/403/429/503, and `BROWSER_CDP_URL` is set, it retries over CDP
  (`chromium.connectOverCDP`, stock `playwright-core`) against the `browser` compose sidecar: the
  official `cloakhq/cloakbrowser` image running `cloakserve`. CloakBrowser's stealth patches live in
  the binary. The browser's identity (headful under Xvfb, `BROWSER_TIMEZONE`, `BROWSER_LOCALE`) is
  set by the sidecar's flags, never from the app: context-level UA, viewport, locale or timezone
  overrides are CDP emulation, which is detectable. One context per fetch, closed afterwards;
  `browser.close()` only disconnects. If the browser is unreachable, the original error is reported.
  A page with JSON-LD counts as the real page even if it matches challenge markers.
- **`ssrf-proxy.ts`**: every browser request goes through a per-fetch, authenticated forward proxy
  in the app (`node:http`) that runs `assertSafeTarget` on each CONNECT and plain-HTTP hop and dials
  the checked IP directly (no `lookup` callbacks: Bun calls them with `all: true`). `route()` alone
  would miss redirect targets. The browser reaches it at `BROWSER_PROXY_HOST` (compose: `app`); the
  compose `browser` network is `internal`, so that proxy is the sidecar's only way out.
- `E2E_SAFE_FETCH_ALLOW` is a test-only exact `host:port` allowlist for private addresses.

### AI provider

`#lib/server/ai/provider.ts`: `chatWithAi(messages, { userId, tier, jsonSchema?, sampling? })` talks to
OpenRouter through the `openai` SDK (OpenAI-compatible chat completions). Keys and models are read
at call time, so the app boots without them; a missing key throws `AiProviderError` `not_configured`
(503), and SDK failures normalise to `unreachable` | `bad_status` | `malformed_response`
(`#lib/server/ai/errors.ts`). It writes the usage ledger row itself.

Four tiers, each reading only `AI_MODEL_<TIER>` (defaults in `DEFAULT_MODELS`): `big` only for the
first turn of a recipe written from scratch (create mode, turn 1, `chatTier`), `medium` for every
other chat turn, `small` for nutrition, `image` (vision-capable) for photo import. No fallback model
and no `provider` field are sent; OpenRouter's default routing applies, with no retry loop of ours.
The `small` tier bypasses OpenRouter and calls Gemini's OpenAI-compatible endpoint with
`GEMINI_API_KEY` (`TIER_BACKEND`); its model id has no `google/` prefix. `OPENROUTER_BASE_URL` and
`GEMINI_BASE_URL` are test-only overrides for the e2e fakes.

Budget (`#lib/server/ai/budget.ts`): every call is recorded in the `ai_usage` ledger (OpenRouter's
`usage.cost`; attempt counts, failed ones included, for Gemini). The OpenRouter pool is
`AI_MONTHLY_BUDGET_USD × dayOfMonth / daysInMonth − spentThisMonth` (UTC, resets on the 1st), plus a
per-user UTC-day cap (`AI_USER_DAILY_BUDGET_USD`, `0` turns it off). Gemini is capped at
`GEMINI_DAILY_REQUEST_LIMIT` requests per Pacific-time day. Guards `assertOpenRouterBudget(userId)`
and `assertGeminiQuota()` throw `AiQuotaExceededError` (`quota_exceeded`, 429, with `scope` and
`retryAt`). An AI action calls its guard first, **before `request.formData()`** (the chat turn reads
its small body first so a refusal can echo the transcript back), and returns `failKinded(err)`,
which `AiErrorBanner.svelte` renders.

Where it is used:

- **Chat** (`/create-with-ai`, `/recipes/[id]/ai-improve`): one `AiChat.svelte` page posting
  `?/chat` and `?/review` (`#lib/server/ai/chat-action.ts`). `chatWithAi` answers in one piece, so
  a turn is a form action: the page posts the transcript and current draft as hidden JSON each turn
  (validated by `#lib/server/ai/chat-schema.ts`) and gets the whole next state back. The mode comes from the
  route, never from the client. Prompt building and envelope parsing live in
  `#lib/shared/ai/recipe-draft.ts`. Saving goes through the recipe form via the draft hand-off.
- **Photo import** (`/import/photo`): rate limit, budget, `checkPhotoFile`, `prepareImageForModel`,
  `image` tier, draft hand-off.
- **Nutrition** (`?/estimateNutrition` on the new and edit pages, `#lib/server/ai/nutrition-action.ts`):
  the "Estimate with AI" button posts the form's data with `fetch` + `deserialize` and merges the
  result locally.
- The root layout returns `aiConfigured` (`OPENROUTER_API_KEY`) and `nutritionConfigured`
  (`GEMINI_API_KEY`), which hide the AI menu entries, "Improve with AI" and the Estimate button.
  Settings shows the remaining allowance (`#lib/shared/ai/budget-display.ts`).

### Email

`#lib/server/auth/email.ts`: password-reset emails through the `resend` SDK, configured only when both
`RESEND_API_KEY` and `EMAIL_FROM` are set (`isEmailConfigured()`; the login page hides "Forgot your
password?" otherwise, and `sendResetPassword` is a silent no-op). The link is
`${ORIGIN}/reset-password?token=…`, the same URL v1.x sent, since links in inboxes must keep
working. `RESEND_BASE_URL` (test-only) is passed as the client's `baseUrl`.

### PWA and service worker

- **`src/service-worker/index.ts`** (Kit 3's directory form, with its own `tsconfig.json`, so the
  root tsconfig excludes it and `bun run check` runs `tsc -p src/service-worker`): precaches
  `$app/manifest`'s immutable files and static assets, serves `/uploads/*` stale-while-revalidate
  from an `uploads` cache (200s only, at most 300 entries), and leaves navigations, `__data.json`,
  `/api` and form posts to the network. Pages are rendered per user, so there is no shell to cache:
  a PWA opened offline shows the browser's offline page. `skipWaiting` + `clients.claim`; old
  caches are deleted on activate. `version.pollInterval` (1 h, `vite.config.ts`) makes a long-open
  PWA pick up a deploy on its next navigation.
- **Manifest:** `static/manifest.webmanifest`, linked from `src/app.html`.
- **Legacy takeover — keep these routes.** Installs of v1.x run a Workbox worker registered at
  `/sw.js`, which serves a cached React shell and checks `/sw.js` for updates.
  `src/routes/sw.js/+server.ts` answers with a worker that deletes every cache, unregisters itself
  and reloads its windows onto the new app, which then registers `/service-worker.js`.
  `src/routes/registerSW.js/+server.ts` is a harmless no-op script. Both send `no-cache` so
  Cloudflare's edge never keeps a copy.
- **Outage screen:** `#lib/client/server-status.svelte.ts` (`up`/`checking`/`down`). `hooks.client.ts`
  observes every same-origin `window.fetch` (which Kit calls at request time precisely so it can be
  wrapped) and probes `/api/health` on start; any suspicion is confirmed by a health ping before
  `ServerUnavailable.svelte` covers the page ("Temporarily offline", "Try again" →
  `invalidateAll()`). `#lib/client/server-availability.ts` classifies responses.
- `deploy/offline-worker/` is a Cloudflare Worker that serves an offline page when the origin is
  unreachable. It skips 503, which the app uses for AI errors.

### Frontend conventions

- Svelte 5 runes only (forced for the project in `vite.config.ts`). Use the Svelte MCP/skills and
  the `svelte:svelte-file-editor` agent for `.svelte` files.
- Components live in `src/lib/components/<group>/`, one file each (groups under "Source
  layout"). bits-ui is used only for `Dialog`
  (`Dialog.svelte`, `ConfirmDialog.svelte`, which can post a form action itself). Menus are
  `PopoverMenu.svelte` (native `popover` with CSS anchor positioning). List reordering (pointer
  and keyboard, with translated announcements via `setAriaStrings`) is svelte-dnd-action's
  `dragHandleZone` in `ReorderableListEditor.svelte`; its handles must not be `<button>`s, whose
  keys the library ignores. Icons from `@lucide/svelte`.
  Toasts: `showToast({ title, description })` from `#lib/client/toast.svelte.ts`, rendered by
  `Toaster.svelte`.
- Tailwind 4 with the design tokens in `src/routes/layout.css`.
- Accessible names matter: the e2e specs select by role and English text.
- Imports use the `#lib/*` alias (`package.json` `imports`) with explicit `.ts` extensions
  (`#lib/server/auth/guards.ts`), plus Kit's `$app/*`.

### Framework-free logic

`src/lib/shared/` holds logic with no SvelteKit or Svelte dependency, each module with a `*.spec.ts`
next to it: `recipe/` (scaling, the recipe-form rules, ingredient parsing, ISO durations,
numeric columns, diffing, snapshots, the recipe DTOs), `units/` (measurement parsing, conversion
and formatting), `ai/` (prompt building and parsing for chat, photo import and nutrition, draft
rendering, budget types and display) and `i18n/` (`SUPPORTED_LOCALES`). Keep new logic of that
kind there, with unit tests, rather than in components or actions. Browser-only logic goes in
`src/lib/client/`; server-only code goes in `src/lib/server/`, which Kit refuses to import from
the client.

Bun quirk: in a module that unit tests load, write `import * as z from 'zod'`; `import { z }` comes
back undefined under `bun --bun vitest`.

### Docker

The `Dockerfile` is multi-stage on `oven/bun:<version>-slim` (Debian, glibc, so sharp's prebuilds
load; amd64 and arm64, production is arm64). The runtime stage holds production dependencies
(`--omit peer`), `build/`, `drizzle/`, `scripts/migrate.ts` and `scripts/serve.ts`, runs as the
`bun` user (uid 1000, the same as v1.x's `node` user, so existing uploads stay writable), and starts
with `bun scripts/migrate.ts && exec bun scripts/serve.ts`. Only `/app/uploads` is writable. Image
defaults: `NODE_ENV=production`, `PORT=3000`, `BODY_SIZE_LIMIT=30M`, `UPLOADS_DIR=/app/uploads`,
`ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1` (the client IP behind the Cloudflare Tunnel).
`HEALTHCHECK` fetches `/api/health` with bun.

`docker-compose.yml` runs `app`, `db` (Postgres 16) and `browser` (CloakBrowser). The volume names
`db_data` and `uploads_data` must never change. The app's `DATABASE_URL` is built from
`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`, so the password must be URL-safe; `.env`'s own
`DATABASE_URL` is for `vite dev` on the host. Compose refuses to start without `ORIGIN`.

## End-to-end tests

`e2e/` (a Bun workspace, but Playwright, the fakes and its scripts run on **Node**, the only runtime
Playwright supports). `bun run e2e:build && bun run e2e` builds the app, drops and recreates
`E2E_DATABASE_URL` (default `.../yumbry_e2e`), migrates it with `bun run db:migrate`, then starts a
fakes server (OpenRouter, Gemini, Resend, recipe sites, a JS-challenge site), a local CloakBrowser
over CDP (`e2e/scripts/cdp-browser.ts`; the binary is downloaded into `~/.cloakbrowser`), and two
app servers via `scripts/serve.ts`: full, and minimal with no AI, email or browser. Every spec runs
in both projects.

This suite is the stack-neutral source of truth for the app's behaviour:

- **Never edit `e2e/specs/*` to fit the app.** A failing spec means the app is wrong.
- Seed through `e2e/support/db.ts` (the only file that knows table names).
- Act and assert through the UI with accessible selectors (no `data-testid`).
- Never call the app's internals. Only `/api/auth/*`, `/api/health` and `/uploads/*` may be called
  directly.
- Everything stack-specific is an env var in `e2e/support/env.ts`; the app config each server gets
  is `appEnv` in `e2e/playwright.config.ts`. The test-only variables the app honours are
  `OPENROUTER_BASE_URL`, `GEMINI_BASE_URL`, `RESEND_BASE_URL`, `E2E_SAFE_FETCH_ALLOW` and
  `DISABLE_RATE_LIMITS`.

See `e2e/README.md` for the contract table and how to run single specs.

## Notes for changes

- New queries and mutations on recipes, tags, categories or versions filter by the signed-in
  `familyId`; every load, action and endpoint calls `requireUser`/`requireRecipe` itself.
- Prefer a load or a form action over a `+server.ts`; make forms work before hydration, and disable
  JS-only controls until `hydrated.current`.
- Map new domain errors through `#lib/server/http/kinded-errors.ts`, not ad hoc statuses.
- Add every new message to all four locale files.
- Schema changes: edit `schema.ts`, `bun run db:generate`, commit the migration. Never touch the
  baseline or a committed migration, and never rename existing tables or columns.
- Keep cookie names, page URLs, `/api/auth/*`, `/api/health`, `/uploads/*` and the legacy `/sw.js`
  stable: existing sessions, links in inboxes and installed PWAs depend on them.
