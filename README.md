# Yumbry

A self-hosted, multi-user recipe manager. Store recipes manually or import them
from a recipe site's JSON-LD, search and filter by tag, scale ingredients to any
serving size, and attach photos.

Each user logs in with an email and password and only ever sees their own
recipes, tags, categories, and AI settings — there's no sharing between
accounts. Anyone reaching the app can self-register; there's no invite system,
so this is still meant for a trusted local network (household, small team),
not the open internet, unless you put it behind your own access control.
Logins last up to 30 days (see `JWT_SECRET` below).

## Setup

1. Copy the example environment file and adjust credentials if you'd like:

   ```sh
   cp .env.example .env
   ```

2. Start everything:

   ```sh
   docker compose up
   ```

3. Open [http://localhost:3000](http://localhost:3000) (or whatever `APP_PORT` you set in `.env`).

Recipe photos and the database each persist in their own named Docker volume
(`uploads_data` and `db_data`), so your data survives container restarts and
rebuilds. `docker compose down -v` removes both volumes — use with care.
Inspect uploaded photos via `docker compose exec app ls /app/uploads` (there's
no host filesystem path for them in the Docker deployment — see Development
below for the separate local-dev location).

`docker compose up` also starts a `llama` service — a built-in, zero-config AI
provider (llama.cpp serving Google's Gemma 4 E2B model) selectable on the
Settings page without any API key or address to configure. It downloads a
few GB of model weights into its own `llama_cache` volume the first time it
starts, so the first AI request after a fresh install may be slow until that
finishes; every other provider works immediately as usual.

## Importing a recipe

Most recipe blogs embed a `<script type="application/ld+json">` tag containing
structured recipe data. To import one:

1. Open the recipe's page in your browser, view page source (or "Inspect"),
   and find the `<script type="application/ld+json">` block.
2. Copy its full contents.
3. In Yumbry, go to **Import**, paste the JSON into the textarea, and
   submit — or save it as a `.json` file and use the file upload option instead.

The importer handles both a bare `Recipe` object and a `@graph`-wrapped one,
parses ingredient quantities (including fractions like `1/2` and mixed numbers
like `1 1/2`) for serving-size scaling, and turns `recipeCategory`/`keywords`
into filterable tags. Ingredient lines that can't be parsed are kept as-is and
simply won't scale with the servings stepper.

## Development (without Docker)

Requires Node 24+ and a local Postgres instance.

The easiest way to get Postgres without running the whole app in Docker is to
start just the `db` service from `docker-compose.yml`:

```sh
docker compose up -d db   # uses the same db_data volume and .env credentials
```

The backend also needs its own `backend/.env` — the root `.env` is for Docker
Compose, where `DATABASE_URL` points at the `db` service by hostname; running
the backend directly means `db:5432` won't resolve, so it needs a separate
`DATABASE_URL` pointing at `localhost` instead. `backend/src/index.ts` loads
`.env` from the process's working directory, so this file has to live in
`backend/`, not the repo root:

```sh
cd backend
echo 'DATABASE_URL=postgres://chef:changeme@localhost:5432/recipe_vault
JWT_SECRET=dev-secret-not-for-production' > .env
```

(adjust user/password/db name to match whatever's in the root `.env`.) `JWT_SECRET`
has no fallback — the app throws at startup if it's unset, so this always needs
setting, even for local development.

Recipe photos live in `backend/uploads/` on disk (`UPLOADS_DIR` defaults to
`./uploads` relative to the backend process's cwd). This is a different
location from the Docker deployment, which stores photos in a named volume
(`uploads_data`) rather than on the host filesystem — the two don't share
files.

```sh
# Backend
npm install
npx prisma generate   # generates backend/src/generated/prisma
npm run db:migrate    # apply pending migrations (re-run after pulling new ones)
npm run dev            # http://localhost:3000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                                  # http://localhost:5173, proxies /api to :3000
```

## Testing

```sh
cd backend && npm test    # unit tests always run; API integration tests need TEST_DATABASE_URL
cd frontend && npm test
```

The backend's integration test suites (`recipes.api.test.ts` and others) talk
to a real, disposable Postgres database — they drop and recreate the `public`
schema on each run, then apply all migrations from `backend/prisma/migrations/`
themselves via `prisma migrate deploy` (no manual migration step needed for
tests). Point it at a scratch database, never your real one.

If you're running the dev stack via `docker compose up`, the same Postgres
server is already up on port 5432 — create the scratch database inside it
once (a different database name, same server/user, so it can never collide
with your real data):

```sh
docker exec -it <db-container-name> psql -U chef -d postgres -c "CREATE DATABASE recipe_vault_test;"
```

Then point tests at it:

```sh
TEST_DATABASE_URL=postgres://chef:changeme@localhost:5432/recipe_vault_test npm test
```

Without `TEST_DATABASE_URL` (or `DATABASE_URL`) set, those tests are skipped
automatically and the rest of the suite still runs.

## Database migrations

Schema changes are managed by [Prisma](https://www.prisma.io/). The schema
lives in `backend/prisma/schema.prisma`; generated migrations live as
timestamped SQL folders in `backend/prisma/migrations/`, tracked in Prisma's
own `_prisma_migrations` table.

```sh
npm run db:migrate         # apply all pending migrations (prisma migrate deploy)
npm run db:migrate:dev     # generate + apply a new migration from schema.prisma changes
npm run db:migrate:status  # show which migrations are pending
```

- **Docker**: migrations run automatically — the `app` container's entrypoint
  runs `prisma migrate deploy` before starting the server, on every start. No
  manual step needed; `docker compose exec app npm run db:migrate` also works
  as a manual escape hatch (e.g. to check status without restarting).
- **Local dev / CI**: run `npm run db:migrate` yourself, once initially and
  again after pulling commits with new migrations.
- **Conventions**: edit `schema.prisma`, then run `npm run db:migrate:dev`
  against a local Postgres to generate and apply the new migration folder, and
  commit it. Never hand-edit a migration folder that's already been committed
  — write a new schema change to fix it forward instead. Prisma migrations
  have no down-migration concept.

## Type checking, linting, and formatting

Both packages are TypeScript, with ESLint (flat config, `typescript-eslint`) and
Prettier. Run these from `backend/` or `frontend/`:

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run format      # prettier --write .
npm run format:check
```

`frontend`'s `npm run build` runs `tsc --noEmit` before `vite build`, so a type
error fails the build rather than shipping silently. The backend's `npm run
build` compiles `src/` to `dist/` with `tsc`; `npm run dev` runs the TypeScript
source directly via `tsx watch` instead.
