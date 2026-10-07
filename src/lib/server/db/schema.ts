// Mirrors the database the Prisma app created (see drizzle/0000_baseline.sql): every table,
// column, index and foreign-key name here matches the existing one, so the baseline never has to
// run against an existing database. Change the schema by adding a new migration, never by editing
// names here to something the database doesn't have.
import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { accounts, sessions, users } from './auth.schema';

export * from './auth.schema';

const createdAt = () =>
	timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`);

// A household. Recipes, tags and categories are scoped to a family, not to a single user. Every
// user gets a personal family of one at registration, so users.family_id is never null.
export const families = pgTable(
	'families',
	{
		id: serial('id').primaryKey(),
		// Stored raw rather than hashed: the settings page re-displays the same invite link.
		inviteToken: text('invite_token').notNull(),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('families_invite_token_key').on(t.inviteToken)]
);

export const recipes = pgTable(
	'recipes',
	{
		id: serial('id').primaryKey(),
		title: text('title').notNull(),
		description: text('description'),
		imagePath: text('image_path'),
		prepTimeMinutes: integer('prep_time_minutes'),
		cookTimeMinutes: integer('cook_time_minutes'),
		totalTimeMinutes: integer('total_time_minutes'),
		servings: numeric('servings', { precision: 65, scale: 30 }).notNull().default('1'),
		categoryId: integer('category_id'),
		familyId: integer('family_id').notNull(),
		// Provenance only — access is decided by familyId, and the recipe outlives its author.
		authorId: text('author_id'),
		createdAt: createdAt(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`)
			.$onUpdate(() => new Date()),
		// Nutrition is always per single serving (schema.org's NutritionInformation).
		calories: numeric('calories', { precision: 8, scale: 2 }),
		carbohydrateContent: numeric('carbohydrate_content', { precision: 8, scale: 2 }),
		fatContent: numeric('fat_content', { precision: 8, scale: 2 }),
		proteinContent: numeric('protein_content', { precision: 8, scale: 2 }),
		// Bearer secret for the public share link; null while the recipe isn't shared.
		shareToken: text('share_token')
	},
	(t) => [
		index('idx_recipes_author_id').on(t.authorId),
		index('idx_recipes_category_id').on(t.categoryId),
		index('idx_recipes_family_id').on(t.familyId),
		uniqueIndex('recipes_share_token_key').on(t.shareToken),
		foreignKey({
			name: 'recipes_author_id_fkey',
			columns: [t.authorId],
			foreignColumns: [users.id]
		})
			.onUpdate('cascade')
			.onDelete('set null'),
		foreignKey({
			name: 'recipes_category_id_fkey',
			columns: [t.categoryId],
			foreignColumns: [categories.id]
		})
			.onUpdate('cascade')
			.onDelete('set null'),
		foreignKey({
			name: 'recipes_family_id_fkey',
			columns: [t.familyId],
			foreignColumns: [families.id]
		})
			.onUpdate('cascade')
			.onDelete('cascade')
	]
);

export const ingredients = pgTable(
	'ingredients',
	{
		id: serial('id').primaryKey(),
		recipeId: integer('recipe_id').notNull(),
		rawText: text('raw_text').notNull(),
		amount: numeric('amount', { precision: 65, scale: 30 }),
		unit: text('unit'),
		name: text('name').notNull(),
		isScalable: boolean('is_scalable').notNull().default(true),
		sortOrder: integer('sort_order').notNull()
	},
	(t) => [
		index('idx_ingredients_recipe_id').on(t.recipeId),
		foreignKey({
			name: 'ingredients_recipe_id_fkey',
			columns: [t.recipeId],
			foreignColumns: [recipes.id]
		})
			.onUpdate('cascade')
			.onDelete('cascade')
	]
);

export const instructions = pgTable(
	'instructions',
	{
		id: serial('id').primaryKey(),
		recipeId: integer('recipe_id').notNull(),
		stepNumber: integer('step_number').notNull(),
		text: text('text').notNull()
	},
	(t) => [
		index('idx_instructions_recipe_id').on(t.recipeId),
		foreignKey({
			name: 'instructions_recipe_id_fkey',
			columns: [t.recipeId],
			foreignColumns: [recipes.id]
		})
			.onUpdate('cascade')
			.onDelete('cascade')
	]
);

export const tags = pgTable(
	'tags',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		familyId: integer('family_id').notNull()
	},
	(t) => [
		uniqueIndex('tags_family_id_name_key').on(t.familyId, t.name),
		index('idx_tags_family_id').on(t.familyId),
		foreignKey({
			name: 'tags_family_id_fkey',
			columns: [t.familyId],
			foreignColumns: [families.id]
		})
			.onUpdate('cascade')
			.onDelete('cascade')
	]
);

export const recipeTags = pgTable(
	'recipe_tags',
	{
		recipeId: integer('recipe_id').notNull(),
		tagId: integer('tag_id').notNull()
	},
	(t) => [
		primaryKey({ name: 'recipe_tags_pkey', columns: [t.recipeId, t.tagId] }),
		index('idx_recipe_tags_tag_id').on(t.tagId),
		foreignKey({
			name: 'recipe_tags_recipe_id_fkey',
			columns: [t.recipeId],
			foreignColumns: [recipes.id]
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({ name: 'recipe_tags_tag_id_fkey', columns: [t.tagId], foreignColumns: [tags.id] })
			.onUpdate('cascade')
			.onDelete('cascade')
	]
);

export const categories = pgTable(
	'categories',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		familyId: integer('family_id').notNull()
	},
	(t) => [
		uniqueIndex('categories_family_id_name_key').on(t.familyId, t.name),
		index('idx_categories_family_id').on(t.familyId),
		foreignKey({
			name: 'categories_family_id_fkey',
			columns: [t.familyId],
			foreignColumns: [families.id]
		})
			.onUpdate('cascade')
			.onDelete('cascade')
	]
);

// One row per attempted import-from-URL. Site-level analytics only — deliberately no user or
// family column. errorKind mirrors UrlImportErrorKind as a plain string; null on success.
export const recipeImportAttempts = pgTable(
	'recipe_import_attempts',
	{
		id: serial('id').primaryKey(),
		url: text('url').notNull(),
		hostname: text('hostname').notNull(),
		success: boolean('success').notNull(),
		errorKind: text('error_kind'),
		errorMessage: text('error_message'),
		createdAt: createdAt(),
		// 'server' (plain HTTP) or 'browser' (headless fallback); null before any fetch.
		method: text('method')
	},
	(t) => [
		index('idx_recipe_import_attempts_created_at').on(t.createdAt),
		index('idx_recipe_import_attempts_error_kind').on(t.errorKind),
		index('idx_recipe_import_attempts_hostname').on(t.hostname),
		index('idx_recipe_import_attempts_success').on(t.success)
	]
);

// The AI spend ledger. userId is SetNull, not Cascade: deleting an account must not refund what
// it already spent from the month's shared pool.
export const aiUsage = pgTable(
	'ai_usage',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id'),
		backend: text('backend').notNull(),
		tier: text('tier').notNull(),
		model: text('model').notNull(),
		promptTokens: integer('prompt_tokens'),
		completionTokens: integer('completion_tokens'),
		costUsd: numeric('cost_usd', { precision: 12, scale: 8 }).notNull().default('0'),
		requestCount: integer('request_count').notNull().default(1),
		createdAt: createdAt()
	},
	(t) => [
		index('idx_ai_usage_backend_created_at').on(t.backend, t.createdAt),
		index('idx_ai_usage_user_created_at').on(t.userId, t.createdAt),
		foreignKey({ name: 'ai_usage_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] })
			.onUpdate('cascade')
			.onDelete('set null')
	]
);

// One past state of a recipe, written just before an update overwrites it. savedAt is the
// replaced state's updatedAt. Never pruned.
export const recipeVersions = pgTable(
	'recipe_versions',
	{
		id: serial('id').primaryKey(),
		recipeId: integer('recipe_id').notNull(),
		savedAt: timestamp('saved_at', { withTimezone: true, mode: 'date' }).notNull(),
		snapshot: jsonb('snapshot').notNull(),
		createdAt: createdAt()
	},
	(t) => [
		index('idx_recipe_versions_recipe_id_saved_at').on(t.recipeId, t.savedAt),
		foreignKey({
			name: 'recipe_versions_recipe_id_fkey',
			columns: [t.recipeId],
			foreignColumns: [recipes.id]
		})
			.onUpdate('cascade')
			.onDelete('cascade')
	]
);

export const familiesRelations = relations(families, ({ many }) => ({
	members: many(users),
	recipes: many(recipes),
	tags: many(tags),
	categories: many(categories)
}));

export const usersRelations = relations(users, ({ one, many }) => ({
	family: one(families, { fields: [users.familyId], references: [families.id] }),
	authoredRecipes: many(recipes),
	sessions: many(sessions),
	accounts: many(accounts),
	aiUsage: many(aiUsage)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] })
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
	user: one(users, { fields: [accounts.userId], references: [users.id] })
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
	category: one(categories, { fields: [recipes.categoryId], references: [categories.id] }),
	family: one(families, { fields: [recipes.familyId], references: [families.id] }),
	author: one(users, { fields: [recipes.authorId], references: [users.id] }),
	ingredients: many(ingredients),
	instructions: many(instructions),
	recipeTags: many(recipeTags),
	versions: many(recipeVersions)
}));

export const ingredientsRelations = relations(ingredients, ({ one }) => ({
	recipe: one(recipes, { fields: [ingredients.recipeId], references: [recipes.id] })
}));

export const instructionsRelations = relations(instructions, ({ one }) => ({
	recipe: one(recipes, { fields: [instructions.recipeId], references: [recipes.id] })
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
	family: one(families, { fields: [tags.familyId], references: [families.id] }),
	recipeTags: many(recipeTags)
}));

export const recipeTagsRelations = relations(recipeTags, ({ one }) => ({
	recipe: one(recipes, { fields: [recipeTags.recipeId], references: [recipes.id] }),
	tag: one(tags, { fields: [recipeTags.tagId], references: [tags.id] })
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
	family: one(families, { fields: [categories.familyId], references: [families.id] }),
	recipes: many(recipes)
}));

export const aiUsageRelations = relations(aiUsage, ({ one }) => ({
	user: one(users, { fields: [aiUsage.userId], references: [users.id] })
}));

export const recipeVersionsRelations = relations(recipeVersions, ({ one }) => ({
	recipe: one(recipes, { fields: [recipeVersions.recipeId], references: [recipes.id] })
}));
