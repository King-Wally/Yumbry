export type AiProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'custom';

export type AiProviderErrorKind = 'unreachable' | 'bad_status' | 'malformed_response';

export class AiProviderError extends Error {
  readonly kind: AiProviderErrorKind;

  constructor(message: string, kind: AiProviderErrorKind, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'AiProviderError';
    this.kind = kind;
  }
}

export const DEFAULT_BASE_URLS: Record<Exclude<AiProvider, 'custom'>, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  ollama: 'http://localhost:11434/v1',
};

export function unreachableMessage(): string {
  return 'Could not reach the AI provider. Check the address and connection on the Settings page.';
}

export function badStatusMessage(status: number | string, detail: string): string {
  return `The AI provider responded with HTTP ${status}. ${detail}`.trim();
}

export const malformedResponseMessage =
  'The AI provider response did not include an assistant message.';

export const malformedModelListMessage =
  'The AI provider returned an unexpected model list response.';
