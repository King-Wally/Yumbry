import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeFetchHtml } from '../src/utils/safe-fetch.js';

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock('node:dns', () => ({
  promises: { lookup },
}));

interface MockResponseOptions {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
}

/** A minimal stand-in for the global fetch Response shape safe-fetch.ts
 * actually reads: status, headers.get(), and a streamable body. */
function mockResponse({
  status = 200,
  headers = {},
  body = '<html></html>',
}: MockResponseOptions = {}) {
  const headerMap = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  const bytes = new TextEncoder().encode(body);

  return {
    status,
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    body: {
      getReader() {
        let done = false;
        return {
          async read() {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: bytes };
          },
          async cancel() {
            done = true;
          },
        };
      },
    },
  } as unknown as Response;
}

describe('safeFetchHtml', () => {
  beforeEach(() => {
    lookup.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a non-http(s) scheme without any DNS lookup or fetch', async () => {
    await expect(safeFetchHtml('ftp://example.com')).rejects.toMatchObject({ kind: 'invalid_url' });
    expect(lookup).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an unparseable URL', async () => {
    await expect(safeFetchHtml('not a url')).rejects.toMatchObject({ kind: 'invalid_url' });
  });

  it('rejects a hostname resolving to a private IPv4 address', async () => {
    lookup.mockResolvedValue([{ address: '192.168.1.5', family: 4 }]);
    await expect(safeFetchHtml('http://internal.example.com')).rejects.toMatchObject({
      kind: 'blocked_url',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a hostname resolving to IPv4 loopback', async () => {
    lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(safeFetchHtml('http://localhost')).rejects.toMatchObject({ kind: 'blocked_url' });
  });

  it('rejects a hostname resolving to IPv6 loopback', async () => {
    lookup.mockResolvedValue([{ address: '::1', family: 6 }]);
    await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
      kind: 'blocked_url',
    });
  });

  it('rejects a hostname resolving to an IPv6 unique-local address', async () => {
    lookup.mockResolvedValue([{ address: 'fd00::1', family: 6 }]);
    await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
      kind: 'blocked_url',
    });
  });

  it('succeeds for a public address returning HTML', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>hi</html>' })
    );

    const result = await safeFetchHtml('http://example.com');
    expect(result.html).toBe('<html>hi</html>');
  });

  it('follows a redirect whose target resolves to a public address', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockResponse({ status: 302, headers: { location: 'http://example.com/final' } })
      )
      .mockResolvedValueOnce(
        mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>final</html>' })
      );

    const result = await safeFetchHtml('http://example.com/start');
    expect(result.html).toBe('<html>final</html>');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects a redirect whose target resolves to a private address (per-hop re-validation)', async () => {
    lookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ status: 302, headers: { location: 'http://internal.example.com/final' } })
    );

    await expect(safeFetchHtml('http://example.com/start')).rejects.toMatchObject({
      kind: 'blocked_url',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects after exceeding the redirect cap', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ status: 302, headers: { location: 'http://example.com/next' } })
    );

    await expect(
      safeFetchHtml('http://example.com/start', { maxRedirects: 2 })
    ).rejects.toMatchObject({
      kind: 'too_many_redirects',
    });
  });

  it('rejects a non-HTML content type', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ headers: { 'content-type': 'application/json' } })
    );

    await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
      kind: 'unsupported_content_type',
    });
  });

  it('rejects a response body larger than the configured limit', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ headers: { 'content-type': 'text/html' }, body: 'x'.repeat(20) })
    );

    await expect(safeFetchHtml('http://example.com', { maxBytes: 10 })).rejects.toMatchObject({
      kind: 'too_large',
    });
  });

  it('wraps a rejected fetch as a network error', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch).mockRejectedValue(new Error('boom'));

    await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
      kind: 'network_error',
    });
  });

  it('reports a timeout when the request is aborted', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch).mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );

    await expect(safeFetchHtml('http://example.com', { timeoutMs: 5 })).rejects.toMatchObject({
      kind: 'timeout',
    });
  });
});
