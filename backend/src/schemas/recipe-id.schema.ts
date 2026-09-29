import { z } from 'zod';

/** Postgres int4 upper bound — the type of Recipe.id. Anything larger overflows
 * inside Prisma and would surface as a 500 rather than "no such recipe". */
const MAX_INT4 = 2147483647;

/** Validates a `:id` route param before it can reach Prisma or the filesystem.
 *
 * The regex, rather than z.coerce.number().int(), is deliberate: it rejects
 * before any coercion happens, so no NaN can exist downstream at all. It refuses
 * '', '0', '-1', '1.0', '1e3', ' 1', '007', 'abc' and — because Express decodes
 * path params — every traversal form such as '../../etc'. The {0,9} length cap
 * means the MAX_INT4 refine only ever sees a safe integer. */
export const RecipeIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d{0,9}$/, 'Recipe id must be a positive integer.')
    .transform(Number)
    .refine((id) => id <= MAX_INT4, 'Recipe id is out of range.'),
});

export type RecipeIdParam = z.infer<typeof RecipeIdParamSchema>;

/** Same rules as `:id`, for the `:versionId` segment of the version-history routes. */
export const RecipeVersionIdParamSchema = z.object({
  versionId: z
    .string()
    .regex(/^[1-9]\d{0,9}$/, 'Version id must be a positive integer.')
    .transform(Number)
    .refine((id) => id <= MAX_INT4, 'Version id is out of range.'),
});
