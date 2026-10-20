// better-auth's tables, written by hand — do not regenerate with `@better-auth/cli generate`, which
// emits singular camelCase tables. The JS keys are better-auth's field names; the SQL names are
// the database's plural tables and snake_case columns.
import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { families } from './schema';

const createdAt = () =>
	timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`);

const updatedAt = () =>
	timestamp('updated_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`)
		.$onUpdate(() => new Date());

export const users = pgTable(
	'users',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull().unique(),
		emailVerified: boolean('email_verified').notNull().default(false),
		image: text('image'),
		locale: text('locale').notNull().default('en'),
		unitSystem: text('unit_system').notNull().default('metric'),
		smallVolumes: text('small_volumes').notNull().default('spoons'),
		jsonImportExportEnabled: boolean('json_import_export_enabled').notNull().default(false),
		// Restrict, not Cascade: deleting a family must never delete its members.
		familyId: integer('family_id')
			.notNull()
			.references(() => families.id, { onDelete: 'restrict' }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [index().on(t.familyId)]
);

export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		token: text('token').notNull().unique(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [index().on(t.userId)]
);

export const accounts = pgTable(
	'accounts',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
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
	(t) => [index().on(t.userId)]
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
	(t) => [index().on(t.identifier)]
);
