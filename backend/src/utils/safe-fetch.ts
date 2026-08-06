import { promises as dns } from 'node:dns';
import { Agent } from 'undici';
import ipaddr from 'ipaddr.js';
import { UrlImportError } from './url-import-error.js';

export interface SafeFetchResult {
  html: string;
  contentType: string;
  finalUrl: string;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_REDIRECTS = 3;

function parseAllowedUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UrlImportError('Enter a valid http or https URL.', 'invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlImportError('Enter a valid http or https URL.', 'invalid_url');
  }
  return url;
}

interface ResolvedAddress {
  address: string;
  family: number;
}

async function assertSafeTarget(url: URL): Promise<ResolvedAddress[]> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlImportError('Enter a valid http or https URL.', 'invalid_url');
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch (err) {
    throw new UrlImportError(
      'Could not reach that URL. Check the address and try again.',
      'network_error',
      err
    );
  }

  for (const { address } of addresses) {
    const range = ipaddr.process(address).range();
    if (range !== 'unicast') {
      throw new UrlImportError(
        "That URL points to a private or internal network address, which isn't allowed.",
        'blocked_url'
      );
    }
  }

  return addresses;
}

function createPinnedAgent(addresses: ResolvedAddress[]): Agent {
  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options?.all) {
          callback(null, addresses);
        } else {
          callback(null, addresses[0].address, addresses[0].family);
        }
      },
    },
  });
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UrlImportError('That page is too large to import.', 'too_large');
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString('utf-8');
}

export async function safeFetchHtml(
  rawUrl: string,
  options?: SafeFetchOptions
): Promise<SafeFetchResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = parseAllowedUrl(rawUrl);
  let addresses = await assertSafeTarget(currentUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const agents: Agent[] = [];

  try {
    for (let redirectCount = 0; ; redirectCount++) {
      const agent = createPinnedAgent(addresses);
      agents.push(agent);

      let response: Response;
      try {
        response = await fetch(currentUrl, {
          redirect: 'manual',
          signal: controller.signal,
          dispatcher: agent as unknown as NonNullable<RequestInit['dispatcher']>,
          headers: { accept: 'text/html,application/xhtml+xml' },
        } satisfies RequestInit);
      } catch (err) {
        if (controller.signal.aborted) {
          throw new UrlImportError(
            'The page took too long to respond. Try again or check the URL.',
            'timeout',
            err
          );
        }
        throw new UrlImportError(
          'Could not reach that URL. Check the address and try again.',
          'network_error',
          err
        );
      }

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        if (redirectCount >= maxRedirects) {
          throw new UrlImportError('That URL redirected too many times.', 'too_many_redirects');
        }
        currentUrl = new URL(location, currentUrl);
        addresses = await assertSafeTarget(currentUrl);
        continue;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        throw new UrlImportError(
          "That URL didn't return an HTML page.",
          'unsupported_content_type'
        );
      }

      const html = await readBodyWithLimit(response, maxBytes);
      return { html, contentType, finalUrl: currentUrl.toString() };
    }
  } finally {
    clearTimeout(timeout);
    await Promise.all(agents.map((agent) => agent.close()));
  }
}
