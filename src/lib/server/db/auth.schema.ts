// better-auth's tables, written by hand to match drizzle/0000_baseline.sql — do not regenerate with
// `@better-auth/cli generate`, which emits singular camelCase tables. The JS keys are better-auth's
// field names; the SQL names are the database's snake_case ones.
import { sql } from 'drizzle-orm';
import {
	boolean,
	foreignKey,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { families } from './schema';

const createdAt = () =>
	timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`);

// The column has no database default, so every writer must supply it.
const updatedAt = () =>
	timestamp('updated_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date())
		.$onUpdate(() => new Date());

export const users = pgTable(
	'users',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull(),
		emailVerified: boolean('email_verified').notNull().default(false),
		image: text('image'),
		locale: text('locale').notNull().default('en'),
		unitSystem: text('unit_system').notNull().default('metric'),
		smallVolumes: text('small_volumes').notNull().default('spoons'),
		jsonImportExportEnabled: boolean('json_import_export_enabled').notNull().default(false),
		familyId: integer('family_id').notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		uniqueIndex('users_email_key').on(t.email),
		index('idx_users_family_id').on(t.familyId),
		// Restrict, not Cascade: deleting a family must never delete its members.
		foreignKey({
			name: 'users_family_id_fkey',
			columns: [t.familyId],
			foreignColumns: [families.id]
		})
			.onUpdate('cascade')
			.onDelete('restrict')
	]
);

export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull(),
		token: text('token').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		uniqueIndex('sessions_token_key').on(t.token),
		index('idx_sessions_user_id').on(t.userId),
		foreignKey({ name: 'sessions_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] })
			.onUpdate('cascade')
			.onDelete('cascade')
	]
);

export const accounts = pgTable(
	'accounts',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', {
			withTimezone: true,
			mode: 'date'
		}),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
			withTimezone: true,
			mode: 'date'
		}),
		scope: text('scope'),
		idToken: text('id_token'),
		password: text('password'),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('idx_accounts_user_id').on(t.userId),
		foreignKey({ name: 'accounts_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] })
			.onUpdate('cascade')
			.onDelete('cascade')
	]
);

export const verifications = pgTable(
	'verifications',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [index('idx_verifications_identifier').on(t.identifier)]
);
