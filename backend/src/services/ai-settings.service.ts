import { prisma } from '../db/prisma.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import type { AiProvider } from './ai-provider.service.js';

export interface AiSettingsRow {
  id: number;
  user_id: number;
  provider: AiProvider | null;
  base_url: string | null;
  model: string | null;
  has_api_key: boolean;
  updated_at: Date;
}

interface AiSettingsRecord {
  id: number;
  userId: number;
  provider: string | null;
  baseUrl: string | null;
  model: string | null;
  apiKeyEncrypted: string | null;
  updatedAt: Date;
}

function toAiSettingsRow(settings: AiSettingsRecord): AiSettingsRow {
  return {
    id: settings.id,
    user_id: settings.userId,
    provider: settings.provider as AiProvider | null,
    base_url: settings.baseUrl,
    model: settings.model,
    has_api_key: settings.apiKeyEncrypted !== null,
    updated_at: settings.updatedAt,
  };
}

export async function getAiSettings(userId: number): Promise<AiSettingsRow> {
  const settings = await prisma.aiSettings.findUniqueOrThrow({ where: { userId } });
  return toAiSettingsRow(settings);
}

export async function updateAiSettings(
  userId: number,
  input: {
    provider: AiProvider;
    base_url: string | null;
    model: string | null;
    api_key?: string | null;
  }
): Promise<AiSettingsRow> {
  const settings = await prisma.aiSettings.update({
    where: { userId },
    data: {
      provider: input.provider,
      baseUrl: input.base_url,
      model: input.model,
      ...(input.api_key === undefined
        ? {}
        : { apiKeyEncrypted: input.api_key === null ? null : encrypt(input.api_key) }),
    },
  });
  return toAiSettingsRow(settings);
}

/** Fetches settings with the API key decrypted, for making an actual provider
 * call — never used to build the GET /api/ai/settings response. */
export async function getAiSettingsForCall(userId: number): Promise<{
  provider: AiProvider | null;
  base_url: string | null;
  model: string | null;
  api_key: string | null;
}> {
  const settings = await prisma.aiSettings.findUniqueOrThrow({ where: { userId } });
  return {
    provider: settings.provider as AiProvider | null,
    base_url: settings.baseUrl,
    model: settings.model,
    api_key: settings.apiKeyEncrypted !== null ? decrypt(settings.apiKeyEncrypted) : null,
  };
}
