import { prisma } from '../db/prisma.js';

export interface PublicUser {
  id: string;
  email: string;
  locale: string;
  unitSystem: string;
  smallVolumes: string;
  jsonImportExportEnabled: boolean;
}

// Generalised rather than given a sibling per column: Prisma ignores `undefined` keys, so a
// partial update needs no branching, and the next preference to be added needs no third function.
export async function updateUserProfile(
  userId: string,
  data: {
    locale?: string;
    unitSystem?: string;
    smallVolumes?: string;
    jsonImportExportEnabled?: boolean;
  }
): Promise<PublicUser> {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      locale: true,
      unitSystem: true,
      smallVolumes: true,
      jsonImportExportEnabled: true,
    },
  });
  return user;
}
