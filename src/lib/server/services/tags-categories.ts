import { asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { categories, tags } from '#lib/server/db/schema.ts';
import type { Category, Tag } from '#lib/shared/recipe-dto.ts';

// Every row is in use: an edit or delete that drops a name's last use deletes its row (step 13).

/** The family's tags, by name. */
export function listTags(familyId: number): Promise<Tag[]> {
	return db
		.select({ id: tags.id, name: tags.name })
		.from(tags)
		.where(eq(tags.familyId, familyId))
		.orderBy(asc(tags.name));
}

/** The family's categories, by name. */
export function listCategories(familyId: number): Promise<Category[]> {
	return db
		.select({ id: categories.id, name: categories.name })
		.from(categories)
		.where(eq(categories.familyId, familyId))
		.orderBy(asc(categories.name));
}
