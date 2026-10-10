import http from 'node:http';
import net from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Real sockets on loopback: an origin server plus the proxy. Loopback is exactly what the proxy must
// refuse, so the "allowed" cases opt the origin in through E2E_SAFE_FETCH_ALLOW. Lookups are real:
// `127.0.0.1` resolves to itself, and `pinned.invalid` (RFC 6761) is mocked to it, so a forward
// that reaches the origin under that name proves the proxy dialled the checked address.

const { env } = vi.hoisted(() => ({ env: { E2E_SAFE_FETCH_ALLOW: '' } }));

vi.mock('node:dns', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:dns')>();
	return {
		...actual,
		promises: {
			...actual.promises,
			lookup: (hostname: string, options: object) =>
				hostname === 'pinned.invalid'
					? Promise.resolve([{ address: '127.0.0.1', family: 4 }])
					: actual.promises.lookup(hostname, options)
		}
	};
});
vi.mock('$app/env/private', () => ({
	get E2E_SAFE_FETCH_ALLOW() {
		return env.E2E_SAFE_FETCH_ALLOW;
	}
}));

const { startSsrfProxy } = await import('#lib/server/url-import/ssrf-proxy.ts');
type SsrfProxy = Awaited<ReturnType<typeof startSsrfProxy>>;

let origin: http.Server;
let originPort: number;
let proxy: SsrfProxy;
let lastOriginHeaders: http.IncomingHttpHeaders = {};

function proxyPort(): number {
	return Number(new URL(proxy.server).port);
}

function authHeader(username = proxy.username, password = proxy.password): string {
	return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/** A plain-HTTP request through the proxy (absolute-form request target). */
function proxiedGet(target: string, auth?: string): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: '127.0.0.1',
				port: proxyPort(),
				path: target,
				headers: {
					host: new URL(target).host,
					...(auth ? { 'proxy-authorization': auth } : {})
				}
			},
			(res) => {
				let body = '';
				res.on('data', (chunk) => (body += chunk));
				res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
			}
		);
		req.on('error', reject);
		req.end();
	});
}

/** Sends a CONNECT and returns the proxy's status line. */
function connectStatus(authority: string, auth?: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = net.connect(proxyPort(), '127.0.0.1', () => {
			socket.write(
				`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n` +
					(auth ? `Proxy-Authorization: ${auth}\r\n` : '') +
					'\r\n'
			);
		});
		socket.once('data', (chunk) => {
			resolve(chunk.toString().split('\r\n')[0]);
			socket.destroy();
		});
		socket.on('error', reject);
	});
}

beforeAll(async () => {
	origin = http.createServer((req, res) => {
		lastOriginHeaders = req.headers;
		res.end('hello from origin');
	});
	await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
	originPort = (origin.address() as net.AddressInfo).port;
	proxy = await startSsrfProxy('127.0.0.1');
});

afterAll(async () => {
	await proxy.close();
	origin.closeAllConnections();
	await new Promise((resolve) => origin.close(resolve));
});

afterEach(() => {
	env.E2E_SAFE_FETCH_ALLOW = '';
});

describe('startSsrfProxy', () => {
	it('demands credentials', async () => {
		const res = await proxiedGet(`http://127.0.0.1:${originPort}/`);
		expect(res.status).toBe(407);
		expect(await connectStatus(`127.0.0.1:${originPort}`)).toContain('407');
	});

	it('rejects wrong credentials', async () => {
		const res = await proxiedGet(`http://127.0.0.1:${originPort}/`, authHeader('yumbry', 'nope'));
		expect(res.status).toBe(407);
		expect(await connectStatus(`127.0.0.1:${originPort}`, authHeader('yumbry', 'nope'))).toContain(
			'407'
		);
	});

	it('refuses to forward to a loopback or private address', async () => {
		const res = await proxiedGet(`http://127.0.0.1:${originPort}/`, authHeader());
		expect(res.status).toBe(403);
		expect(res.body).not.toContain('hello from origin');
		expect(await connectStatus(`127.0.0.1:${originPort}`, authHeader())).toContain('403');
		expect(await connectStatus('10.0.0.1:443', authHeader())).toContain('403');
	});

	it('forwards plain HTTP and opens tunnels to an allowed target', async () => {
		env.E2E_SAFE_FETCH_ALLOW = `127.0.0.1:${originPort}`;

		const res = await proxiedGet(`http://127.0.0.1:${originPort}/`, authHeader());
		expect(res).toEqual({ status: 200, body: 'hello from origin' });
		expect(await connectStatus(`127.0.0.1:${originPort}`, authHeader())).toContain('200');
	});

	it('dials the checked address, keeping Host and dropping the proxy credentials', async () => {
		env.E2E_SAFE_FETCH_ALLOW = `pinned.invalid:${originPort}`;

		const res = await proxiedGet(`http://pinned.invalid:${originPort}/`, authHeader());
		expect(res).toEqual({ status: 200, body: 'hello from origin' });
		expect(lastOriginHeaders.host).toBe(`pinned.invalid:${originPort}`);
		expect(lastOriginHeaders['proxy-authorization']).toBeUndefined();
		expect(await connectStatus(`pinned.invalid:${originPort}`, authHeader())).toContain('200');
	});
});
