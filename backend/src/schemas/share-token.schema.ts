import { z } from 'zod';

/** Matches generateShareToken's output: 32 random bytes, hex-encoded. Checked
 * before any lookup so junk never reaches the database. */
export const ShareTokenParamSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
});
