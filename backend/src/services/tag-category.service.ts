import type { Queryable } from '../db/transaction.js';
import { prisma } from '../db/prisma.js';
import type { CategoryRef, TagRef } from './recipe.types.js';

export async function deleteOrphaned(
  client: Queryable,
  table: 'tags' | 'categories',
  referencedIds: number[],
  userId: number
): Promise<void> {
  const where = { userId, id: { notIn: referencedIds } };
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
  userId: number
): Promise<void> {
  const normalized = [...new Set(tagNames.map((name) => name.trim().toLowerCase()))].filter(
    Boolean
  );
  if (normalized.length === 0) return;

  await client.tag.createMany({
    data: normalized.map((name) => ({ userId, name })),
    skipDuplicates: true,
  });

  const tags = await client.tag.findMany({
    where: { userId, name: { in: normalized } },
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
  userId: number
): Promise<number | null> {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  const category = await client.category.upsert({
    where: { userId_name: { userId, name: normalized } },
    create: { userId, name: normalized },
    update: { name: normalized },
    select: { id: true },
  });
  return category.id;
}

export async function listTags(userId: number): Promise<TagRef[]> {
  return prisma.tag.findMany({ where: { userId }, orderBy: { name: 'asc' } });
}

export async function listCategories(userId: number): Promise<CategoryRef[]> {
  return prisma.category.findMany({ where: { userId }, orderBy: { name: 'asc' } });
}
