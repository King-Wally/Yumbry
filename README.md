# Recipe Vault

A self-hosted, single-user recipe manager. Store recipes manually or import them
from a recipe site's JSON-LD, search and filter by tag, scale ingredients to any
serving size, and attach photos.

No authentication — this is meant for a single user on a trusted local network.

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

Recipe photos are stored on disk at `backend/uploads/` (bind-mounted into the
`app` container so they're visible to a locally-run backend too — see
Development below) and the database in a named Docker volume (`db_data`), so
your data survives container restarts and rebuilds. `docker compose down -v`
removes the database volume — use with care; recipe photos live in
`backend/uploads/` regardless and aren't affected by `-v`.

## Importing a recipe

Most recipe blogs embed a `<script type="application/ld+json">` tag containing
structured recipe data. To import one:

1. Open the recipe's page in your browser, view page source (or "Inspect"),
   and find the `<script type="application/ld+json">` block.
2. Copy its full contents.
3. In Recipe Vault, go to **Import**, paste the JSON into the textarea, and
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
echo 'DATABASE_URL=postgres://chef:changeme@localhost:5432/recipe_vault' > .env
```

(adjust user/password/db name to match whatever's in the root `.env`.)

Recipe photos live in `backend/uploads/` on disk (`UPLOADS_DIR` defaults to
`./uploads` relative to the backend process's cwd) — this is the same folder
`docker-compose.yml` bind-mounts into the `app` container, so photos uploaded
via one route are visible via the other with no extra copying.

```sh
# Backend
npm install
npm run db:migrate   # apply pending migrations (re-run after pulling new ones)
npm run dev           # http://localhost:3000

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

The backend's `recipes.api.test.ts` integration suite talks to a real,
disposable Postgres database — it drops and recreates the `public` schema on
each run, then applies all migrations from `backend/migrations/` itself
(no manual migration step needed for tests). Point it at a scratch database,
never your real one:

```sh
TEST_DATABASE_URL=postgres://chef:changeme@localhost:5432/recipe_vault_test npm test
```

Without `TEST_DATABASE_URL` (or `DATABASE_URL`) set, those tests are skipped
automatically and the rest of the suite still runs.

## Database migrations

Schema changes live as timestamped SQL files in `backend/migrations/`,
applied via [node-pg-migrate](https://github.com/salsita/node-pg-migrate) and
tracked in a `pgmigrations` table — there's no more single `schema.sql`.

```sh
npm run db:migrate               # apply all pending migrations
npm run db:migrate:create <name> # scaffold a new migration (fill in Up/Down)
npm run db:migrate:down          # roll back the most recent migration
npm run db:migrate:status        # dry-run: show what would be applied
```

- **Docker**: migrations run automatically — the `app` container's entrypoint
  applies pending migrations before starting the server, on every start. No
  manual step needed; `docker compose exec app npm run db:migrate` also works
  as a manual escape hatch (e.g. to check status without restarting).
- **Local dev / CI**: run `npm run db:migrate` yourself, once initially and
  again after pulling commits with new migrations.
- **Conventions**: one migration per logical schema change; never edit a
  migration that's already been committed — write a new one to fix it
  forward instead; always fill in both the Up and Down sections.

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
