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

Recipe photos are stored in a named Docker volume (`uploads_data`) and the
database in another (`db_data`), so your data survives container restarts and
rebuilds. `docker compose down -v` will remove both — use with care.

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

Requires Node 20+ and a local Postgres instance.

```sh
# Backend
cd backend
npm install
psql "$DATABASE_URL" -f src/db/schema.sql   # apply the schema once
npm run dev                                  # http://localhost:3000

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
each run. Point it at a scratch database, never your real one:

```sh
TEST_DATABASE_URL=postgres://chef:changeme@localhost:5432/recipe_vault_test npm test
```

Without `TEST_DATABASE_URL` (or `DATABASE_URL`) set, those tests are skipped
automatically and the rest of the suite still runs.

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
