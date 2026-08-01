import { Ollama } from 'ollama';

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type OllamaErrorKind = 'unreachable' | 'bad_status' | 'malformed_response';

export class OllamaError extends Error {
  readonly kind: OllamaErrorKind;

  constructor(message: string, kind: OllamaErrorKind, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'OllamaError';
    this.kind = kind;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

interface OllamaResponseErrorLike extends Error {
  status_code: number;
}

/** ollama-js throws a `ResponseError` for non-2xx responses, but that class
 * isn't exported from its public API — detect it structurally instead of
 * `instanceof`. */
function isOllamaResponseError(err: unknown): err is OllamaResponseErrorLike {
  return (
    err instanceof Error &&
    err.name === 'ResponseError' &&
    typeof (err as { status_code?: unknown }).status_code === 'number'
  );
}

function toOllamaError(err: unknown, baseUrl: string): OllamaError {
  if (isOllamaResponseError(err)) {
    return new OllamaError(
      `Ollama responded with HTTP ${err.status_code}. ${err.message}`,
      'bad_status',
      err
    );
  }
  if (err instanceof SyntaxError) {
    return new OllamaError(
      'Ollama returned a response that was not valid JSON.',
      'malformed_response',
      err
    );
  }
  return new OllamaError(
    `Could not reach Ollama at ${baseUrl}. Check the address on the Settings page.`,
    'unreachable',
    err
  );
}

/** Calls Ollama's non-streaming chat endpoint and returns the assistant's
 * reply text. Throws OllamaError with a `kind` the caller can map to an HTTP
 * status; never throws a bare ollama-js/fetch error. */
export async function chatWithOllama(
  messages: OllamaChatMessage[],
  options: { baseUrl: string; model: string; format?: 'json' }
): Promise<string> {
  const client = new Ollama({
    host: normalizeBaseUrl(options.baseUrl),
  });

  let response;
  try {
    response = await client.chat({
      model: options.model,
      messages,
      stream: false,
      ...(options.format ? { format: options.format } : {}),
    });
  } catch (err) {
    throw toOllamaError(err, options.baseUrl);
  }

  const content = response?.message?.content;
  if (typeof content !== 'string') {
    throw new OllamaError(
      'Ollama response did not include an assistant message.',
      'malformed_response'
    );
  }
  return content;
}

/** Lists locally-pulled models via ollama-js's `list()`, for the Settings page dropdown. */
export async function listOllamaModels(baseUrl: string): Promise<{ name: string }[]> {
  const client = new Ollama({ host: normalizeBaseUrl(baseUrl) });

  let response;
  try {
    response = await client.list();
  } catch (err) {
    throw toOllamaError(err, baseUrl);
  }

  if (!Array.isArray(response?.models)) {
    throw new OllamaError(
      'Ollama returned an unexpected /api/tags response.',
      'malformed_response'
    );
  }

  return response.models.filter((m) => typeof m?.name === 'string').map((m) => ({ name: m.name }));
}
