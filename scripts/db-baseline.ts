// Adopts a database created by the old Prisma app into Drizzle's migration history.
//
// drizzle/0000_baseline.sql recreates exactly the schema Prisma's migrations built, so on such a
// database it must be recorded as applied without running (it would fail on the existing tables).
// After this, `drizzle-kit migrate` applies only migrations newer than the baseline. A fresh, empty
// database needs none of this: `drizzle-kit migrate` runs the baseline like any other migration.
//
// Idempotent: does nothing once any Drizzle migration is recorded, or when the database has no
// Yumbry tables yet. Run with `bun run db:baseline` (bun loads .env).
import postgres from 'postgres';
import { readMigrationFiles } from 'drizzle-orm/migrator';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const [baseline] = readMigrationFiles({ migrationsFolder: './drizzle' });
if (!baseline) throw new Error('No migrations found in ./drizzle');

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
	await sql.begin(async (tx) => {
		const [{ exists: hasUsers }] =
			await tx`select to_regclass('public.users') is not null as exists`;
		if (!hasUsers) {
			console.log('No existing schema found — run `bun run db:migrate` instead.');
			return;
		}

		await tx`create schema if not exists drizzle`;
		await tx`
			create table if not exists drizzle.__drizzle_migrations (
				id serial primary key,
				hash text not null,
				created_at bigint
			)`;

		const [{ count }] = await tx`select count(*)::int as count from drizzle.__drizzle_migrations`;
		if (count > 0) {
			console.log(`Migration history already has ${count} row(s) — nothing to do.`);
			return;
		}

		await tx`
			insert into drizzle.__drizzle_migrations (hash, created_at)
			values (${baseline.hash}, ${baseline.folderMillis})`;
		console.log('Recorded 0000_baseline as applied.');
	});
} finally {
	await sql.end();
}
