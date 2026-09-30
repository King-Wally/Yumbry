import { promises as dns } from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
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
// look like an ordinary browser. Send the header set a real desktop Chrome sends on
// a top-level navigation; the UA and client hints derive from one version so they
// never disagree (a mismatch is itself a bot signal).
const CHROME_MAJOR = 153;

export const BROWSER_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;

const BROWSER_NAVIGATION_HEADERS: Record<string, string> = {
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'sec-ch-ua': `"Chromium";v="${CHROME_MAJOR}", "Not=A?Brand";v="24", "Google Chrome";v="${CHROME_MAJOR}"`,
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'user-agent': BROWSER_USER_AGENT,
};

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

// Exact `host:port` entries (comma-separated) exempt from the private-address check, so the E2E
// suite can import from a fixture server on loopback. Unset in production. Read lazily.
function isAllowlistedForTests(url: URL): boolean {
  const raw = process.env.E2E_SAFE_FETCH_ALLOW;
  if (!raw) return false;
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const target = `${url.hostname}:${port}`;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .some((entry) => entry === target);
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

export async function assertSafeTarget(url: URL): Promise<ResolvedAddress[]> {
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

  if (isAllowlistedForTests(url)) return addresses;

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
const BOT_CHALLENGE_STATUSES = new Set([401, 403, 429, 503]);
// A JS challenge that solves itself in a real browser and then reloads into the page:
// Cloudflare's "Just a moment…" interstitial.
const SOLVABLE_CHALLENGE_MARKERS = [/just a moment/i, /challenges\.cloudflare\.com/i, /cf-chl/i];
const BOT_CHALLENGE_MARKERS = [
  ...SOLVABLE_CHALLENGE_MARKERS,
  // Cloudflare's WAF "you have been blocked" page — a different response shape from the JS
  // interstitial above (no challenge to solve, just a hard block), served with its own
  // distinctive title and error-page markup.
  /attention required[^<]*\|\s*cloudflare/i,
  /cf-error-details/i,
  // Akamai's edge block: a bare "Access Denied" page with a "Reference #..." trace id.
  /<title>\s*access denied\s*<\/title>/i,
];

/** Marker-only check, for callers (the headless fallback) that can't rely on a status code
 * because the challenge page reloads itself in place. */
export function hasBotChallengeMarkers(html: string): boolean {
  return BOT_CHALLENGE_MARKERS.some((marker) => marker.test(html));
}

/** Whether the page is a challenge worth waiting on, as opposed to a hard block that never
 * clears no matter how long the browser sits on it. */
export function hasSolvableChallengeMarkers(html: string): boolean {
  return SOLVABLE_CHALLENGE_MARKERS.some((marker) => marker.test(html));
}

function looksLikeBotChallenge(status: number, html: string): boolean {
  return BOT_CHALLENGE_STATUSES.has(status) && hasBotChallengeMarkers(html);
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
        response = (await undiciFetch(currentUrl, {
          redirect: 'manual',
          signal: controller.signal,
          dispatcher: agent,
          headers: {
            ...BROWSER_NAVIGATION_HEADERS,
            'accept-language': acceptLanguage,
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
          },
        })) as unknown as Response;
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
          "That site's bot protection blocked automatic import.",
          'bot_challenge',
          undefined,
          { httpStatus: response.status }
        );
      }

      // Anything else that isn't a success would otherwise reach the JSON-LD check and be
      // misreported as "no structured data found".
      if (response.status < 200 || response.status >= 300) {
        throw new UrlImportError(
          `The site returned HTTP ${response.status} instead of the page.`,
          'network_error',
          undefined,
          { httpStatus: response.status }
        );
      }

      return { html, contentType, finalUrl: currentUrl.toString() };
    }
  } finally {
    clearTimeout(timeout);
    await Promise.all(agents.map((agent) => agent.close()));
  }
}
