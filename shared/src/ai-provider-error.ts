import type { AiQuotaScope } from './ai-budget.js';

export type AiProviderErrorKind =
  'unreachable' | 'bad_status' | 'malformed_response' | 'not_configured' | 'quota_exceeded';

export class AiProviderError extends Error {
  readonly kind: AiProviderErrorKind;

  constructor(message: string, kind: AiProviderErrorKind, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'AiProviderError';
    this.kind = kind;
  }
}

export function unreachableMessage(): string {
  return 'Could not reach the AI provider. Please try again later.';
}

export function badStatusMessage(status: number | string, detail: string): string {
  return `The AI provider responded with HTTP ${status}. ${detail}`.trim();
}

export const malformedResponseMessage =
  'The AI provider response did not include an assistant message.';

export const notConfiguredMessage =
  'The AI assistant is not configured on this server. Ask your administrator to set OPENROUTER_API_KEY.';

export function quotaExceededMessage(scope: AiQuotaScope): string {
  return scope === 'user'
    ? "You've reached your daily AI limit. It resets at midnight (UTC)."
    : 'The AI budget for today is used up. Please try again later.';
}
