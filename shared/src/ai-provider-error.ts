export type AiProviderErrorKind =
  'unreachable' | 'bad_status' | 'malformed_response' | 'not_configured';

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
  'The AI assistant is not configured on this server. Ask your administrator to set GEMINI_API_KEY.';
