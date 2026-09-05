import type { Queryable } from '../db/transaction.js';
import { prisma } from '../db/prisma.js';
import type { CategoryRef, TagRef } from './recipe.types.js';

/** Prunes tags/categories the family no longer references anywhere. Under
 * family scoping this spans every member's recipes, so one member's edit can
 * retire a name another member introduced — correct for a shared collection. */
export async function deleteOrphaned(
  client: Queryable,
  table: 'tags' | 'categories',
  referencedIds: number[],
  familyId: number
): Promise<void> {
  const where = { familyId, id: { notIn: referencedIds } };
  if (table === 'tags') {
    await client.tag.deleteMany({ where });
  } else {
    await client.category.deleteMany({ where });
  }
}

export async function upsertTags(
  client: Queryable,
  recipeId: number,
  tagNames: string[],
  familyId: number
): Promise<void> {
  const normalized = [...new Set(tagNames.map((name) => name.trim().toLowerCase()))].filter(
    Boolean
  );
  if (normalized.length === 0) return;

  await client.tag.createMany({
    data: normalized.map((name) => ({ familyId, name })),
    skipDuplicates: true,
  });

  const tags = await client.tag.findMany({
    where: { familyId, name: { in: normalized } },
    select: { id: true },
  });

  await client.recipeTag.createMany({
    data: tags.map((tag) => ({ recipeId, tagId: tag.id })),
    skipDuplicates: true,
  });
}

export async function upsertCategory(
  client: Queryable,
  name: string | null | undefined,
  familyId: number
): Promise<number | null> {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  const category = await client.category.upsert({
    where: { familyId_name: { familyId, name: normalized } },
    create: { familyId, name: normalized },
    update: { name: normalized },
    select: { id: true },
  });
  return category.id;
}

export async function listTags(familyId: number): Promise<TagRef[]> {
  return prisma.tag.findMany({ where: { familyId }, orderBy: { name: 'asc' } });
}

export async function listCategories(familyId: number): Promise<CategoryRef[]> {
  return prisma.category.findMany({ where: { familyId }, orderBy: { name: 'asc' } });
}
