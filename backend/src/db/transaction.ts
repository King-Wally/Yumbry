import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from './prisma.js';

export type Queryable = Prisma.TransactionClient;

export async function withTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return prisma.$transaction((tx) => fn(tx));
}
