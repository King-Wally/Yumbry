# Yumbry

A self-hosted, multi-user recipe manager. Add recipes by hand, import them from a recipe site's
link or JSON-LD, read one off a photo, or draft one with an AI assistant. Search and filter by tag
and category, scale ingredients to any serving size, keep a version history, and attach photos.

Each user signs in with an email and password. Recipes, tags and categories belong to a
**family**: everyone starts in a family of their own and can invite others with a link, after which
they share one collection. A single recipe can also be shared through a public link that anyone can
open, and signed-in visitors can save a copy. Anyone who can reach the app can register, so it is
meant for a trusted network (household, small team) unless you put it behind your own access
control. Logins last up to 30 days.

The app is installable as a PWA on phones and desktops.

## Setup

Requires Docker with Compose.

1. Copy the example environment file:

   ```sh
   cp .env.example .env
   ```

2. Edit `.env`. At minimum:
   - `ORIGIN`: the URL people open the app at, without a trailing slash, for example
     `http://localhost:3000` or `https://recipes.example.com`. Compose refuses to start without it.
   - `BETTER_AUTH_SECRET`: a long random value (`openssl rand -base64 32`). Changing it later
     signs everyone out.
   - `POSTGRES_PASSWORD`: keep it URL-safe (letters, digits, `-`, `_`), for example
     `openssl rand -hex 24`.
   - `COOKIE_SECURE=true` if the app is served over HTTPS.

3. Start everything:

   ```sh
   docker compose up -d --build
   ```

4. Open `ORIGIN` (by default [http://localhost:3000](http://localhost:3000); the host port is
   `APP_PORT`).

The app migrates its database on every start, so there is no separate migration step. The database
and the recipe photos live in two named volumes, `db_data` and `uploads_data` (mounted at
`/app/uploads`), so data survives restarts and rebuilds. `docker compose down -v` deletes both:
use with care. List the stored photos with `docker compose exec app ls -R /app/uploads`.

### Environment

`.env.example` documents every variable. In short:

| Variable                                                                                        | Needed for                                                           |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `ORIGIN`                                                                                        | Required. Sign-in, form security checks, and links in emails.        |
| `BETTER_AUTH_SECRET`                                                                            | Required. Signs session cookies and tokens.                          |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`                                             | The database. Compose builds the app's connection string from these. |
| `APP_PORT`, `POSTGRES_PORT`                                                                     | Host ports (defaults 3000 and 5432).                                 |
| `COOKIE_SECURE`                                                                                 | `true` behind HTTPS. Leave unset on plain HTTP, or logins break.     |
| `OPENROUTER_API_KEY`                                                                            | The AI assistant: create and improve with AI, photo import.          |
| `GEMINI_API_KEY`                                                                                | AI nutrition estimates.                                              |
| `AI_MODEL_*`, `AI_MONTHLY_BUDGET_USD`, `AI_USER_DAILY_BUDGET_USD`, `GEMINI_DAILY_REQUEST_LIMIT` | Which models the assistant uses, and what it may spend.              |
| `RESEND_API_KEY`, `EMAIL_FROM`                                                                  | "Forgot your password?" emails.                                      |
| `BROWSER_CDP_URL`, `BROWSER_TIMEZONE`, `BROWSER_LOCALE`                                         | The browser fallback for URL import (on by default under Compose).   |

Every optional feature simply disappears from the UI when its variables are unset.

## Upgrading from 1.x

Version 2 is a rewrite (SvelteKit on Bun instead of Express, React and Prisma). Your data, logins,
links and installed apps carry over. Before upgrading:

1. **Back up.** Dump the database and archive the photos volume:

   ```sh
   docker compose exec db pg_dump -U chef -Fc recipe_vault > yumbry-backup.dump
   docker run --rm -v <project>_uploads_data:/data -v "$PWD":/backup alpine \
     tar czf /backup/yumbry-uploads.tgz -C /data .
   ```

   (Use your own `POSTGRES_USER`/`POSTGRES_DB`, and the volume name `docker volume ls` shows.)

2. **Set `ORIGIN`.** It replaces both `BETTER_AUTH_URL` and `APP_BASE_URL`, which you can remove.
   Use the same URL `BETTER_AUTH_URL` held.
3. **Keep `BETTER_AUTH_SECRET` unchanged.** Then everyone stays signed in.
4. **Check `POSTGRES_PASSWORD` is URL-safe** (letters, digits, `-`, `_`). Compose now builds the
   app's `DATABASE_URL` from it; a separate `DATABASE_URL` for the app container is no longer used.
5. Pull and start as usual (`docker compose up -d --build`).

On first start the app recognises the 1.x database and adopts it without changing any data. The
volumes keep their names; photos are now mounted at `/app/uploads` instead of
`/app/backend/uploads`, which the compose file takes care of. Installed copies of the PWA replace
their old offline cache with the new app by themselves the next time they are opened.

The 1.x migration history (`_prisma_migrations`) is left in place, so you can roll back by starting
the 1.x image on the same database if something goes wrong.

## AI assistant

The AI assistant (optional, via `OPENROUTER_API_KEY`) spends from one server-wide budget, $1 a
month by default. A day's share is added every day, unused budget carries over until the month
resets, and each user also has a daily cap. Every user can see what's left on the Settings page. See
the `AI_MONTHLY_BUDGET_USD` block in `.env.example`, and set the same limit on the OpenRouter key
itself as a backstop. Nutrition estimates use Google Gemini directly (`GEMINI_API_KEY`) and are
capped per day by request count.

## Importing a recipe

**Paste URL** fetches the recipe page on the server and reads the structured recipe data
(schema.org JSON-LD) most recipe sites embed. You review the result in the recipe form before
saving.

Some sites put bot protection in front of their pages (Cloudflare's "Just a moment…" check and
similar) that a plain fetch can't pass. For those, the import is retried in
[CloakBrowser](https://github.com/CloakHQ/CloakBrowser), a Chromium whose bot tells are patched out
in the binary itself, running headful on a virtual display. It runs as the `browser` service, which
starts with the rest of the stack and is wired up by default; set `BROWSER_CDP_URL=` (empty) in
`.env` to turn it off. The sidecar is the official `cloakhq/cloakbrowser` image (amd64 and arm64),
used unmodified. Set `BROWSER_TIMEZONE` (and optionally `BROWSER_LOCALE`) to match where your server
is. It sits on an internal network: its only way out is an SSRF-checking proxy inside the app, so it
can't reach your LAN. It can use up to ~1 GB of RAM during an import. Sites that block by IP or with
a hard WAF rule (Cloudflare "Sorry, you have been blocked") still fail.

The free CloakBrowser binary may be used commercially but not redistributed. Pulling the official
image is fine; don't bake the binary into an image you publish.

**Import JSON-LD** (shown once "JSON import/export" is switched on in Settings) takes the contents
of a page's `<script type="application/ld+json">` block, pasted or as a `.json` file, and saves it
straight away. The same setting adds an Export button to every recipe, whose file imports back as
the same recipe.

The importer handles a bare `Recipe` object and a `@graph`-wrapped one, parses ingredient
quantities (including fractions like `1/2` and mixed numbers like `1 1/2`) for serving-size scaling,
and turns `recipeCategory`/`keywords` into filterable tags. Ingredient lines that can't be parsed are
kept as they are and simply don't scale.

## Development

Requires [Bun](https://bun.sh) 1.4.2 (the version in `package.json`'s `packageManager`), Node 24
for the end-to-end tests only, and a Postgres server. The easiest Postgres is the compose `db`
service on its own:

```sh
docker compose up -d db          # uses the db_data volume and the credentials in .env
```

`.env` serves both Compose and local development. For `bun run dev`, its `DATABASE_URL` points at
`localhost` (Compose ignores it and points the app at the `db` service) and `ORIGIN` is the Vite dev
server:

```sh
DATABASE_URL=postgres://chef:changeme@localhost:5432/recipe_vault
ORIGIN=http://localhost:5173
```

`BETTER_AUTH_SECRET` may stay unset in development: the app falls back to a fixed placeholder.

```sh
bun install            # also generates the SvelteKit types and the Paraglide messages
bun run db:migrate     # bring the database up to date (again after pulling new migrations)
bun run dev            # http://localhost:5173
```

Photos go to `./uploads` (`UPLOADS_DIR`), separate from the Docker volume. To try URL import's
browser fallback without the full stack, run
`docker run --rm -p 127.0.0.1:9222:9222 cloakhq/cloakbrowser:0.5.11 cloakserve` and set
`BROWSER_CDP_URL=http://127.0.0.1:9222` (on macOS also `BROWSER_PROXY_HOST=host.docker.internal`).

To run the production build locally: `bun run build`, then `bun run start` (it needs `ORIGIN` and
`PORT`, for example `ORIGIN=http://localhost:3000 PORT=3000 bun run start`).

### Checks

```sh
bun run check          # svelte-check and TypeScript
bun run lint           # Prettier and ESLint
bun run format         # Prettier, writing
```

### Testing

```sh
bun run test                         # unit tests, once (bun run test:unit watches)
bun run e2e:build && bun run e2e     # end-to-end, in a real browser
```

The component tests run in Chromium: install it once with `bunx playwright install chromium`.

The database-backed service tests (`*.db.spec.ts`) need a scratch database and are skipped without
one. They drop every table on each run, so never point them at real data. Create one next to the dev
database once, then pass it in:

```sh
docker compose exec db psql -U chef -d postgres -c "CREATE DATABASE yumbry_test;"
TEST_DATABASE_URL=postgres://chef:changeme@localhost:5432/yumbry_test bun run test
```

The end-to-end suite in [`e2e/`](e2e/README.md) drives the production build in a real browser, with
fakes standing in for OpenRouter, Gemini, Resend and recipe websites. It is written against pages
and URLs, not the implementation. See [`e2e/README.md`](e2e/README.md).

### Database migrations

The schema is defined with [Drizzle](https://orm.drizzle.team) in `src/lib/server/db/schema.ts`.
Migrations are SQL files in `drizzle/`, recorded in the database's `drizzle` schema.

```sh
bun run db:generate    # write a new migration from schema.ts changes
bun run db:migrate     # apply pending migrations
bun run db:studio      # browse the database
bun run db:rehearse    # migrate scratch copies (empty, 1.x schema, a restored dump) and compare
```

- **Docker** runs `db:migrate` on every container start. It is idempotent and serialised, so
  restarts and concurrent starts are safe.
- **Local development** runs `bun run db:migrate` once, and again after pulling new migrations.
- **Conventions:** change `schema.ts`, run `bun run db:generate`, and commit the new migration.
  Never edit or regenerate a committed migration, including `drizzle/0000_baseline.sql`, which
  reproduces the 1.x schema; fix forward with a new one instead.
- Before a risky upgrade, `bun run db:rehearse --dump path/to/backup.dump` replays the migration on
  a restored copy and checks that every table keeps its row count.

### Releasing

```sh
scripts/release.sh minor --dry-run   # show the version it would release, change nothing
scripts/release.sh minor             # bump, commit "Release: vX.Y.Z", tag and push
```

It takes `patch` (the default), `minor`, `major` or an explicit version, and refuses to run with
uncommitted changes.
