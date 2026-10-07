// Rehearses `bun run db:migrate` on scratch databases next to DATABASE_URL, and proves that
// drizzle/0000_baseline.sql is the schema the Prisma app built. Never touches DATABASE_URL's own
// database: every database it creates or drops is named rehearse_*.
//
//   bun run db:rehearse [--dump backups/pre-svelte.dump] [--prisma-ref v1.3.1] [--keep]
//
// 1. empty:   migrate an empty database twice; the second run must be a no-op.
// 2. prisma:  apply <prisma-ref>'s Prisma migration SQL; its schema must equal the empty one's. Then
//             migrate it (the adopt path) and compare again.
// 3. restore: restore --dump, migrate twice; every table's row count must stay the same, the
//             baseline must be recorded once and _prisma_migrations kept.
// 4. drift:   the restored schema must equal the empty one's, so production never drifted.
//
// Schemas are compared with pg_dump --schema-only, minus the drizzle schema and _prisma_migrations.
// pg tools run in the compose `db` service by default; PG_TOOLS=host uses the ones on the PATH.
// For step 27, point --dump at a fresh production backup.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import postgres from 'postgres';

const { values: args } = parseArgs({
	options: {
		dump: { type: 'string', default: 'backups/pre-svelte.dump' },
		'prisma-ref': { type: 'string', default: 'v1.3.1' },
		keep: { type: 'boolean', default: false }
	}
});

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error('DATABASE_URL is not set');

const run = `rehearse_${Date.now()}`;
const dbs = { empty: `${run}_empty`, prisma: `${run}_prisma`, restore: `${run}_restore` };
const workDir = mkdtempSync(join(tmpdir(), 'rehearse-'));

const urlFor = (db: string) => {
	const url = new URL(baseUrl);
	url.pathname = `/${db}`;
	return url.toString();
};

const assertScratch = (db: string) => {
	if (!/^rehearse_[a-z0-9_]+$/.test(db)) throw new Error(`Refusing to touch database "${db}"`);
};

const admin = postgres(urlFor('postgres'), { max: 1, onnotice: () => {} });

const checks: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
	checks.push({ name, ok, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n${detail}` : ''}`);
};

async function exec(cmd: string[], opts: { env?: Record<string, string>; stdin?: string } = {}) {
	const proc = Bun.spawn(cmd, {
		env: { ...process.env, ...opts.env },
		stdin: opts.stdin ? Bun.file(opts.stdin) : 'ignore',
		stdout: 'pipe',
		stderr: 'pipe'
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited
	]);
	return { stdout, stderr, code };
}

// pg_dump/pg_restore, either in the compose `db` service (socket auth as the URL's user) or on the
// host (TCP, password from the URL).
async function pgTool(tool: string, db: string, toolArgs: string[], stdin?: string) {
	const url = new URL(baseUrl!);
	const user = decodeURIComponent(url.username);
	const cmd =
		process.env.PG_TOOLS === 'host'
			? [tool, '-h', url.hostname, '-p', url.port || '5432', '-U', user, '-d', db, ...toolArgs]
			: ['docker', 'compose', 'exec', '-T', 'db', tool, '-U', user, '-d', db, ...toolArgs];
	const res = await exec(cmd, { env: { PGPASSWORD: decodeURIComponent(url.password) }, stdin });
	if (res.code !== 0) throw new Error(`${tool} failed on ${db}:\n${res.stderr}`);
	return res.stdout;
}

async function createDb(db: string) {
	assertScratch(db);
	await admin.unsafe(`create database "${db}"`);
}

async function migrateDb(db: string) {
	const res = await exec(['bun', 'scripts/migrate.ts'], { env: { DATABASE_URL: urlFor(db) } });
	if (res.code !== 0) throw new Error(`migrate failed on ${db}:\n${res.stdout}${res.stderr}`);
	return res.stdout.trim();
}

async function withDb<T>(db: string, fn: (sql: postgres.Sql) => Promise<T>) {
	const sql = postgres(urlFor(db), { max: 1, onnotice: () => {} });
	try {
		return await fn(sql);
	} finally {
		await sql.end();
	}
}

async function schemaOf(db: string) {
	const dump = await pgTool('pg_dump', db, [
		'--schema-only',
		'--no-owner',
		'--no-privileges',
		'--exclude-schema=drizzle',
		'--exclude-table=public._prisma_migrations'
	]);
	return (
		dump
			.split('\n')
			// Comments carry the database name; \restrict carries a random key per dump. A fresh
			// database's public schema has template1's comment, but production's was dropped and
			// recreated without one, so its dump says COMMENT ON SCHEMA public IS ''. That is metadata
			// on the schema itself, not on anything in it.
			.filter(
				(line) =>
					!line.startsWith('--') &&
					!/^\\(un)?restrict\b/.test(line) &&
					!line.startsWith('COMMENT ON SCHEMA public ')
			)
			.join('\n')
			.replace(/\n{2,}/g, '\n\n')
			.trim() + '\n'
	);
}

async function compareSchemas(name: string, a: string, b: string) {
	const [left, right] = await Promise.all([schemaOf(a), schemaOf(b)]);
	if (left === right) return check(name, true);
	const fa = join(workDir, `${a}.sql`);
	const fb = join(workDir, `${b}.sql`);
	writeFileSync(fa, left);
	writeFileSync(fb, right);
	check(name, false, (await exec(['diff', '-u', fa, fb])).stdout);
}

async function historyRows(db: string) {
	return withDb(db, async (sql) => {
		const [{ count }] = await sql`select count(*)::int as count from drizzle.__drizzle_migrations`;
		return count as number;
	});
}

async function rowCounts(db: string) {
	return withDb(db, async (sql) => {
		const tables = await sql<{ name: string }[]>`
			select table_name as name from information_schema.tables
			where table_schema = 'public' and table_type = 'BASE TABLE'
			order by table_name`;
		const counts: Record<string, number> = {};
		for (const { name } of tables) {
			const [{ count }] = await sql`select count(*)::int as count from public.${sql(name)}`;
			counts[name] = count;
		}
		return counts;
	});
}

async function prismaMigrationSql(ref: string) {
	const ls = await exec(['git', 'ls-tree', '-r', '--name-only', ref, 'backend/prisma/migrations']);
	if (ls.code !== 0) throw new Error(`git ls-tree ${ref} failed:\n${ls.stderr}`);
	const files = ls.stdout
		.split('\n')
		.filter((f) => f.endsWith('/migration.sql'))
		.sort();
	if (files.length === 0) throw new Error(`No Prisma migrations at ${ref}`);
	return Promise.all(files.map(async (f) => (await exec(['git', 'show', `${ref}:${f}`])).stdout));
}

try {
	console.log(`Scratch databases: ${Object.values(dbs).join(', ')}\n`);

	// 1. Empty database.
	await createDb(dbs.empty);
	console.log(`[empty] ${await migrateDb(dbs.empty)}`);
	const second = await migrateDb(dbs.empty);
	console.log(`[empty] ${second}`);
	check('empty: second run is a no-op', second.endsWith('Database is up to date.'));
	check('empty: one history row', (await historyRows(dbs.empty)) === 1);

	// 2. Prisma's migrations vs the baseline.
	await createDb(dbs.prisma);
	const prismaSql = await prismaMigrationSql(args['prisma-ref']);
	await withDb(dbs.prisma, async (sql) => {
		for (const text of prismaSql) await sql.unsafe(text);
	});
	await compareSchemas(
		`prisma: ${args['prisma-ref']} schema equals baseline`,
		dbs.prisma,
		dbs.empty
	);
	console.log(`[prisma] ${await migrateDb(dbs.prisma)}`);
	await compareSchemas('prisma: unchanged after migrate (adopted)', dbs.prisma, dbs.empty);
	check('prisma: one history row', (await historyRows(dbs.prisma)) === 1);

	// 3. Real data.
	await createDb(dbs.restore);
	await pgTool('pg_restore', dbs.restore, ['--no-owner', '--no-acl', '--exit-on-error'], args.dump);
	const before = await rowCounts(dbs.restore);
	console.log(`[restore] ${await migrateDb(dbs.restore)}`);
	const afterFirst = await rowCounts(dbs.restore);
	const secondRestore = await migrateDb(dbs.restore);
	console.log(`[restore] ${secondRestore}`);
	const afterSecond = await rowCounts(dbs.restore);

	const tables = [...new Set([...Object.keys(before), ...Object.keys(afterSecond)])].sort();
	const width = Math.max(...tables.map((t) => t.length));
	console.log(`\n${'table'.padEnd(width)}  before  run 1  run 2`);
	for (const t of tables) {
		const cells = [before[t], afterFirst[t], afterSecond[t]].map((n) => String(n ?? '-'));
		console.log(
			`${t.padEnd(width)}  ${cells[0].padStart(6)}  ${cells[1].padStart(5)}  ${cells[2].padStart(5)}`
		);
	}
	console.log();

	const same = (a: Record<string, number>, b: Record<string, number>) =>
		JSON.stringify(a) === JSON.stringify(b);
	check('restore: row counts unchanged by first run', same(before, afterFirst));
	check('restore: row counts unchanged by second run', same(afterFirst, afterSecond));
	check('restore: second run is a no-op', secondRestore.endsWith('Database is up to date.'));
	check('restore: one history row', (await historyRows(dbs.restore)) === 1);
	check('restore: _prisma_migrations kept', '_prisma_migrations' in afterSecond);

	// 4. Production drift.
	await compareSchemas('restore: schema equals baseline (no drift)', dbs.restore, dbs.empty);
} finally {
	if (args.keep) {
		console.log(`\nKept: ${Object.values(dbs).join(', ')}`);
	} else {
		for (const db of Object.values(dbs)) {
			assertScratch(db);
			await admin.unsafe(`drop database if exists "${db}" with (force)`);
		}
	}
	await admin.end();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length > 0) process.exit(1);
