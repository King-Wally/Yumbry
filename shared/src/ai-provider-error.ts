/**
 * AI-provider error vocabulary shared between the backend's proxied
 * providers (openai/anthropic/gemini/custom via backend/src/services/
 * ai-provider.service.ts) and the frontend's direct-Ollama client
 * (frontend/src/services/ollama-direct.ts). Keeping the kind/class/message
 * wording in one place means an error looks the same in the UI regardless
 * of which path produced it.
 */

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

/** Ollama has no hosted endpoint to default to — both the backend proxy and
 * the frontend's direct client fall back to the same local address. */
export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

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
