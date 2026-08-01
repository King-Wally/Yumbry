import { prisma } from '../db/prisma.js';

export interface AiSettingsRow {
  id: number;
  user_id: number;
  base_url: string;
  model: string | null;
  updated_at: Date;
}

function toAiSettingsRow(settings: {
  id: number;
  userId: number;
  baseUrl: string;
  model: string | null;
  updatedAt: Date;
}): AiSettingsRow {
  return {
    id: settings.id,
    user_id: settings.userId,
    base_url: settings.baseUrl,
    model: settings.model,
    updated_at: settings.updatedAt,
  };
}

export async function getAiSettings(userId: number): Promise<AiSettingsRow> {
  const settings = await prisma.aiSettings.findUniqueOrThrow({ where: { userId } });
  return toAiSettingsRow(settings);
}

export async function updateAiSettings(
  userId: number,
  input: { base_url: string; model: string | null }
): Promise<AiSettingsRow> {
  const settings = await prisma.aiSettings.update({
    where: { userId },
    data: { baseUrl: input.base_url, model: input.model },
  });
  return toAiSettingsRow(settings);
}
