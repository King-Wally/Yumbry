import { z } from 'zod';

export const JoinFamilyBodySchema = z.object({
  token: z.string().trim().min(1),
});
