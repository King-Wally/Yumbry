// Brings DATABASE_URL up to date with ./drizzle. Run on every start (`bun run db:migrate`), and safe
// to: it is idempotent and needs only runtime dependencies, never drizzle-kit.
//
// A database built by the old Prisma app (v1.3.1) already has exactly the schema of
// drizzle/0000_baseline.sql (scripts/rehearse-migrate.ts proves it), so the baseline is recorded as
// applied instead of run. _prisma_migrations is left alone, so v1.3.1 can still run on the database
// for a rollback. An empty database runs the baseline like any other migration.
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';

// The last Prisma migration on main. A Prisma-era database is only adopted at exactly this state.
const LAST_PRISMA_MIGRATION = '20260930120000_add_import_attempt_method';
// Arbitrary, fixed: serialises concurrent starts against the same database.
const LOCK_KEY = 7_291_684_201;

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const migrations = readMigrationFiles({ migrationsFolder });
const [baseline] = migrations;
if (!baseline) throw new Error(`No migrations found in ${migrationsFolder}`);

// One connection, so the session-level advisory lock covers every query below.
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
	await sql`select pg_advisory_lock(${LOCK_KEY})`;

	const adopted = await sql.begin(async (tx) => {
		await tx`create schema if not exists drizzle`;
		await tx`
			create table if not exists drizzle.__drizzle_migrations (
				id serial primary key,
				hash text not null,
				created_at bigint
			)`;

		const [{ count }] = await tx`select count(*)::int as count from drizzle.__drizzle_migrations`;
		const [{ hasUsers }] = await tx`select to_regclass('public.users') is not null as "hasUsers"`;
		if (count > 0 || !hasUsers) return false;

		const [{ hasPrisma }] =
			await tx`select to_regclass('public._prisma_migrations') is not null as "hasPrisma"`;
		if (hasPrisma) {
			const [state] = await tx`
				select
					count(*) filter (where finished_at is null and rolled_back_at is null)::int as pending,
					max(migration_name) filter (where finished_at is not null and rolled_back_at is null) as last
				from _prisma_migrations`;
			if (state.pending > 0 || state.last !== LAST_PRISMA_MIGRATION) {
				throw new Error(
					`Refusing to adopt: _prisma_migrations is at ${state.last ?? 'nothing'}` +
						` (${state.pending} unfinished), expected ${LAST_PRISMA_MIGRATION}.` +
						' Upgrade to v1.3.1 and let it migrate first.'
				);
			}
		}

		await tx`
			insert into drizzle.__drizzle_migrations (hash, created_at)
			values (${baseline.hash}, ${baseline.folderMillis})`;
		return true;
	});
	if (adopted)
		console.log(
			`Adopted Prisma-era database: recorded ${baseline.hash.slice(0, 12)} (baseline) as applied.`
		);

	// drizzle decides what is pending by timestamp alone, so a regenerated or edited migration would
	// otherwise be re-run (or silently skipped) instead of being reported.
	const known = new Set(migrations.map((m) => m.hash));
	const recorded = await sql<{ hash: string }[]>`
		select hash from drizzle.__drizzle_migrations order by created_at`;
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
