// The app's tables. Change them here, then generate a migration with `bun run db:generate`.
import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	unique
} from 'drizzle-orm/pg-core';
import { accounts, sessions, users } from './auth.schema';

export * from './auth.schema';

const createdAt = () =>
	timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`);

// A household. Recipes, tags and categories are scoped to a family, not to a single user. Every
// user gets a personal family of one at registration, so users.family_id is never null.
export const families = pgTable('families', {
	id: serial('id').primaryKey(),
	// Stored raw rather than hashed: the settings page re-displays the same invite link.
	inviteToken: text('invite_token').notNull().unique(),
	createdAt: createdAt()
});

export const recipes = pgTable(
	'recipes',
	{
		id: serial('id').primaryKey(),
		title: text('title').notNull(),
		description: text('description'),
		// The family's own remarks (tips, substitutions). Never on a public share link.
		notes: text('notes'),
		imagePath: text('image_path'),
		prepTimeMinutes: integer('prep_time_minutes'),
		cookTimeMinutes: integer('cook_time_minutes'),
		totalTimeMinutes: integer('total_time_minutes'),
		servings: numeric('servings')
			.notNull()
			.default(sql`1`),
		categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
		familyId: integer('family_id')
			.notNull()
			.references(() => families.id, { onDelete: 'cascade' }),
		// Provenance only — access is decided by familyId, and the recipe outlives its author.
		authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
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
		shareToken: text('share_token').unique()
	},
	(t) => [index().on(t.authorId), index().on(t.categoryId), index().on(t.familyId)]
);

export const ingredients = pgTable(
	'ingredients',
	{
		id: serial('id').primaryKey(),
		recipeId: integer('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		rawText: text('raw_text').notNull(),
		amount: numeric('amount'),
		unit: text('unit'),
		name: text('name').notNull(),
		isScalable: boolean('is_scalable').notNull().default(true),
		sortOrder: integer('sort_order').notNull()
	},
	(t) => [index().on(t.recipeId)]
);

export const instructions = pgTable(
	'instructions',
	{
		id: serial('id').primaryKey(),
		recipeId: integer('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		stepNumber: integer('step_number').notNull(),
		text: text('text').notNull()
	},
	(t) => [index().on(t.recipeId)]
);

export const tags = pgTable(
	'tags',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		familyId: integer('family_id')
			.notNull()
			.references(() => families.id, { onDelete: 'cascade' })
	},
	(t) => [unique().on(t.familyId, t.name), index().on(t.familyId)]
);

export const recipeTags = pgTable(
	'recipe_tags',
	{
		recipeId: integer('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.recipeId, t.tagId] }), index().on(t.tagId)]
);

export const categories = pgTable(
	'categories',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		familyId: integer('family_id')
			.notNull()
			.references(() => families.id, { onDelete: 'cascade' })
	},
	(t) => [unique().on(t.familyId, t.name), index().on(t.familyId)]
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
		index().on(t.createdAt),
		index().on(t.errorKind),
		index().on(t.hostname),
		index().on(t.success)
	]
);

// The AI spend ledger. userId is SetNull, not Cascade: deleting an account must not refund what
// it already spent from the month's shared pool.
export const aiUsage = pgTable(
	'ai_usage',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		backend: text('backend').notNull(),
		tier: text('tier').notNull(),
		model: text('model').notNull(),
		promptTokens: integer('prompt_tokens'),
		completionTokens: integer('completion_tokens'),
		costUsd: numeric('cost_usd', { precision: 12, scale: 8 })
			.notNull()
			.default(sql`0`),
		requestCount: integer('request_count').notNull().default(1),
		createdAt: createdAt()
	},
	(t) => [index().on(t.backend, t.createdAt), index().on(t.userId, t.createdAt)]
);

// One past state of a recipe, written just before an update overwrites it. savedAt is the
// replaced state's updatedAt. Never pruned.
export const recipeVersions = pgTable(
	'recipe_versions',
	{
		id: serial('id').primaryKey(),
		recipeId: integer('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		savedAt: timestamp('saved_at', { withTimezone: true, mode: 'date' }).notNull(),
		snapshot: jsonb('snapshot').notNull(),
		createdAt: createdAt()
	},
	(t) => [index().on(t.recipeId, t.savedAt)]
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
