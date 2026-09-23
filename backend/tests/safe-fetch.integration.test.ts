import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { safeFetchHtml } from '../src/utils/safe-fetch.js';
import { UrlImportError } from '../src/utils/url-import-error.js';

// Unlike safe-fetch.test.ts (which mocks 'undici' and 'node:dns' entirely to test
// safeFetchHtml's logic in isolation), this file mocks neither: it points the real
// safeFetchHtml at a real local HTTP server, exercising the real dns.lookup, the real
// undici fetch, and the real pinned Agent/dispatcher. This is the path that broke in
// commit 55c5803 ("fix: update safeFetch to use undici's fetch") — the pinned Agent's
// dispatcher wasn't actually honored by the global fetch, and no test caught it because
// every existing test replaced 'undici' with a mock.
//
// safe-fetch.ts's own SSRF guard (assertSafeTarget) rejects loopback addresses like
// 127.0.0.1 by design, which would otherwise block this local server outright. Rather
// than add a bypass to production code, only the 'ipaddr' range check is stubbed for
// this one test address — dns.lookup, undici's fetch, and the Agent dispatcher are all
// untouched, so this file proves nothing about the SSRF guard, only about the real fetch
// wiring. safe-fetch.ts itself is unmodified, so real callers still get the real check.
vi.mock('ipaddr.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ipaddr.js')>();
  const actualDefault = (actual as unknown as { default: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: {
      ...actualDefault,
      process: (addr: string) => {
        if (addr === '127.0.0.1') {
          return { range: () => 'unicast' } as ReturnType<typeof actualDefault.process>;
        }
        return actualDefault.process(addr);
      },
    },
  };
});

describe('safeFetchHtml (real network, real undici)', () => {
  let server: http.Server;
  let baseUrl: string;
  let handler: http.RequestListener;

  beforeAll(async () => {
    server = http.createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  it('fetches a real HTML page over a real socket', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body>hello</body></html>');
    };

    const result = await safeFetchHtml(`${baseUrl}/recipe`);

    expect(result.html).toBe('<html><body>hello</body></html>');
    expect(result.contentType).toBe('text/html; charset=utf-8');
    expect(result.finalUrl).toBe(`${baseUrl}/recipe`);
  });

  it('sends the expected real request headers', async () => {
    let receivedHeaders: http.IncomingHttpHeaders = {};
    handler = (req, res) => {
      receivedHeaders = req.headers;
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html></html>');
    };

    await safeFetchHtml(`${baseUrl}/recipe`, { acceptLanguage: 'nl-BE,nl;q=0.9' });

    expect(receivedHeaders['accept']).toContain('text/html');
    expect(receivedHeaders['accept-language']).toBe('nl-BE,nl;q=0.9');
    expect(receivedHeaders['user-agent']).toMatch(/Mozilla/);
  });

  it('follows a real redirect to a second request', async () => {
    handler = (req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { location: '/final' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>final</html>');
    };

    const result = await safeFetchHtml(`${baseUrl}/start`);

    expect(result.html).toBe('<html>final</html>');
    expect(result.finalUrl).toBe(`${baseUrl}/final`);
  });

  it('round-trips a cookie across a real redirect', async () => {
    let cookieHeaderOnFinalRequest: string | undefined;
    handler = (req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { location: '/final', 'set-cookie': 'sessionId=abc123; Path=/' });
        res.end();
        return;
      }
      cookieHeaderOnFinalRequest = req.headers.cookie;
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html></html>');
    };

    await safeFetchHtml(`${baseUrl}/start`);

    expect(cookieHeaderOnFinalRequest).toBe('sessionId=abc123');
  });

  it('rejects a real non-HTML content-type', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    };

    await expect(safeFetchHtml(`${baseUrl}/recipe`)).rejects.toMatchObject({
      kind: 'unsupported_content_type',
    } satisfies Partial<UrlImportError>);
  });

  it('rejects a real response body over maxBytes', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('x'.repeat(1000));
    };

    await expect(safeFetchHtml(`${baseUrl}/recipe`, { maxBytes: 10 })).rejects.toMatchObject({
      kind: 'too_large',
    } satisfies Partial<UrlImportError>);
  });

  it('times out via the real AbortController wiring', async () => {
    handler = () => {
      // Never respond; the client should abort on its own timeout.
    };

    await expect(safeFetchHtml(`${baseUrl}/recipe`, { timeoutMs: 50 })).rejects.toMatchObject({
      kind: 'timeout',
    } satisfies Partial<UrlImportError>);
  });
});
