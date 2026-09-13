import { promises as dns } from 'node:dns';
import { Agent } from 'undici';
import ipaddr from 'ipaddr.js';
import { CookieJar } from 'tough-cookie';
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
  /** `Accept-Language` header value to send, e.g. from the requesting user's app
   * locale. Falls back to DEFAULT_ACCEPT_LANGUAGE when omitted. */
  acceptLanguage?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_REDIRECTS = 10;
const DEFAULT_ACCEPT_LANGUAGE = 'en-US,en;q=0.9';

// Some sites front their pages with bot-mitigation (e.g. Colruyt runs Dynatrace)
// that serves a JS-challenge page with no recipe markup to requests that don't
// look like an ordinary browser. A realistic User-Agent is enough to pass.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

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

/** Records every `Set-Cookie` on `response` into `jar` against `url`, skipping any that
 * fail to parse rather than letting one bad cookie abort the whole fetch. */
async function storeCookies(jar: CookieJar, response: Response, url: URL): Promise<void> {
  const setCookieHeaders =
    typeof (response.headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (response.headers as unknown as { getSetCookie(): string[] }).getSetCookie()
      : [];

  await Promise.all(
    setCookieHeaders.map((cookie) =>
      jar.setCookie(cookie, url.toString()).catch(() => {
        // Malformed or rejected cookie (e.g. domain mismatch) — ignore and keep going.
      })
    )
  );
}

// Cloudflare (and similar CDN-level bot management) intercepts the request before it ever
// reaches the origin site and returns an interstitial "checking your browser" page — a JS
// challenge (and sometimes a Turnstile CAPTCHA) that a plain server-side fetch can never pass,
// since it doesn't execute JavaScript. That page is ordinary text/html with a 403 (or 503)
// status and none of the target site's own markup, so it looks to the rest of the pipeline like
// a page that simply has no JSON-LD. Recognize it up front and fail with an honest message
// instead of the misleading "no structured data found" one.
const BOT_CHALLENGE_STATUSES = new Set([403, 503]);
const BOT_CHALLENGE_MARKERS = [/just a moment/i, /challenges\.cloudflare\.com/i, /cf-chl/i];

function looksLikeBotChallenge(status: number, html: string): boolean {
  if (!BOT_CHALLENGE_STATUSES.has(status)) return false;
  return BOT_CHALLENGE_MARKERS.some((marker) => marker.test(html));
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
  const acceptLanguage = options?.acceptLanguage ?? DEFAULT_ACCEPT_LANGUAGE;

  let currentUrl = parseAllowedUrl(rawUrl);
  let addresses = await assertSafeTarget(currentUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const agents: Agent[] = [];
  const cookieJar = new CookieJar();

  try {
    for (let redirectCount = 0; ; redirectCount++) {
      const agent = createPinnedAgent(addresses);
      agents.push(agent);

      const cookieHeader = await cookieJar.getCookieString(currentUrl.toString());

      let response: Response;
      try {
        response = await fetch(currentUrl, {
          redirect: 'manual',
          signal: controller.signal,
          dispatcher: agent as unknown as NonNullable<RequestInit['dispatcher']>,
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'accept-language': acceptLanguage,
            'user-agent': BROWSER_USER_AGENT,
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
          },
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

      await storeCookies(cookieJar, response, currentUrl);

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

      if (looksLikeBotChallenge(response.status, html)) {
        throw new UrlImportError(
          "That site's bot protection blocked automatic import. Try pasting the recipe's JSON-LD manually instead.",
          'bot_challenge'
        );
      }

      return { html, contentType, finalUrl: currentUrl.toString() };
    }
  } finally {
    clearTimeout(timeout);
    await Promise.all(agents.map((agent) => agent.close()));
  }
}
