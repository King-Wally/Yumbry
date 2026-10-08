import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Unlike safe-fetch.spec.ts, this one keeps Bun's real `fetch` and a real server on loopback, so it
// covers the wiring the mocks can't: that the pinned request really lands where it was dialled, with
// the right Host, redirects, cookies, size cap and timeout. Loopback is what safe-fetch must refuse,
// so the server is let in through E2E_SAFE_FETCH_ALLOW. DNS is mocked only so that a `.invalid`
// hostname (which never resolves, RFC 6761) can be "resolved" to the server: a fetch that succeeds
// against it cannot have gone through real DNS.

const { lookup, env } = vi.hoisted(() => ({
	lookup: vi.fn(),
	env: { E2E_SAFE_FETCH_ALLOW: '' }
}));

vi.mock('node:dns', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:dns')>();
	return { ...actual, promises: { ...actual.promises, lookup } };
});
vi.mock('$app/env/private', () => ({
	get E2E_SAFE_FETCH_ALLOW() {
		return env.E2E_SAFE_FETCH_ALLOW;
	}
}));

const { safeFetchHtml } = await import('#lib/server/safe-fetch.ts');

let server: http.Server;
let port: number;
let baseUrl: string;
let handler: http.RequestListener;

beforeAll(async () => {
	server = http.createServer((req, res) => handler(req, res));
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	port = (server.address() as AddressInfo).port;
	baseUrl = `http://127.0.0.1:${port}`;
	env.E2E_SAFE_FETCH_ALLOW = `127.0.0.1:${port},pinned.invalid:${port}`;
});

afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
	lookup.mockReset();
	lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
});

describe('safeFetchHtml (real sockets, real Bun fetch)', () => {
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

	it('reaches a hostname only through the checked address, with the original Host', async () => {
		let seenHost: string | undefined;
		handler = (req, res) => {
			seenHost = req.headers.host;
			res.writeHead(200, { 'content-type': 'text/html' });
			res.end('<html>pinned</html>');
		};

		const result = await safeFetchHtml(`http://pinned.invalid:${port}/recipe`);

		expect(result.html).toBe('<html>pinned</html>');
		expect(result.finalUrl).toBe(`http://pinned.invalid:${port}/recipe`);
		expect(seenHost).toBe(`pinned.invalid:${port}`);
		expect(lookup).toHaveBeenCalledWith('pinned.invalid', { all: true });
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

	it('refuses a real redirect to a port that is not allowlisted', async () => {
		handler = (_req, res) => {
			res.writeHead(302, { location: 'http://127.0.0.1:1/' });
			res.end();
		};

		await expect(safeFetchHtml(`${baseUrl}/start`)).rejects.toMatchObject({
			kind: 'blocked_url'
		});
	});

	it('rejects a real non-HTML content-type', async () => {
		handler = (_req, res) => {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end('{}');
		};

		await expect(safeFetchHtml(`${baseUrl}/recipe`)).rejects.toMatchObject({
			kind: 'unsupported_content_type'
		});
	});

	it('rejects a real response body over maxBytes', async () => {
		handler = (_req, res) => {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.end('x'.repeat(1000));
		};

		await expect(safeFetchHtml(`${baseUrl}/recipe`, { maxBytes: 10 })).rejects.toMatchObject({
			kind: 'too_large'
		});
	});

	it('times out via the real AbortController wiring', async () => {
		handler = () => {
			// Never respond; the client should abort on its own timeout.
		};

		await expect(safeFetchHtml(`${baseUrl}/recipe`, { timeoutMs: 50 })).rejects.toMatchObject({
			kind: 'timeout'
		});
	});
});
