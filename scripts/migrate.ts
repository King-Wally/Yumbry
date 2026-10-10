// Brings DATABASE_URL up to date with ./drizzle. Run on every start (`bun run db:migrate`), and safe
// to: it is idempotent and needs only runtime dependencies, never drizzle-kit.
//
// An empty database runs the baseline like any other migration. A 1.x database (`users` exists, no
// Drizzle history) is refused: only v2.0.x knows how to adopt one.
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';

// Arbitrary, fixed: serialises concurrent starts against the same database.
const LOCK_KEY = 7_291_684_201;

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const migrations = readMigrationFiles({ migrationsFolder });
if (migrations.length === 0) throw new Error(`No migrations found in ${migrationsFolder}`);

// One connection, so the session-level advisory lock covers every query below.
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
	await sql`select pg_advisory_lock(${LOCK_KEY})`;

	await sql`create schema if not exists drizzle`;
	await sql`
		create table if not exists drizzle.__drizzle_migrations (
			id serial primary key,
			hash text not null,
			created_at bigint
		)`;

	const recorded = await sql<{ hash: string }[]>`
		select hash from drizzle.__drizzle_migrations order by created_at`;
	const [{ hasUsers }] = await sql`select to_regclass('public.users') is not null as "hasUsers"`;
	if (recorded.length === 0 && hasUsers) {
		throw new Error(
			'This database predates v2 (it has tables but no Drizzle history).' +
				' Upgrade to v2.0.x first, then to this version.'
		);
	}

	// drizzle decides what is pending by timestamp alone, so a regenerated or edited migration would
	// otherwise be re-run (or silently skipped) instead of being reported.
	const known = new Set(migrations.map((m) => m.hash));
	const unknown = recorded.filter((r) => !known.has(r.hash));
	if (unknown.length > 0) {
		throw new Error(
			`Migration history doesn't match ${migrationsFolder}: recorded hash(es) ` +
				`${unknown.map((r) => r.hash.slice(0, 12)).join(', ')} have no local migration.` +
				' Was a migration edited or regenerated?'
		);
	}

	// All pending migrations run in one transaction.
	await migrate(drizzle(sql), { migrationsFolder });

	const pending = migrations.length - recorded.length;
	console.log(pending > 0 ? `Applied ${pending} migration(s).` : 'Database is up to date.');
} finally {
	await sql`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
	await sql.end();
}
