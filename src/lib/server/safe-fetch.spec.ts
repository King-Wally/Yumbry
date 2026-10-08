import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The fetch logic in isolation: DNS is mocked and Bun's global `fetch` is spied on, so each test
// scripts what every hop resolves to and answers. safe-fetch.socket.spec.ts runs the real wiring.

const { lookup, env } = vi.hoisted(() => ({
	lookup: vi.fn(),
	env: { E2E_SAFE_FETCH_ALLOW: undefined as string | undefined }
}));

vi.mock('node:dns', () => ({ promises: { lookup } }));
vi.mock('$app/env/private', () => ({
	get E2E_SAFE_FETCH_ALLOW() {
		return env.E2E_SAFE_FETCH_ALLOW;
	}
}));

const { hasBotChallengeMarkers, hasSolvableChallengeMarkers, safeFetchHtml } =
	await import('#lib/server/safe-fetch.ts');

const PUBLIC = [{ address: '93.184.216.34', family: 4 }];

interface MockResponseOptions {
	status?: number;
	headers?: Record<string, string>;
	/** `Set-Cookie` values for this response, one entry per cookie. */
	setCookies?: string[];
	body?: string;
}

function mockResponse({
	status = 200,
	headers = {},
	setCookies = [],
	body = '<html></html>'
}: MockResponseOptions = {}): Response {
	const responseHeaders = new Headers(headers);
	for (const cookie of setCookies) responseHeaders.append('set-cookie', cookie);
	// A Response can't carry a 3xx with a body, and a redirect needs none.
	const hasBody = status < 300 || status >= 400;
	return new Response(hasBody ? body : null, { status, headers: responseHeaders });
}

const fetchMock = vi.fn<typeof fetch>();

/** What the nth fetch was called with: the URL it dialled and its init. */
function call(n: number): { url: URL; init: RequestInit & { tls?: { serverName?: string } } } {
	const [input, init] = fetchMock.mock.calls[n];
	return { url: new URL(String(input)), init: init ?? {} };
}

function sentHeaders(n: number): Record<string, string> {
	return call(n).init.headers as Record<string, string>;
}

beforeEach(() => {
	lookup.mockReset();
	fetchMock.mockReset();
	vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
	env.E2E_SAFE_FETCH_ALLOW = undefined;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('safeFetchHtml', () => {
	it('rejects a non-http(s) scheme without any DNS lookup or fetch', async () => {
		await expect(safeFetchHtml('ftp://example.com')).rejects.toMatchObject({ kind: 'invalid_url' });
		expect(lookup).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects an unparseable URL', async () => {
		await expect(safeFetchHtml('not a url')).rejects.toMatchObject({ kind: 'invalid_url' });
	});

	it('rejects a hostname resolving to a private IPv4 address', async () => {
		lookup.mockResolvedValue([{ address: '192.168.1.5', family: 4 }]);
		await expect(safeFetchHtml('http://internal.example.com')).rejects.toMatchObject({
			kind: 'blocked_url'
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects a hostname resolving to IPv4 loopback', async () => {
		lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
		await expect(safeFetchHtml('http://localhost')).rejects.toMatchObject({ kind: 'blocked_url' });
	});

	it('rejects a hostname resolving to IPv6 loopback', async () => {
		lookup.mockResolvedValue([{ address: '::1', family: 6 }]);
		await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
			kind: 'blocked_url'
		});
	});

	it('rejects a hostname resolving to an IPv6 unique-local address', async () => {
		lookup.mockResolvedValue([{ address: 'fd00::1', family: 6 }]);
		await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
			kind: 'blocked_url'
		});
	});

	it('rejects an IPv4-mapped IPv6 loopback address', async () => {
		lookup.mockResolvedValue([{ address: '::ffff:127.0.0.1', family: 6 }]);
		await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
			kind: 'blocked_url'
		});
	});

	it('rejects when any of several resolved addresses is private', async () => {
		lookup.mockResolvedValue([...PUBLIC, { address: '10.0.0.5', family: 4 }]);
		await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
			kind: 'blocked_url'
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('looks up an IPv6 literal without its brackets', async () => {
		lookup.mockResolvedValue([{ address: '::1', family: 6 }]);
		await expect(safeFetchHtml('http://[::1]:8080/')).rejects.toMatchObject({
			kind: 'blocked_url'
		});
		expect(lookup).toHaveBeenCalledWith('::1', { all: true });
	});

	it('reports a hostname that does not resolve as a network error', async () => {
		lookup.mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
		await expect(safeFetchHtml('http://nowhere.example')).rejects.toMatchObject({
			kind: 'network_error'
		});
	});

	it('succeeds for a public address returning HTML', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockResolvedValue(
			mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>hi</html>' })
		);

		const result = await safeFetchHtml('http://example.com');
		expect(result.html).toBe('<html>hi</html>');
	});

	it('dials the checked address, carrying the hostname only in Host', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockResolvedValue(mockResponse({ headers: { 'content-type': 'text/html' } }));

		await safeFetchHtml('http://example.com:8080/recipe?x=1');

		const { url, init } = call(0);
		expect(url.toString()).toBe('http://93.184.216.34:8080/recipe?x=1');
		expect(sentHeaders(0).host).toBe('example.com:8080');
		expect(init.redirect).toBe('manual');
		expect(init.tls).toBeUndefined();
		expect(lookup).toHaveBeenCalledTimes(1);
	});

	it('sends the hostname as TLS server name for https', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockResolvedValue(mockResponse({ headers: { 'content-type': 'text/html' } }));

		await safeFetchHtml('https://example.com/recipe');

		const { url, init } = call(0);
		expect(url.toString()).toBe('https://93.184.216.34/recipe');
		expect(sentHeaders(0).host).toBe('example.com');
		expect(init.tls).toEqual({ serverName: 'example.com' });
	});

	it('brackets a pinned IPv6 address', async () => {
		lookup.mockResolvedValue([{ address: '2606:2800:220:1::1', family: 6 }]);
		fetchMock.mockResolvedValue(mockResponse({ headers: { 'content-type': 'text/html' } }));

		await safeFetchHtml('http://example.com/');

		expect(call(0).url.host).toBe('[2606:2800:220:1::1]');
	});

	it('follows a redirect whose target resolves to a public address', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock
			.mockResolvedValueOnce(
				mockResponse({ status: 302, headers: { location: 'http://example.com/final' } })
			)
			.mockResolvedValueOnce(
				mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>final</html>' })
			);

		const result = await safeFetchHtml('http://example.com/start');
		expect(result.html).toBe('<html>final</html>');
		expect(result.finalUrl).toBe('http://example.com/final');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('dials each redirect hop at the address its own check resolved', async () => {
		lookup
			.mockResolvedValueOnce(PUBLIC)
			.mockResolvedValueOnce([{ address: '203.0.114.7', family: 4 }]);
		fetchMock
			.mockResolvedValueOnce(
				mockResponse({ status: 301, headers: { location: 'https://cdn.example.org/page' } })
			)
			.mockResolvedValueOnce(mockResponse({ headers: { 'content-type': 'text/html' } }));

		await safeFetchHtml('http://example.com/start');

		expect(lookup).toHaveBeenNthCalledWith(2, 'cdn.example.org', { all: true });
		expect(call(1).url.toString()).toBe('https://203.0.114.7/page');
		expect(sentHeaders(1).host).toBe('cdn.example.org');
		expect(call(1).init.tls).toEqual({ serverName: 'cdn.example.org' });
	});

	it('rejects a redirect whose target resolves to a private address (per-hop re-validation)', async () => {
		lookup
			.mockResolvedValueOnce(PUBLIC)
			.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
		fetchMock.mockResolvedValueOnce(
			mockResponse({ status: 302, headers: { location: 'http://internal.example.com/final' } })
		);

		await expect(safeFetchHtml('http://example.com/start')).rejects.toMatchObject({
			kind: 'blocked_url'
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('rejects a redirect to a non-http scheme', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockResolvedValueOnce(
			mockResponse({ status: 302, headers: { location: 'file:///etc/passwd' } })
		);

		await expect(safeFetchHtml('http://example.com/start')).rejects.toMatchObject({
			kind: 'invalid_url'
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('rejects after exceeding the redirect cap', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockImplementation(async () =>
			mockResponse({ status: 302, headers: { location: 'http://example.com/next' } })
		);

		await expect(
			safeFetchHtml('http://example.com/start', { maxRedirects: 2 })
		).rejects.toMatchObject({ kind: 'too_many_redirects' });
	});

	it('carries cookies set on earlier hops forward across a multi-hop redirect chain', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock
			.mockResolvedValueOnce(
				mockResponse({
					status: 302,
					headers: { location: 'http://example.com/step2' },
					setCookies: ['first=one; Path=/']
				})
			)
			.mockResolvedValueOnce(
				mockResponse({
					status: 302,
					headers: { location: 'http://example.com/final' },
					setCookies: ['second=two; Path=/']
				})
			)
			.mockResolvedValueOnce(
				mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>final</html>' })
			);

		await safeFetchHtml('http://example.com/start');

		expect(fetchMock).toHaveBeenCalledTimes(3);
		// Hop 1 (the very first request) has no cookies yet.
		expect(sentHeaders(0).cookie).toBeUndefined();
		// Hop 2 must carry the cookie set by hop 1's response.
		expect(sentHeaders(1).cookie).toBe('first=one');
		// Hop 3 must carry cookies accumulated from both prior hops.
		expect(sentHeaders(2).cookie).toContain('first=one');
		expect(sentHeaders(2).cookie).toContain('second=two');
	});

	it('does not forward a cookie to a redirect target outside its domain scope', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock
			.mockResolvedValueOnce(
				mockResponse({
					status: 302,
					headers: { location: 'http://other.example/final' },
					setCookies: ['scoped=value; Domain=example.com; Path=/']
				})
			)
			.mockResolvedValueOnce(
				mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>final</html>' })
			);

		await safeFetchHtml('http://example.com/start');

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(sentHeaders(1).cookie).toBeUndefined();
	});

	it('rejects a non-HTML content type', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockResolvedValue(mockResponse({ headers: { 'content-type': 'application/json' } }));

		await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
			kind: 'unsupported_content_type'
		});
	});

	it('rejects a Cloudflare bot-challenge interstitial served instead of the real page', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockResolvedValue(
			mockResponse({
				status: 403,
				headers: { 'content-type': 'text/html' },
				body: '<html><head><title>Just a moment...</title></head><body>Checking your browser...</body></html>'
			})
		);

		await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
			kind: 'bot_challenge',
			httpStatus: 403
		});
	});

	it('rejects a Cloudflare WAF block page served instead of the real page', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockResolvedValue(
			mockResponse({
				status: 403,
				headers: { 'content-type': 'text/html' },
				body: '<html><head><title>Attention Required! | Cloudflare</title></head><body><div id="cf-error-details">Sorry, you have been blocked</div></body></html>'
			})
		);

		await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
			kind: 'bot_challenge'
		});
	});

	it('rejects an Akamai "Access Denied" edge block served instead of the real page', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockResolvedValue(
			mockResponse({
				status: 403,
				headers: { 'content-type': 'text/html' },
				body: '<HTML><HEAD>\n<TITLE>Access Denied</TITLE>\n</HEAD><BODY>\n<H1>Access Denied</H1>\n<P>Reference #0.34c61102.1790774174.38500214</P>\n</BODY></HTML>'
			})
		);

		await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
			kind: 'bot_challenge'
		});
	});

	it('does not misclassify an ordinary 403 page as a bot challenge', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockResolvedValue(
			mockResponse({
				status: 403,
				headers: { 'content-type': 'text/html' },
				body: '<html><body>403 Forbidden</body></html>'
			})
		);

		await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
			kind: 'network_error',
			httpStatus: 403,
			message: expect.stringContaining('403')
		});
	});

	it('sends a consistent desktop-Chrome navigation header set', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockResolvedValue(
			mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>hi</html>' })
		);

		await safeFetchHtml('http://example.com', { acceptLanguage: 'nl,en;q=0.8' });

		const headers = sentHeaders(0);
		expect(headers).toMatchObject({
			'accept-language': 'nl,en;q=0.8',
			'sec-fetch-mode': 'navigate',
			'sec-fetch-dest': 'document',
			'upgrade-insecure-requests': '1'
		});
		const uaMajor = /Chrome\/(\d+)\./.exec(headers['user-agent'])?.[1];
		expect(uaMajor).toBeDefined();
		expect(headers['sec-ch-ua']).toContain(`"Google Chrome";v="${uaMajor}"`);
	});

	it('rejects a 404 page as a network error rather than returning its HTML', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockResolvedValue(
			mockResponse({
				status: 404,
				headers: { 'content-type': 'text/html' },
				body: '<html><body>Not found</body></html>'
			})
		);

		await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
			kind: 'network_error'
		});
	});

	it('rejects a response body larger than the configured limit', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockResolvedValue(
			mockResponse({ headers: { 'content-type': 'text/html' }, body: 'x'.repeat(20) })
		);

		await expect(safeFetchHtml('http://example.com', { maxBytes: 10 })).rejects.toMatchObject({
			kind: 'too_large'
		});
	});

	it('wraps a rejected fetch as a network error', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockRejectedValue(new Error('boom'));

		await expect(safeFetchHtml('http://example.com')).rejects.toMatchObject({
			kind: 'network_error'
		});
	});

	it('reports a timeout when the request is aborted', async () => {
		lookup.mockResolvedValue(PUBLIC);
		fetchMock.mockImplementation(
			(_input, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(new DOMException('The operation was aborted', 'AbortError'));
					});
				})
		);

		await expect(safeFetchHtml('http://example.com', { timeoutMs: 5 })).rejects.toMatchObject({
			kind: 'timeout'
		});
	});

	describe('E2E_SAFE_FETCH_ALLOW', () => {
		it('still blocks loopback when unset', async () => {
			lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
			await expect(safeFetchHtml('http://127.0.0.1:4100/page')).rejects.toMatchObject({
				kind: 'blocked_url'
			});
		});

		it('lets an exact host:port entry through the private-address check', async () => {
			env.E2E_SAFE_FETCH_ALLOW = '127.0.0.1:4100';
			lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
			fetchMock.mockResolvedValue(
				mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>ok</html>' })
			);

			const result = await safeFetchHtml('http://127.0.0.1:4100/page');
			expect(result.html).toBe('<html>ok</html>');
		});

		it('does not match a different port or host', async () => {
			env.E2E_SAFE_FETCH_ALLOW = '127.0.0.1:4100';
			lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
			await expect(safeFetchHtml('http://127.0.0.1:4101/page')).rejects.toMatchObject({
				kind: 'blocked_url'
			});
			await expect(safeFetchHtml('http://localhost:4100/page')).rejects.toMatchObject({
				kind: 'blocked_url'
			});
		});

		it('matches the default port when the entry names it explicitly', async () => {
			env.E2E_SAFE_FETCH_ALLOW = 'fixtures.test:80';
			lookup.mockResolvedValue([{ address: '10.0.0.2', family: 4 }]);
			fetchMock.mockResolvedValue(
				mockResponse({ headers: { 'content-type': 'text/html' }, body: '<html>ok</html>' })
			);
			await expect(safeFetchHtml('http://fixtures.test/page')).resolves.toBeDefined();
		});

		it('re-checks a redirect away from the allowlisted origin', async () => {
			env.E2E_SAFE_FETCH_ALLOW = '127.0.0.1:4100';
			lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
			fetchMock.mockResolvedValueOnce(
				mockResponse({ status: 302, headers: { location: 'http://127.0.0.1:5432/' } })
			);
			await expect(safeFetchHtml('http://127.0.0.1:4100/page')).rejects.toMatchObject({
				kind: 'blocked_url'
			});
		});
	});
});

describe('challenge markers', () => {
	it("treats Cloudflare's interstitial as a solvable challenge", () => {
		expect(hasSolvableChallengeMarkers('<title>Just a moment...</title>')).toBe(true);
	});

	it('treats hard blocks as challenges, but not solvable ones', () => {
		const cloudflareBlock = '<title>Attention Required! | Cloudflare</title>';
		const akamaiBlock = '<title>Access Denied</title>';
		for (const html of [cloudflareBlock, akamaiBlock]) {
			expect(hasBotChallengeMarkers(html)).toBe(true);
			expect(hasSolvableChallengeMarkers(html)).toBe(false);
		}
	});
});
