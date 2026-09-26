import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetch, type Response as UndiciResponse } from 'undici';
import { safeFetchHtml } from '../src/utils/safe-fetch.js';

const {
  lookup,
  pinnedAgents,
  fetch: fetchMock,
} = vi.hoisted(() => ({
  lookup: vi.fn(),
  fetch: vi.fn(),
  pinnedAgents: [] as {
    connect: { lookup: (...args: unknown[]) => void };
    close: ReturnType<typeof vi.fn>;
  }[],
}));

vi.mock('node:dns', () => ({
  promises: { lookup },
}));

vi.mock('undici', () => ({
  fetch: fetchMock,
  Agent: class MockAgent {
    connect: { lookup: (...args: unknown[]) => void };
    close = vi.fn(async () => {});
    constructor(options: { connect: { lookup: (...args: unknown[]) => void } }) {
      this.connect = options.connect;
      pinnedAgents.push(this);
    }
  },
}));

interface MockResponseOptions {
  status?: number;
  headers?: Record<string, string>;
  /** `Set-Cookie` values for this response, one entry per cookie (mirrors how a real
   * response can carry several `Set-Cookie` headers at once). */
  setCookies?: string[];
  body?: string;
}

/** A minimal stand-in for the global fetch Response shape safe-fetch.ts
 * actually reads: status, headers.get(), headers.getSetCookie(), and a streamable body. */
function mockResponse({
  status = 200,
  headers = {},
  setCookies = [],
  body = '<html></html>',
}: MockResponseOptions = {}) {
  const headerMap = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  const bytes = new TextEncoder().encode(body);

  return {
    status,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
      getSetCookie: () => setCookies,
    },
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
  } as unknown as UndiciResponse;
}

describe('safeFetchHtml', () => {
  beforeEach(() => {
    lookup.mockReset();
    fetchMock.mockReset();
    pinnedAgents.length = 0;
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

  it('carries cookies set on earlier hops forward across a multi-hop redirect chain', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockResponse({
          status: 302,
          headers: { location: 'http://example.com/step2' },
          setCookies: ['first=one; Path=/'],
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          status: 302,
          headers: { location: 'http://example.com/final' },
          setCookies: ['second=two; Path=/'],
        })
      )
      .mockResolvedValueOnce(
        mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>final</html>' })
      );

    await safeFetchHtml('http://example.com/start');

    expect(fetch).toHaveBeenCalledTimes(3);
    // Hop 1 (the very first request) has no cookies yet.
    expect((vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>).cookie).toBe(
      undefined
    );
    // Hop 2 must carry the cookie set by hop 1's response.
    expect((vi.mocked(fetch).mock.calls[1][1]?.headers as Record<string, string>).cookie).toBe(
      'first=one'
    );
    // Hop 3 must carry cookies accumulated from both prior hops.
    const finalCookieHeader = (vi.mocked(fetch).mock.calls[2][1]?.headers as Record<string, string>)
      .cookie;
    expect(finalCookieHeader).toContain('first=one');
    expect(finalCookieHeader).toContain('second=two');
  });

  it('does not forward a cookie to a redirect target outside its domain scope', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockResponse({
          status: 302,
          headers: { location: 'http://other.example/final' },
          setCookies: ['scoped=value; Domain=example.com; Path=/'],
        })
      )
      .mockResolvedValueOnce(
        mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>final</html>' })
      );

    await safeFetchHtml('http://example.com/start');

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      (vi.mocked(fetch).mock.calls[1][1]?.headers as Record<string, string>).cookie
    ).toBeUndefined();
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

  it('rejects a Cloudflare bot-challenge interstitial served instead of the real page', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        status: 403,
        headers: { 'content-type': 'text/html' },
        body: '<html><head><title>Just a moment...</title></head><body>Checking your browser...</body></html>',
      })
    );

    await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
      kind: 'bot_challenge',
    });
  });

  it('rejects a Cloudflare WAF block page served instead of the real page', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        status: 403,
        headers: { 'content-type': 'text/html' },
        body: '<html><head><title>Attention Required! | Cloudflare</title></head><body><div id="cf-error-details">Sorry, you have been blocked</div></body></html>',
      })
    );

    await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
      kind: 'bot_challenge',
    });
  });

  it('does not misclassify an ordinary 403 page as a bot challenge', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        status: 403,
        headers: { 'content-type': 'text/html' },
        body: '<html><body>403 Forbidden</body></html>',
      })
    );

    const result = await safeFetchHtml('http://example.com');
    expect(result.html).toContain('403 Forbidden');
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

  it('pins the fetch connection to the DNS-validated address, immune to a rebound lookup', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>hi</html>' })
    );

    await safeFetchHtml('http://example.com');

    expect(pinnedAgents).toHaveLength(1);
    const lookupCallCountAfterValidation = lookup.mock.calls.length;

    const callback = vi.fn();
    pinnedAgents[0].connect.lookup('attacker-controlled-hostname', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(lookup.mock.calls.length).toBe(lookupCallCountAfterValidation);
  });

  it("closes every hop's pinned agent once the fetch completes", async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockResponse({ status: 302, headers: { location: 'http://example.com/final' } })
      )
      .mockResolvedValueOnce(
        mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>final</html>' })
      );

    await safeFetchHtml('http://example.com/start');

    expect(pinnedAgents).toHaveLength(2);
    for (const agent of pinnedAgents) {
      expect(agent.close).toHaveBeenCalledTimes(1);
    }
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

  describe('E2E_SAFE_FETCH_ALLOW', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('still blocks loopback when unset', async () => {
      lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      await expect(safeFetchHtml('http://127.0.0.1:4100/page')).rejects.toMatchObject({
        kind: 'blocked_url',
      });
    });

    it('lets an exact host:port entry through the private-address check', async () => {
      vi.stubEnv('E2E_SAFE_FETCH_ALLOW', '127.0.0.1:4100');
      lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      vi.mocked(fetch).mockResolvedValue(
        mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>ok</html>' })
      );

      const result = await safeFetchHtml('http://127.0.0.1:4100/page');
      expect(result.html).toBe('<html>ok</html>');
    });

    it('does not match a different port or host', async () => {
      vi.stubEnv('E2E_SAFE_FETCH_ALLOW', '127.0.0.1:4100');
      lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      await expect(safeFetchHtml('http://127.0.0.1:4101/page')).rejects.toMatchObject({
        kind: 'blocked_url',
      });
      await expect(safeFetchHtml('http://localhost:4100/page')).rejects.toMatchObject({
        kind: 'blocked_url',
      });
    });

    it('matches the default port when the entry names it explicitly', async () => {
      vi.stubEnv('E2E_SAFE_FETCH_ALLOW', 'fixtures.test:80');
      lookup.mockResolvedValue([{ address: '10.0.0.2', family: 4 }]);
      vi.mocked(fetch).mockResolvedValue(
        mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>ok</html>' })
      );
      await expect(safeFetchHtml('http://fixtures.test/page')).resolves.toBeDefined();
    });
  });
});
