// Guards for the Node APIs and dependencies the server relies on Bun to run. Each block pins down a
// behaviour the app builds on, so a Bun or dependency upgrade that breaks one fails here rather
// than in production. Everything is
// hermetic: local servers on 127.0.0.1 and `.invalid` hostnames, which never resolve (RFC 6761), so
// a request that succeeds against one cannot have gone through DNS.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import OpenAI from 'openai';
import { chromium } from 'playwright-core';
import { Resend } from 'resend';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HOST = 'pinned.invalid';

function selfSignedCert(hostname: string): { key: Buffer; cert: Buffer } {
	const dir = mkdtempSync(path.join(tmpdir(), 'yumbry-runtime-'));
	try {
		execFileSync(
			'openssl',
			[
				'req',
				'-x509',
				'-newkey',
				'rsa:2048',
				'-nodes',
				'-days',
				'1',
				'-subj',
				`/CN=${hostname}`,
				'-addext',
				`subjectAltName=DNS:${hostname}`,
				'-keyout',
				path.join(dir, 'key.pem'),
				'-out',
				path.join(dir, 'cert.pem')
			],
			{ stdio: 'ignore' }
		);
		return {
			key: readFileSync(path.join(dir, 'key.pem')),
			cert: readFileSync(path.join(dir, 'cert.pem'))
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function listen(server: net.Server, host = '127.0.0.1'): Promise<number> {
	await new Promise<void>((resolve) => server.listen(0, host, resolve));
	return (server.address() as net.AddressInfo).port;
}

function close(server: http.Server | https.Server): Promise<void> {
	server.closeAllConnections();
	return new Promise((resolve) => server.close(() => resolve()));
}

/** Replies with what the server saw, so a test can tell where a request really landed. */
function echo(req: http.IncomingMessage, res: http.ServerResponse) {
	if (req.url === '/redirect') {
		res.setHeader('set-cookie', ['a=1; Path=/', 'b=2; Path=/']);
		res.writeHead(302, { location: 'http://elsewhere.invalid/next' }).end();
		return;
	}
	if (req.url === '/large') {
		res.setHeader('content-type', 'text/html');
		let sent = 0;
		const chunk = Buffer.alloc(64 * 1024, 'x');
		const pump = () => {
			while (sent < 4 * 1024 * 1024) {
				sent += chunk.length;
				if (!res.write(chunk)) return void res.once('drain', pump);
			}
			res.end();
		};
		pump();
		return;
	}
	res.setHeader('content-type', 'text/html');
	res.end(
		JSON.stringify({
			host: req.headers.host,
			sni: (req.socket as tls.TLSSocket).servername ?? null,
			proxyAuth: req.headers['proxy-authorization'] ?? null
		})
	);
}

/** The pinning recipe safe-fetch.ts uses: dial the checked address, and carry the hostname in the
 * Host header and (for https) in SNI, where Bun also verifies the certificate against it. */
function pinnedFetch(url: URL, address: string, init: RequestInit & { ca?: Buffer } = {}) {
	const { ca, ...rest } = init;
	const dial = new URL(url);
	dial.hostname = net.isIPv6(address) ? `[${address}]` : address;
	return fetch(dial, {
		...rest,
		headers: { ...rest.headers, host: url.host },
		tls: url.protocol === 'https:' ? { serverName: url.hostname, ...(ca ? { ca } : {}) } : undefined
	});
}

it('runs on Bun, not Node', () => {
	// Every guard below is meaningless if `bun --bun vitest` ever stops running tests on Bun.
	expect(process.versions.bun).toBeTruthy();
});

let cert: { key: Buffer; cert: Buffer };
let httpServer: http.Server;
let httpsServer: https.Server;
let httpPort: number;
let httpsPort: number;

beforeAll(async () => {
	cert = selfSignedCert(HOST);
	httpServer = http.createServer(echo);
	httpsServer = https.createServer(cert, echo);
	httpPort = await listen(httpServer);
	httpsPort = await listen(httpsServer);
});

afterAll(async () => {
	await close(httpServer);
	await close(httpsServer);
});

describe('sharp', () => {
	it('straightens, bounds and re-encodes a JPEG as WebP without metadata', async () => {
		const jpeg = await sharp({
			create: { width: 400, height: 200, channels: 3, background: '#c33' }
		})
			.jpeg()
			.withMetadata({ orientation: 6 })
			.toBuffer();

		const webp = await sharp(jpeg)
			.rotate()
			.resize({ width: 100, height: 100, fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 80 })
			.toBuffer();

		expect(webp.subarray(0, 4).toString()).toBe('RIFF');
		expect(webp.subarray(8, 12).toString()).toBe('WEBP');
		const meta = await sharp(webp).metadata();
		expect([meta.width, meta.height]).toEqual([50, 100]);
		expect(meta.exif).toBeUndefined();
	});

	it('rejects bytes that are not an image', async () => {
		await expect(sharp(Buffer.from('not an image')).rotate().webp().toBuffer()).rejects.toThrow();
	});
});

describe('DNS pinning', () => {
	it("canary: Bun's built-in undici ignores a custom connect.lookup", async () => {
		// On Bun, `undici` is a built-in shim that wins even over an installed npm copy, and its
		// Agent is an empty stub: the request resolves the hostname itself, so an Agent can't pin
		// DNS. If this ever starts passing the lookup through, an Agent becomes an option.
		const specifier = 'undici';
		const undici = await import(/* @vite-ignore */ specifier);
		let lookupCalled = false;
		const agent = new undici.Agent({
			connect: {
				lookup: (
					_hostname: string,
					_options: unknown,
					callback: (err: null, address: string, family: number) => void
				) => {
					lookupCalled = true;
					callback(null, '127.0.0.1', 4);
				}
			}
		});
		await expect(
			undici.fetch(`http://${HOST}:${httpPort}/`, { dispatcher: agent })
		).rejects.toThrow();
		expect(lookupCalled).toBe(false);
	});

	it('reaches the pinned address over http, with the original Host', async () => {
		const res = await pinnedFetch(new URL(`http://${HOST}:${httpPort}/`), '127.0.0.1');
		expect(await res.json()).toMatchObject({ host: `${HOST}:${httpPort}` });
	});

	it('sends SNI and verifies the certificate against the hostname over https', async () => {
		const res = await pinnedFetch(new URL(`https://${HOST}:${httpsPort}/`), '127.0.0.1', {
			ca: cert.cert
		});
		expect(await res.json()).toMatchObject({ host: `${HOST}:${httpsPort}`, sni: HOST });
	});

	it('rejects a certificate that does not match the hostname', async () => {
		await expect(
			pinnedFetch(new URL(`https://other.invalid:${httpsPort}/`), '127.0.0.1', { ca: cert.cert })
		).rejects.toThrow();
	});

	it('still verifies the chain when pinned', async () => {
		await expect(
			pinnedFetch(new URL(`https://${HOST}:${httpsPort}/`), '127.0.0.1')
		).rejects.toThrow();
	});

	it('hands back redirects and every Set-Cookie for the caller to re-check', async () => {
		const res = await pinnedFetch(new URL(`https://${HOST}:${httpsPort}/redirect`), '127.0.0.1', {
			ca: cert.cert,
			redirect: 'manual'
		});
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('http://elsewhere.invalid/next');
		expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
	});

	it('streams the body so a size cap can stop mid-download', async () => {
		const res = await pinnedFetch(new URL(`http://${HOST}:${httpPort}/large`), '127.0.0.1');
		const reader = res.body!.getReader();
		let total = 0;
		while (total <= 256 * 1024) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
		}
		await reader.cancel();
		expect(total).toBeGreaterThan(256 * 1024);
		expect(total).toBeLessThan(4 * 1024 * 1024);
	});
});

const PROXY_AUTH = `Basic ${Buffer.from('yumbry:secret').toString('base64')}`;

/** The shape of ssrf-proxy.ts, dialling by IP. A `lookup` callback is no use here: Bun's node:http
 * calls it with `all: true`, so one answering a single (address, family) pair fails. */
function startProxy(seen: string[]): http.Server {
	const proxy = http.createServer((req, res) => {
		seen.push(`${req.method} ${req.url}`);
		if (req.headers['proxy-authorization'] !== PROXY_AUTH) {
			res.writeHead(407, { 'proxy-authenticate': 'Basic realm="yumbry"' }).end();
			return;
		}
		const target = new URL(req.url ?? '');
		const headers = { ...req.headers };
		delete headers['proxy-authorization'];
		delete headers['proxy-connection'];
		const upstream = http.request(
			{
				host: '127.0.0.1',
				port: target.port,
				path: `${target.pathname}${target.search}`,
				method: req.method,
				headers
			},
			(upstreamRes) => {
				res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
				upstreamRes.pipe(res);
			}
		);
		upstream.on('error', () => res.writeHead(502).end());
		req.pipe(upstream);
	});
	proxy.on('connect', (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
		seen.push(`CONNECT ${req.url}`);
		socket.on('error', () => socket.destroy());
		if (req.headers['proxy-authorization'] !== PROXY_AUTH) {
			socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
			return;
		}
		const port = Number(new URL(`https://${req.url}`).port || 443);
		const upstream = net.connect(port, '127.0.0.1', () => {
			socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
			if (head.length > 0) upstream.write(head);
			upstream.pipe(socket);
			socket.pipe(upstream);
		});
		upstream.on('error', () => socket.destroy());
	});
	return proxy;
}

/** Sends raw bytes to the proxy and collects everything it answers until it closes. */
function rawExchange(port: number, payload: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = net.connect(port, '127.0.0.1', () => socket.write(payload));
		let reply = '';
		socket.on('data', (data) => (reply += data));
		socket.on('end', () => resolve(reply));
		socket.on('error', reject);
	});
}

describe('node:http forward proxy', () => {
	const seen: string[] = [];
	let proxy: http.Server;
	let proxyPort: number;

	beforeAll(async () => {
		proxy = startProxy(seen);
		proxyPort = await listen(proxy);
	});
	afterAll(() => close(proxy));

	it('refuses CONNECT and plain requests without credentials', async () => {
		const connect = await rawExchange(
			proxyPort,
			`CONNECT ${HOST}:${httpsPort} HTTP/1.1\r\nHost: ${HOST}:${httpsPort}\r\n\r\n`
		);
		const plain = await rawExchange(
			proxyPort,
			`GET http://${HOST}:${httpPort}/ HTTP/1.1\r\nHost: ${HOST}:${httpPort}\r\nConnection: close\r\n\r\n`
		);
		expect(connect).toMatch(/^HTTP\/1\.1 407/);
		expect(plain).toMatch(/^HTTP\/1\.1 407/);
	});

	it('forwards a plain-HTTP request to the pinned address without the proxy credentials', async () => {
		const reply = await rawExchange(
			proxyPort,
			`GET http://${HOST}:${httpPort}/ HTTP/1.1\r\nHost: ${HOST}:${httpPort}\r\nProxy-Authorization: ${PROXY_AUTH}\r\nConnection: close\r\n\r\n`
		);
		expect(reply).toMatch(/^HTTP\/1\.1 200/);
		expect(JSON.parse(reply.slice(reply.indexOf('\r\n\r\n') + 4))).toEqual({
			host: `${HOST}:${httpPort}`,
			sni: null,
			proxyAuth: null
		});
	});

	it('tunnels CONNECT with TLS end-to-end', async () => {
		const body = await new Promise<string>((resolve, reject) => {
			const socket = net.connect(proxyPort, '127.0.0.1', () =>
				socket.write(
					`CONNECT ${HOST}:${httpsPort} HTTP/1.1\r\nHost: ${HOST}:${httpsPort}\r\nProxy-Authorization: ${PROXY_AUTH}\r\n\r\n`
				)
			);
			socket.on('error', reject);
			socket.once('data', (established) => {
				if (!established.toString().startsWith('HTTP/1.1 200')) return reject(new Error('refused'));
				const secure = tls.connect({ socket, servername: HOST, ca: cert.cert }, () =>
					secure.write(`GET / HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\n\r\n`)
				);
				let reply = '';
				secure.on('data', (data: Buffer) => (reply += data));
				secure.on('end', () => resolve(reply.slice(reply.indexOf('\r\n\r\n') + 4)));
				secure.on('error', reject);
			});
		});
		expect(JSON.parse(body)).toMatchObject({ host: HOST, sni: HOST });
	});

	it('passes bytes sent along with the CONNECT (head) through the tunnel', async () => {
		const reply = await rawExchange(
			proxyPort,
			`CONNECT ${HOST}:${httpPort} HTTP/1.1\r\nProxy-Authorization: ${PROXY_AUTH}\r\n\r\n` +
				`GET / HTTP/1.1\r\nHost: tunnelled.invalid\r\nConnection: close\r\n\r\n`
		);
		expect(reply).toContain('"host":"tunnelled.invalid"');
	});
});

describe.skipIf(!process.env.BROWSER_CDP_URL)('playwright-core over CDP', () => {
	// The browser may run in Docker, so the proxy listens on all interfaces and is advertised at
	// BROWSER_PROXY_HOST (host.docker.internal for `docker run` on macOS).
	const seen: string[] = [];
	let proxy: http.Server;
	let proxyPort: number;

	beforeAll(async () => {
		proxy = startProxy(seen);
		proxyPort = await listen(proxy, '0.0.0.0');
	});
	afterAll(() => close(proxy));

	it(
		'loads pages through an authenticated proxy set on the context',
		{ timeout: 30_000 },
		async () => {
			const browser = await chromium.connectOverCDP(process.env.BROWSER_CDP_URL!, {
				timeout: 10_000
			});
			const context = await browser.newContext({
				viewport: null,
				serviceWorkers: 'block',
				// The fixture's certificate is self-signed; real fetches keep verification on.
				ignoreHTTPSErrors: true,
				proxy: {
					server: `http://${process.env.BROWSER_PROXY_HOST || '127.0.0.1'}:${proxyPort}`,
					username: 'yumbry',
					password: 'secret'
				}
			});
			try {
				const page = await context.newPage();
				await page.goto(`http://${HOST}:${httpPort}/`, { waitUntil: 'domcontentloaded' });
				expect(await page.textContent('body')).toContain(`"host":"${HOST}:${httpPort}"`);
				await page.goto(`https://${HOST}:${httpsPort}/`, { waitUntil: 'domcontentloaded' });
				expect(await page.textContent('body')).toContain(`"sni":"${HOST}"`);
			} finally {
				await context.close();
				// Only disconnects: the shared browser must outlive each fetch.
				await browser.close();
			}
			expect(seen).toContain(`GET http://${HOST}:${httpPort}/`);
			expect(seen).toContain(`CONNECT ${HOST}:${httpsPort}`);

			const again = await chromium.connectOverCDP(process.env.BROWSER_CDP_URL!);
			expect(again.isConnected()).toBe(true);
			await again.close();
		}
	);
});

describe('HTTP SDKs against a fake', () => {
	const requests: { method: string; path: string; auth: string | null }[] = [];
	let fake: ReturnType<typeof Bun.serve>;
	let base: string;

	beforeAll(() => {
		fake = Bun.serve({
			port: 0,
			hostname: '127.0.0.1',
			fetch(req) {
				const { pathname } = new URL(req.url);
				requests.push({
					method: req.method,
					path: pathname,
					auth: req.headers.get('authorization')
				});
				if (pathname === '/openrouter/chat/completions') {
					return Response.json({
						id: 'chat-1',
						object: 'chat.completion',
						created: 0,
						model: 'fake',
						choices: [
							{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'hi' } }
						],
						usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0.0012 }
					});
				}
				if (pathname === '/resend/emails') return Response.json({ id: 'email-1' });
				return new Response('not found', { status: 404 });
			}
		});
		base = `http://127.0.0.1:${fake.port}`;
	});
	afterAll(() => fake.stop(true));

	it('openai talks to a custom baseURL and keeps OpenRouter usage.cost', async () => {
		const client = new OpenAI({ baseURL: `${base}/openrouter`, apiKey: 'key', maxRetries: 0 });
		const completion = await client.chat.completions.create({
			model: 'fake',
			messages: [{ role: 'user', content: 'hello' }]
		});
		expect(completion.choices[0].message.content).toBe('hi');
		expect((completion.usage as { cost?: number }).cost).toBe(0.0012);
		expect(requests).toContainEqual({
			method: 'POST',
			path: '/openrouter/chat/completions',
			auth: 'Bearer key'
		});
	});

	it('openai maps HTTP and connection failures to its error classes', async () => {
		const missing = new OpenAI({ baseURL: `${base}/missing`, apiKey: 'key', maxRetries: 0 });
		await expect(
			missing.chat.completions.create({ model: 'fake', messages: [] })
		).rejects.toBeInstanceOf(OpenAI.NotFoundError);
		const down = new OpenAI({ baseURL: 'http://127.0.0.1:1', apiKey: 'key', maxRetries: 0 });
		await expect(
			down.chat.completions.create({ model: 'fake', messages: [] })
		).rejects.toBeInstanceOf(OpenAI.APIConnectionError);
	});

	it('resend sends through RESEND_BASE_URL, read when the client is constructed', async () => {
		const previous = process.env.RESEND_BASE_URL;
		process.env.RESEND_BASE_URL = `${base}/resend`;
		try {
			const { data, error } = await new Resend('re_key').emails.send({
				from: 'a@example.invalid',
				to: 'b@example.invalid',
				subject: 'subject',
				text: 'text'
			});
			expect(error).toBeNull();
			expect(data).toEqual({ id: 'email-1' });
			expect(requests).toContainEqual({
				method: 'POST',
				path: '/resend/emails',
				auth: 'Bearer re_key'
			});
		} finally {
			if (previous === undefined) delete process.env.RESEND_BASE_URL;
			else process.env.RESEND_BASE_URL = previous;
		}
	});
});
